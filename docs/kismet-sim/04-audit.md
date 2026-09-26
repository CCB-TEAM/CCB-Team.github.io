---
title: 04 · 审计方法论
---

# 04 · 审计方法论

这一章可能是整套东西里**最有复用价值**的部分 —— 与 KARDS 无关。

## 问题：怎么知道"接完了"？

把 1670 个资产转译完、编译通过、跑一场自对弈不崩 ——
这些**都不能说明完成度**。

真实的失败长这样：

- 一张卡的效果函数从头到尾都在跑，但读错了字段，数值全错
- 引擎从不发某个触发点，于是 38 张卡**整个是白板**
- 宿主返回 `Nothing`，调用方当 0 继续跑，结果看起来完全合理

这些都不抛异常。**跑一万局自对弈也发现不了**，因为随机对局抽不到那些卡。

## 五层审计

做了五个模式，它们的价值在于**会给出互相矛盾的结论**：

| 模式 | 查什么 | 局限 |
|---|---|---|
| `selfplay` | 端到端跑得通吗 | 采样：抽不到的卡等于没测 |
| `apicheck` | 静态全扫调用目标，有没有地方接 | 不能证明"接对了" |
| `smoke` | 逐卡强制触发每个注册触发点 | 能测到但不管数值对错 |
| `triggerhits` | 运行期实测每个触发点命中次数 | 分不清"分发坏了"还是"没抽到" |
| `tests` | 机制断言（能失败的） | 只覆盖手写的那几条 |

### `apicheck`：把"完备"变成可验证的

扫 `Generated/` 里所有 `H.Call("X", ...)` 的目标名，然后判断每个名字是否有地方接：

1. `EngineHost` 的引擎原语表
2. `Host.Builtin` 的引擎库内建（Array/Map/String/Math…）
3. 转译产物里某个资产的同名函数

三类都不沾的，就是"一旦被调到就静默变成空操作"的缺口。

关键是**分类**。2814 个调用目标里有 341 个无实现 —— 但绝大多数是 UI 控件、
日期计算、平台判断，无头模拟永远不会走到。真正要紧的是从卡牌 ubergraph
或 `BP_CardFunctions` / `BP_GameState_Battle` **直接发起**的那些：

```csharp
static bool IsGameLogic(string caller) =>
    caller.StartsWith("ExecuteUbergraph_card_", StringComparison.Ordinal) ||
    caller.StartsWith("card_", StringComparison.Ordinal) ||
    caller is "BP_CardFunctions" or "BP_GameState_Battle" or "(top)";
```

于是"完备"有了可验证的定义：**卡牌逻辑可达的缺口 = 0**。

::: tip 为什么这个指标比跑对局可靠
它**不依赖采样运气**。跑 400 局自对弈显示"0% 未实现调用"，
但那只是说明随机策略没摸到那些卡 —— `apicheck` 是全量静态扫，跑不掉。
:::

这里我自己也踩了一个坑：`BuiltinNames` 我一开始手写维护，
但手写名单**一定会和 `switch` 里的 case 漂移**，一漂移审计就开始误报。
改成探测式 —— 拿实际调用目标去问 `Builtin` 认不认：

```csharp
foreach (var n in seen)
    if (probe.Builtin(n, dummy).Found) names.Add(n);
```

### `smoke`：绕开采样

自对弈的问题是你控制不了抽到什么卡。所以直接把每张卡造出来、放上场、
**逐个强制触发它注册的每一个触发点**：

```csharp
foreach (var t in TriggersOf(asset))
{
    try { CardDispatch.Fire(host, self, t, right); }
    catch (Exception ex) { failures.Add($"{asset}.{t}: {ex.Message}"); }
}
```

每个触发点单独 `try` —— 一张卡炸了不能带走整轮。

::: danger 这个模式抓到了自对弈漏掉的两类栈溢出
- `CardFunctions` 缺 `GameStateRef` 反向指针 → 转发壳无限递归
- 我修上面那条时写的重入防护，`++_depth[f]` 本身在 `Dictionary` 索引器上抛
  `KeyNotFoundException`

第二个是我修第一个时**自己造出来的 bug**，400 局自对弈完全没碰到，smoke 一跑就炸。
:::

### `triggerhits`：区分"发了"和"接住了"

静态审计会说谎的地方：**"引擎发了 `OnX`"不等于"有卡接住了"**。
触发源是"场上所有单位"，而一张卡只在 `CardFunctionTriggers` 里登记过的触发点上才被调 ——
引擎发了但当时场上没有响应者，就是空跑。

```csharp
h.OnTriggerFired = (t, asset) => { hit[t]++; cards[t].Add(asset); };
```

第一次跑的结果很有说服力：**34 个触发点一次都没命中**。
但这次不能直接下结论 —— 其中大多数只是随机对局没抽到。要配合 smoke 才能分辨。

### `tests`：能失败的断言

原则：**不做"跑通没炸"这种弱检查，断言具体数值和状态变化。**

```
PASS  Intel 翻牌张数 = cipher
PASS  Intel 不翻自己的牌
PASS  Intel 不改对手手牌顺序
PASS  Intel 不改自己手牌顺序
```

这四条里，只有第一条是"功能对不对"，后三条都是"**没破坏别的东西**"。
后者往往更重要 —— 而且更容易被忽略。

## 一条硬规矩：未知模式必须报错

原来的代码是：

```csharp
_ => Serve(args),      // 未知 mode 回落到起 HTTP 服务
```

写错一个字母（`--mode apicheck` 写成 `--mode api`）就会**静默起一个 HTTP 服务**，
看起来"跑起来了"，实际什么都没测。我因此在上面浪费了一轮。

改成显式报错：

```csharp
_ => UnknownMode(mode),   // 打印可用模式，返回码 2
```

::: tip 通用教训
**默认回落到"看起来合理的行为"，是审计工具最危险的设计。**
不确定的时候应该响亮地失败。
:::

## 另一条：未实现调用当失败处理

宿主遇到不认识的函数会返回 `Val.Nothing`，调用方当 0/false 继续跑。
这是**必需的容错**（否则一张卡能带崩整局），但也是**最大的静默错误源**。

所以 `smoke` 的返回码把未实现调用也算作失败：

```csharp
return failed == 0 && missTotal.Count == 0 ? 0 : 1;
```

打印出来只是"知道"，返回非零才能进 CI。

## 结果

| 指标 | 值 |
|---|---|
| 静态调用目标 | 2814 个 |
| 有实现 | 2473 个（87.9%） |
| 无实现 | 341 个，**全部仅 UI / 平台可达** |
| 卡牌逻辑可达的缺口 | **0** |
| 触发点覆盖 | **61 / 61** |
| 全卡强制演练 | 1638 张，0 异常 / 0 未实现 |

## 下一步

[05 · 坑与复盘](/kismet-sim/05-pitfalls) —— 完整清单。
