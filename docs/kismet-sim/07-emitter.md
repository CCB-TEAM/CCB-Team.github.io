---
title: 07 · 发射器与运行时：实现特性
---

# 07 · 发射器与运行时：实现特性

[06](/kismet-sim/06-hooks) 讲了缝切在哪；这一章讲**改发射器的时候，哪些东西会静默错**。

先说产物长什么样，后面所有"特性"都对着它看：

```csharp
// Generated/.../card_unit_xxx.g.cs（示意，实际是机器生成的）
public static Val OnEnterPlay(IHost H, Val self, Val[] args)
{
    var L = new Dictionary<string, Val>(StringComparer.Ordinal);
    BindParams(L, args);                      // Kismet 形参也是局部槽
    L["__ef"] = Val.Ref(new Stack<int>());     // 执行流栈
    var obj = self.As<KObj>();
    L["x"] = GetLocal(L, "x");                 // 零初始化读
    if (!GetLocal(L, "cond").AsBool()) goto L_0A23;
    H.Call("ChangeAttack", new Val[] { self, Val.Of(2), Val.Out(GetLocal(L, "x"), v => L["x"] = v) });
L_0A23:
    return Val.Nothing;
}
```

## 特性 1：`out` 形参在 UE 里是 **in-out**

这是整个项目最贵的一课。

UE 的 Kismet 把**调用方求值后的实参送进被调帧**：被调函数**能读到**调用方传进来的值，
`out` 只表示"退出时还要写回"。所以发射形态必须两边都给：

```csharp
// 旧形态：调用方不传值，退出时回调写回 —— 只写不读时是对的，一读就错
H.Call("Foo", new Val[] { recv, Val.Out(v => L["x"] = v) });   // ✗

// 现形态：把当前值一起送进去，回调负责写回
H.Call("Foo", new Val[] { recv, Val.Out(GetLocal(L, "x"), v => L["x"] = v) });   // ✓
```

凡是"把 out 形参当输入读"的函数，旧形态下全是**空操作**：不报错、不进未实现清单、
`smoke` 与自对弈全绿。实测修掉 **48 处 / 40 个函数**，影响对局的包括：

| 函数 | 修好前的行为 |
|---|---|
| `GetRandomCard(cards)` | 所有"随机一个敌方单位"类效果返回空 |
| `ApplyMakeCardRetreat(cards)` | "把单位退回手牌"什么也不做 |
| `ApplySetCardsSeenByCipher(card)` | Intel 翻牌链断掉 |
| `AttackCard` / `ApplyDestroyMultipleCards` | 攻击、批量摧毁的分派空转 |
| `SortCardsByLocationNumber` / `GetNewLocationNumbers` | 撤退时的位置重排丢掉 |
| `CanAttack(cardsInAttackedLocation)` | 规则库里"未明牌 Covert"那一段循环不执行 |

::: tip 通用结论
**"参数是 in 还是 out"不是类型系统的问题，是调用约定的问题。**
目标语言的 `out` 语义（只写不读）和源语言（in-out）不一致时，
任何"只看其中一个通道"的翻译都会静默错，而且只在"读了"的调用点上现形。
:::

## 特性 2：out / in 判定要做多级回退，并且**把结果固化进仓库**

判"这个形参是不是 out"没有任何单一权威来源，所以做成了多级回退：

| 级 | 来源 | 覆盖 |
|---|---|---|
| 1 | 声明资产自己的 `FunctionExport.LoadedProperties`（`CPF_OutParm` / `CPF_ConstParm`） | 最权威，但只管本资产 |
| 2 | 跨资产蓝图扫描，按函数名索引 | `EX_LocalVirtualFunction` 只带名字、不带包索引 |
| 2d | **从已入库产物反推**（`CommittedOutParams`） | 依赖资产缺失时的兜底（见下） |
| 3 | UHT 头文件 `T&` vs `const T&` | 引擎库 |
| 4 | 手写的引擎库参数表 | 最后兜底 |

2d 这一级的来历值得记：

重新生成需要 `--sigdeps` 指向 `BP_GameState_Battle` / `Library/*` —— 这些 uasset
**可能不在手边**。资产一缺，`GameStateRef.<谓词>(out x)` 这一族就判不出 out，
实参被当成 in，被调方写不回来 —— 整条效果静默失效。

::: danger 最阴的一次
`GetAllCardInBattle` 丢了 `Val.Out` 之后，"场上所有卡"返回空 →
**光环类效果再也撤不掉**（`OnLeaveBoardOrOwner` 遍历不到任何卡）。
症状是"单位死了，它给的 +2 还挂着"，离"发射器写错"隔了十万八千里。
:::

