---
title: 05 · 罕见之处
---

# 05 · 罕见之处

这一章是本专题存在的理由：**蓝图逆向之所以冷门，不是因为难，而是因为「通用」几乎不存在**。
下面每一条都有实证。

## 一、厂商会往操作码空档里塞自己的指令

`EExprToken` 枚举结束于 `EX_Max = 0x100`，但公开源码里最后一个是 `EX_ArrayGetByRef = 0x6B`。
**0x6C 到 0xFF 之间是一大片没人用的空档**——而游戏厂商就往这里塞东西。

CUE4Parse 为每个这样的游戏单独写了表达式类。看两个真实例子：

**鸣潮（WuWa）**：

```csharp
public class EX_WuWaInstr1(FKismetArchive Ar) : KismetExpression
{
    public override EExprToken Token => EExprToken.EX_6E;   // ← 0x6E，官方表里没有

    public FVector Pos1 = Ar.Read<FVector>();
    public FVector Pos2 = Ar.Read<FVector>();
}
```

**Borderlands 4**：

```csharp
public class EX_GbxDefPtr : KismetExpression<FGbxDefPtr>
{
    public override EExprToken Token => EExprToken.EX_FD;   // ← 0xFD
    // ...
}

public class EX_GameDataHandle : KismetExpression<FGameDataHandle>
{
    public override EExprToken Token => EExprToken.EX_FE;   // ← 0xFE
    // ...
}
```

（依次出自
[`WuWaKismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/WuWa/Kismet/WuWaKismetExpression.cs) 与
[`Borderlands4KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/Borderlands4/Kismet/Borderlands4KismetExpression.cs)）

CUE4Parse 为此维护了 `GameTypes/{2XKO, Borderlands4, DFHO, WuWa}/Kismet/` 四套专用实现
（GitHub API 列目录实测）。

::: warning 这意味着什么
**一个不认识 0x6E 的解析器，读到鸣潮的蓝图就会当场错位**——它会把 0x6E 当成未知 token，
后续字节全乱，而且**很可能不报错**，只是解析出一堆垃圾。

这也是为什么「写一个通用蓝图反编译器」这个目标本身就不现实：
**你不是在写一个格式解析器，你是在写 N 个格式解析器。**
:::

## 二、操作码表本身也在增长

对比两边的枚举能看出增量：

| 取值 | UE4 公开源码 `Script.h` | UAssetAPI 的 UE5 侧枚举 |
|---|---|---|
| `EX_NothingInt32` 0x0C | ✗ 没有 | ✓ 有 |
| `EX_BitFieldConst` 0x11 | ✗ 没有 | ✓ 有 |

（左列：[`Script.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Script.h)；
右列：[`UAssetAPI/Kismet/Bytecode/EExprToken.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/EExprToken.cs)）

**解析器必须有「未知 token」的处理策略**：报错、跳过（如果长度可算）、还是猜。
三者都会出错，区别只是错得明不明显。

## 三、属性引用在 4.25 换过一次表示法

字节码里引用属性用的是 `FKismetPropertyPointer`，UE 4.25 前后完全不同：

```csharp
if (Ar.Game >= GAME_UE4_25 || Ar.Game is GAME_AssaultFireFuture)
    New = new FFieldPath(Ar);        // 4.25+
else
    Old = new FPackageIndex(Ar);     // 4.25 之前
```

（出自 [`CUE4Parse/UE4/Kismet/KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Kismet/KismetExpression.cs)）

注意那个 `GAME_AssaultFireFuture` ——**除版本号之外还有按具体游戏打的特例**。
这与[运行时逆向专题](/ue5-re/01-object-model)里 `UProperty` → `FField` 的变化是同一件事的两面：
属性系统换了，字节码里的引用方式跟着换。

## 四、`.usmap` 是硬前提

UE5 走 unversioned properties，属性类型不在资产里。没有 `.usmap`：

- 属性解析错位 → 字节码跟着烂；
- 而且**工具不会报「映射文件不对」**，只会给你一份看起来像样的错误产物。

（依据：`KismetDecompiler --usmap`、`KismetKompiler --usmap / --global` 都是显式参数，见各自 README）

## 五、同一份资产，两套实现可能给出不同结论

UAssetAPI 与 CUE4Parse 是两套**独立实现**。对标准 UE 资产，两者结论应当一致；
但遇到厂商魔改（比如上面那些自定义 opcode）时，**谁的适配更全，谁才对**。

所以：**关键结论不要只依赖一个工具**。这也正是本专题反复强调「换锚点交叉验证」的原因。

## 六、已知的渲染级缺陷（会静默出错）

| 缺陷 | 症状 | 出处 |
|---|---|---|
| `EX_ComputedJump` 未当块边界 | ubergraph 分发体缺失，效果调用点少 32% | [直译模拟器 01](/kismet-sim/01-why-ast) |
| `do { X(); } while (X());` | 条件里的调用被重复渲染一次（370 文件 / 531 处） | 同上 |
| `ForEach` 展开后的空壳出口块 | 渲染出**不存在的死循环**（`while (true) { if (C) { BODY } }`） | [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler) |

第三条值得展开：蓝图里的 `ForEach` 展开成 `B2: if (i < len) → 循环体 / else → B6`，
而 `B6` 往往是**没有语句、只做 `Jump 循环出口` 的空壳块**。反编译器若把它当循环出口直接跳过，
再叠加文本层的「删除空 `else`」规则，输出就变成**条件不成立时什么都不做、回到循环头**——
一个凭空多出来的死循环。

## 坑清单

| 坑 | 表现 | 应对 |
|---|---|---|
| 缺 `.usmap` | 产物「看起来短」「调用点缺失」 | 先排除映射文件，再怀疑工具 |
| 游戏有自定义 opcode | 解析错位、垃圾数据、不报错 | 查 CUE4Parse 是否已有该游戏的适配 |
| 版本判断只按 UE 版本 | 个别游戏走不同分支 | 记得有 `GAME_xxx` 级别的特例 |
| 拿伪代码当数据源 | 边界情况静默丢信息 | 直接消费 AST |
| 只用一个工具下结论 | 结论可能与另一实现冲突 | 交叉验证 |
| IO Store（`.ucas`/`.utoc`）未解容器 | 根本读不到资产 | 先解容器（KismetKompiler 的 `--global`） |
| 假设「反编译不报错 = 正确」 | 自信的错误结论 | 看反汇编视图、看 CFG、换锚点对数 |

（表中「应对」一列除引用处外，均为本站实践与经验做法。）

## 相关

- [01 · 蓝图资产里存了什么](/ue5-bp/01-anatomy) —— `FKismetPropertyPointer` 的上下文
- [02 · Kismet 字节码](/ue5-bp/02-bytecode) —— 操作码表与空档
- [03 · 反编译](/ue5-bp/03-decompile) —— 有损性的实测数字
- [附录 · 出处清单](/ue5-bp/appendix/sources)
