---
title: 03 · 触发点体系
---

# 03 · 触发点体系

逻辑能跑了，下一个问题是：**什么时候该跑谁？**

## 好消息：游戏自己就有答案

一开始我打算手写一套触发规则 —— 读 `cards.json` 里每张卡的触发点标记，
在引擎里"该发的时候"发出去。写了 20 多个触发点之后发现不对劲：
顺序、时机、响应者筛选，全靠我猜。

后来在 `BP_CardFunctions` 里发现了这套东西：

```
卡牌 CDO.usedTriggers  (TArray<ERegisteredCardFunction>)
    ↓ CreateCardObject 遍历
UpdateCardFunctionTriggerMap(triggerEnum, cardID)
    ↓ 写入
GameState.CardFunctionTriggers  (map<triggerID, set<cardID>>)
    ↓ FetchAllCardsWithEventTrigger 查
Execute*Events  →  逐个调响应卡的事件函数
```

**"何时发 / 谁响应 / 什么顺序"这些信息游戏自己就有。**
`BP_CardFunctions` / `BP_GameState_Battle` 里有 **63 个 `Execute*Events` 函数**，
每个把 triggerID 硬编码在里面：

```
FetchAllCardsWithEventTrigger(self, Val.Of(46), out cards)   // 46 = OnOtherCardLeaveBoardOrOwner
```

::: tip 教训
**在重写游戏逻辑之前，先确认游戏没把这份逻辑一起编译给你。**
这个发现把工作量从"手写整套触发规则"变成了"在正确时机调对函数"。
:::

## 引擎侧怎么接

`Engine/GameEngine.Triggers.cs` 里 43 个语义化包装，集中在一处：

```csharp
internal void FireTurnStartTriggers()
{
    Fire(Trigger.OnBeforeStartOfTurn);
    Fire(Trigger.OnStartofTurn);
}

internal void FireDestroyTriggers(Card c)
{
    Fire(Trigger.OnOtherCardDestroyed, c);
    Fire(Trigger.OnDestructionEffectTriggered, c);
    Fire(Trigger.OnOtherCardLeaveBoardOrOwner, c);
    Fire(Trigger.OnAfterOtherCardLeaveBoardOrOwner, c);
}
```

原来的 `FireTrigger(Trigger.X, c)` 散落在 `Actions.cs` / `Turn.cs` / `Effects.cs` 各处，
漏发一个触发点根本看不出来。集中之后至少能一眼数清。

::: danger 但那 43 个包装里，有 23 个从来没被调用过
我写完包装函数之后，用静态审计扫了一遍，报告"61/61 完整"。

**那是假的。** 静态审计只扫 `Fire(Trigger.X)` 这个字面量 ——
包括那些**从来没被调用过**的辅助函数。23 个包装是死代码，一个都没接上。

是加了运行期实测（`--mode triggerhits`）才看出来的。
详见 [04 · 审计方法论](/kismet-sim/04-audit)。
:::

还有一个写法上的坑：**包装函数不能用三元表达式**。

```csharp
// ✗ 审计看不见，会误报"从不触发"
internal void FirePinTriggers(Card c, bool pinned)
    => Fire(pinned ? Trigger.OnOtherUnitPinned : Trigger.OnOtherUnitUnPinned, c);

// ✓ 显式分支
internal void FirePinTriggers(Card c, bool pinned)
{
    if (pinned) Fire(Trigger.OnOtherUnitPinned, c);
    else        Fire(Trigger.OnOtherUnitUnPinned, c);
}
```

因为审计是静态扫字面量的。这是"工具约束反过来影响代码风格"的一个例子 ——
不理想，但比让工具说谎好。

## 案例：Intel 我错了三层

Intel（情报）机制我一开始理解成全错。这个案例值得完整记一遍，
因为它展示了**"数据模型错了"和"调用约定错了"是两类不同的错，都会静默**。

### 正确的语义

```
打出带 Intel n 的卡  →  cipher = n
    ↓ CardPlayedFromHand 里：
      if (cardPlayed.cipher > 0) SetCardsSeenByCipher(cipher, cardID)
随机翻开对手 n 张手牌，标记「已明牌」
    ↓ FetchAllCardsWithEventTrigger(28) = OnIntelTriggered
通知所有注册了 OnIntelTriggered 的卡 → OnIntelTriggered(情报卡, n)
```

### 我错的三层

| # | 我以为是 | 实际是 | 怎么发现的 |
|---|---|---|---|
| 1 | 是个布尔关键字位 | 是**卡上的数值字段** `cipher` | 数据里找不到对应 flag |
| 2 | 是卡面标签（`extraHelpBubbleTypes` 里有 "Intel"） | 标签只是**显示用**，判定读 `cipher` | 翻 tag 实现出来永远为假 |
| 3 | `OnIntelTriggered` 第二参是"相关卡" | 是**整数**（翻了几张） | 对照其他触发点的形参约定才看出不一致 |

第 3 点最阴险 —— 所有其他触发点的第二个形参都是"相关卡对象"，
只有 `OnIntelTriggered` 是整数。传错不炸，只是卡的逻辑会把整数当卡对象读。

所以我单开了一条路径：

```csharp
public static bool FireWith(EngineHost host, Card card, Trigger t, params Val[] extra)
```

不能复用普通的 `Fire`，因为那里的第二个实参语义固定是"相关卡"。

### 还有两处不能想当然

**不要重复发。** 我一开始在引擎的 `PlayCard` 里也发了一次 Intel ——
但游戏自己的 `CardPlayedFromHand` 里已经有这条链路了，结果是翻两倍张数。

**翻牌不能改手牌顺序。** 翻牌只加 `seenByCipher` 标记：

```csharp
// 洗一份下标再取前 n 个：直接洗牌会打乱对手手牌顺序
var idx = Enumerable.Range(0, foeHand.Count).ToList();
h.Engine.S.Rng.Shuffle(idx);
foreach (var i in idx.Take(n))
    h.Obj(foeHand[i]).Set("seenByCipher", Val.Of(true));
```

顺序是对局的**可见信息**。洗错地方会让同一 seed 跑出不同结果 ——
而复现性是训练数据的基本要求。

这条有断言守着（`--mode tests`）：翻牌张数 = cipher / 不翻自己的牌 /
不改双方手牌顺序。

## 三张表的对照

`--mode triggers` 会同时打印三张表：

| 表 | 来源 | 现在的数 |
|---|---|---|
| 卡牌注册的触发点 | 直译产物里的函数名 | 61 |
| 引擎会发出的 | 扫 `Fire(Trigger.X)` 字面量 | 66 |
| 游戏侧有分派器的 | 扫 `Execute*Events` 里的 triggerID | 63 |

三者差值就是线索：注册了但引擎不发 = **白板卡**。

当前状态：**注册了但引擎从不触发的触发点 = 0 个**。

## 下一步

[04 · 审计方法论](/kismet-sim/04-audit) —— 怎么知道"接完了"？