修法不是"下次注意"，而是**把已入库产物的分类结果扫出来固化成表**
（`(函数名, 形参个数) → 修饰`，95 个键、零冲突），只在签名查不到时才用。
这样"资产齐全时生成的那份产物"就成了可回归的基准。

::: tip 通用结论
**转译器的"判定结果"本身要入库。**
判定依赖外部输入（依赖资产的可用性）时，重新生成会**整体漂移**，
而漂移是静默的：能编译、能跑、数字错。
:::

## 特性 3：容器型 out 形参要先补空容器

Kismet 里往 out 数组 append 是常见写法（`Array_Add(out arr, x)`）。
目标语言里那是"对 null 调用方法"，所以调用前要保证容器存在：

```csharp
// 只在调用方确实没给值时才补（给了值就必须保留，否则把调用方的数据冲掉）
if (L["x"].IsNothing) L["x"] = H.MakeArray(new Val[] { });
```

顺序错了就出事：如果无条件重置成空数组，
`SortCardsByLocationNumber` / `GetNewLocationNumbers` 这类"把结果 append 进来"的函数
会把调用方已有的数据冲掉，撤退时的位置重排全丢。

## 特性 4：局部槽必须零初始化

Kismet 的局部槽是零初始化的，C# 字典不是 —— 直读 `L["x"]` 会抛 `KeyNotFoundException`。
所以发射的是 `GetLocal(L, "x")`（`EX_LocalVariable` 与 `EX_LocalOutVariable` 都走它）：

```csharp
private static Val GetLocal(Dictionary<string, Val> L, string n)
    => L.TryGetValue(n, out var v) ? v : Val.Nothing;
```

典型触发场景：循环体首次进入时读 `Array_Get` 的 out 槽 ——
数组为空时那次调用根本没执行过，槽从没被写入。

## 特性 5：有些 AST 节点"看起来像值，其实是位置"

| 节点 | 坑 | 发射成 |
|---|---|---|
| `EX_TextConst` | `ToString()` 得到的是类型名，不是文本 | 按 `TextLiteralType` 分支解包 |
| `SetArray` / `SetSet` / `SetMap` 的属性 | 它是**赋值目标**，当右值发射会 `CS0131` | 走 `Assign`，不走进表达式 |
| `EX_ComputedJump` | 是块边界，不能当普通顺序语句 | 用 label 表 + `switch` 承载 |

判断标准很简单：**凡是"看起来像字面量/变量、其实有内部结构"的节点，都不能直接 `ToString()`。**

## 特性 6：执行流栈照搬即可，但下溢要 halt

`EX_PushExecutionFlow` / `EX_PopExecutionFlow` 不用猜语义，压栈目标是编译期常量：

```csharp
__ef.Push(2720);            // EX_PushExecutionFlow
switch (__ef.Pop()) { case 2720: goto L_0AA0; default: goto __halt; }
```

栈下溢时**记日志并 halt**，不要静默继续 —— 那会跑出完全没有意义的行为，
而且后面每一行都在错误的执行流里。

## 特性 7：两个诊断产物不要覆盖

`Generated/` 里有两个是**诊断/索引**产物，重新生成时应当保留：

| 文件 | 作用 |
|---|---|
| `_index.g.cs` | 函数索引（`FnIndex`）：资产 → 事件名 → 委托，宿主靠它找函数 |
| `_transpile-report.txt` | 转译报告：空体、未支持节点、形状异常的清单 |

而且**目录本身是签名来源的一部分**。所以推荐的重新生成姿势是：

```bash
# 1. 生成到临时目录（不要直接覆盖 Generated/）
KardsTranspiler --in <Cards> --usmap <m.usmap> --sigdeps <依赖蓝图> --out /tmp/gen
# 2. 比对差异，确认变化符合预期（尤其是 out/in 分类与空体数量）
# 3. 除上面两个诊断产物外整体覆盖
# 4. 编译 + 跑回归（见下一节），而不是"编译通过就算完"
```

## 运行时特性：四个必须按"来源"记的地方

### A. 攻击加成要按来源记账

同一张卡可能被多个来源各加一次。用一个数字做加/减，撤销时必然算错：

```csharp
card.AttackBuffBySource[来源] = 增量;      // 按来源记
// 写镜像时求和；某个来源撤销只删它自己那一格
```

镜像侧的两个查询参数布局是**反直觉**的，写反了就是"加成找得到、撤销找不到"：
`isBuffedByCard` 的 `a[0]` 是**被加成的卡**、`a[1]` 是**来源**。

### B. "本回合 +N"按来源清账，不按变更类型

临时加成靠 `AddBuffsToRemoveEndOfTurn(来源, 卡)` 登记，回合结束逐个来源撤销。

::: danger 按 changeType 分类撤销会漏
同一张卡被两个来源各加一次时，按类型撤销只能删一次，
表现是「本回合 +N」变成**永久 +N**。
:::

而且清账要覆盖**全场所有位置**：被临时加攻的牌可能已经退回手牌或进了弃牌堆，
只清场上会留下脏值，它再被打出来时带着不该有的加成。

### C. 事件时机：部署 ≠ 移动

客户端只在 `MoveUnitFromSupportToFrontLine` 里发 `OnMoveToFrontline`，
部署是另一条路（`OnEnterPlay`）。引擎在部署时顺手也发一次移动事件，
结果是光环加成**翻倍**（+2 变 +4）。

同理，`OnLeaveBoardOrOwner` 必须在**卡还在场上**的时候发
（在 `DestroyCard` 置 `Destroyed = true` 之前）—— 否则光环回头找不到自己加过谁，撤不掉。

### D. 效果驱动的位移：只补蓝图不覆盖的分支

蓝图里"把卡搬走"的入口有一批，但无头模拟里只有一部分能走通。
补的时候要克制：

- 屏幕内的行间移动（前线 ↔ 支援线）：引擎改列表 + 重排编号，**不要补发**移动事件
  （BP 那边已经 dispatch 过 `OnMoveFromFrontline` 了）。
- 场上 → 场外（回手牌 / 洗回牌库 / 弃牌）：**不要补发**离场事件
  （`MoveCardFromBoardToOwnersHand` 自己会 dispatch `ExecuteOnBefore/AfterLeaveBoardOrOwnerEvents`）。
- 场外 → 场上（出牌 / 生成）：**直接返回"不处理"**，交给引擎自己的放置流程。

重复发事件的效果和"漏发"一样糟，只是方向相反。

### E. 容错必须可观测

宿主对不认识的函数返回 `Val.Nothing` 继续跑 —— 这是必需的（否则一张卡能带崩整局），
但也是所有静默错误的放大器。所以每一项容错都留了痕：

| 机制 | 作用 |
|---|---|
| 未实现调用登记（函数名 + 次数） | 用它区分"真的缺实现"和"这张卡没实现该事件" |
| 同名调用深度 > 8 截断 | 转发壳死循环的纵深防御（栈溢出会直接带走进程） |
| 单次效果调用预算 20 万 | 依赖外部数据的循环在无头环境里死循环 → 抛异常中断并记账 |
| 已知资产函数名集合 | 只有"名字压根不是任何蓝图函数"才算缺口，否则会被噪声淹没 |

## 改完发射器的回归清单

| 检查 | 期望 |
|---|---|
| `--mode byref` | **0**（"零初始化的 out 槽 + 函数体里先读"的缺口数） |
| `--mode tests` | 全绿（含"随机目标真的取得到牌""光环加/撤""撤退真的动了列表"这类断言） |
| `--mode smoke` | 逐卡强制演练：0 异常 / 0 未实现调用 |
| `--mode apicheck` | 卡牌逻辑可达的缺口 **0** |
| 自对弈 | 0 非法 / 0 卡死 / 0 异常，未实现调用 **0%** |
| 与旧产物 diff | 变化必须能解释：改了分类？改了节点？**不能"看起来变了但说不上为什么"** |

---

## 三条通用原则（和 [05](/kismet-sim/05-pitfalls) 呼应）

1. **源语言的语义差异要显式补齐**：局部槽零初始化、`out` 是 in-out、
   文本常量是结构体、属性可以是赋值目标 —— 全都会"编译通过、结果是错的"。
2. **判定结果要固化进仓库**：分类依赖外部输入时，重新生成会静默漂移。
3. **容错必须可观测**：所有"静默继续"的地方都要记账，并且把记账接入审计与回归。

---

相关：[02 · 架构与调用约定](/kismet-sim/02-calling-convention) ·
[05 · 坑与复盘](/kismet-sim/05-pitfalls) ·
[06 · 推荐 hook 点](/kismet-sim/06-hooks) ·
[KardsSim 项目页](/projects/kardsim)
