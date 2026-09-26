---
title: 06 · 宿主该切在哪一层（推荐 hook 点）
---

# 06 · 宿主该切在哪一层（推荐 hook 点）

[02](/kismet-sim/02-calling-convention) 讲了架构长什么样，这一章讲**那条缝具体切在哪**。

一句话原则：

::: tip 原则
**能由蓝图自己跑完的，一律转回直译产物；宿主只实现「真正碰状态」的叶子。**
:::

这条原则决定了全部工作量：直译产物 6434 个函数，手写宿主约 190 个条目。
如果把游戏函数在宿主里重写一遍，工作量翻十倍，而且会立刻和客户端行为分叉。

## 分派顺序（就是那张缝的位置表）

`EngineHost.Handle` 收到 `H.Call(名字, {接收者, 实参...})` 之后，按这个顺序找实现：

| # | 去处 | 说明 |
|---|---|---|
| 1 | **引擎原语表** | 真正改 `GameState` 的叶子函数。唯一"手写逻辑"的地方 |
| 2a | `cardFunction.*` → `BP_CardFunctions` 产物 | 蓝图库函数，递归回直译产物 |
| 2a′ | 同接收者 → `BP_GameState_Battle` 产物 | `BP_CardFunctions` 里没有就往对局状态蓝图找 |
| 2b | `GameStateRef.*` → `BP_GameState_Battle` 产物 | 同上 |
| 2c | 卡牌成员 | 先查这张卡自己的资产（事件 + `ExecuteUbergraph_*`），再落 `BP_CardFunctions` |
| 2d | Notifier / UI 通知 | 一律 no-op（无头模拟没有 UI） |
| 2d′ | `*UtilityFunctions` | 静态工具库（`GetLogic` / `GetGameState` / `FetchAllCardsWithEventTrigger`…） |
| 2e | 无接收者的静态调用 | 先接客户端规则库 `cardsCheckFunctions`，再 UtilityFunctions |
| 3 | 卡牌原生事件默认体 | 卡没覆盖 ≠ 没实现（`BlueprintNativeEvent` 的 C++ 默认体必须执行） |
| 4 | 记账 | 区分「真的缺宿主实现」和「这个接收者没实现该事件」，只把前者算缺口 |

几处顺序是有理由的，别随手调：

- **原语表排第一**，但同名不同接收者的函数要按**实参个数**分流。
  例如 `CanOtherCardBeTargetted` 同时是卡上的成员（8 参）和规则库的静态函数（9 参），
  只按名字查表会把库版调用错路由到卡版实现上。
- **卡的资产排在 `BP_CardFunctions` 前面**：卡自己的事件体优先于共享实现。
- **`cardsCheckFunctions` 必须在"无接收者"分支里接住**。客户端的规则库
  （`CanAttack` / `CanSelectAsTarget` / `not_enough_range`）在蓝图里就是不带接收者调的；
  漏了它，`CanAttack` 内部的判定会静默变成空操作 —— 表现为
  「原因字符串为空、`canAttack` 为 false」，极难定位。
- **`Notifier` 必须显式 no-op**，不能掉进"未实现"记账里：UI 通知每打一张牌都会调。

## 推荐 hook 的六类

### 1. 叶子状态原语（主力）

伤害 / 治疗 / HQ / 指挥点 / 抽牌 / 洗牌 / 放置 / 属性读写 / 移动。
判据很简单：**这个函数要不要改 `GameState`？要改就 hook，不改就转回去。**

### 2. 随机流

所有随机目标选择都必须走引擎自己的 `GameState.Rng`。

```
GetRandomCard / ShuffleCards / 随机翻开对手手牌 …
```

::: warning 为什么不能各自 `new Random()`
复现性是训练数据的基本要求：同一个 seed 必须跑出同一局。
随机流一散，出问题就再也回放不出来，只能靠猜。
:::

### 3. 位置与容量

站位编号、行容量、`isLocationFull` 这些**看起来是细节、其实决定效果走哪一支**：

- `RefreshLocationNumbers` / `RenumberRows`：位置编号错了，"取左边/右边那张"就取错。
- `FetchCardsByLocation` 必须返回**真实的 `isLocationFull`**（手牌上限 9、行上限 5）。
  恒返回 false 的后果很具体：撤退时"支援线满了才改回手牌"那一支永远走不到，
  实际把前线单位塞进一条已经满的支援线（行里出现 6 张牌）。

### 4. 裸事件（bare events）—— 最容易漏的一类

有些卡牌事件**不是** `ERegisteredCardFunction` 的成员，所以走不到触发点分派器。
它们由蓝图在流程里直接调用，引擎必须自己在正确时机亲自调：

| 事件 | 引擎该在什么时候调 | 载荷 |
|---|---|---|
| `OnPlayedFromHand` | 出牌流程里（`CardPlayedFromHand` 那条链） | 出牌者、目标… |
| `OnEnterPlay` | 卡进场时 | method |
| `OnMoveToFrontline` | **只**在「支援线 → 前线」的移动里 | forceMove、moveCost |
| `OnMoveFromFrontline` | 前线 → 支援线 | — |
| `OnBeforeRetreat` | 撤退前（可否决） | 默认体必须写 `false` |
| `OnLeaveBoardOrOwner` | **离场瞬间、卡还在场上的时候** | goingToLocation、method |

最后一条是踩出来的：`OnLeaveBoardOrOwner` 如果等 `Destroyed = true` 之后才发，
光环类效果回头找"这张卡带来的加成"就找不到了 —— **加成永远撤不掉**。
现在是在 `DestroyCard` 的入口、置位之前发。

`OnPlayedFromHand` 值得单独记一笔：942 张卡有它，但它不在触发点枚举里，
早期实现调的是 `Fire(Trigger.NotAvailable)` —— 而分派器对 `NotAvailable` 直接 `return false`。
结果 **691 张 order 与 241 张部署单位的效果全都不执行，且不报错**。

### 5. 到期清账

「本回合 +N 攻击」这类临时加成，宿主必须登记、回合结束撤销：

```
AddBuffsToRemoveEndOfTurn(来源, 卡)   →  EndTurn 时按来源逐个清
```

::: danger 按来源记，不要按 changeType 记
按 `changeType` 分类撤销会漏掉"同一张卡被两个来源各加了一次"的情况，
表现是「本回合 +N」变成永久 +N。详见 [07 · 发射器与运行时](/kismet-sim/07-emitter)。
:::

### 6. 规则查询与观测

- **动作合法性只问客户端规则库**：`ClientCanAttack` → `cardsCheckFunctions`。
  引擎里不要再写第二份"能不能打"的判断 —— 两份规则必然分叉，
  而 AI 会学到一份现实中不存在的规则。
- **观测/编码是只读层**：为了模型方便改动作语义是错的，映射放在编码器里做。

## 明确不要 hook 的地方

这几条都是"看起来该由引擎管，其实应该让蓝图自己跑"：

| 反例 | 现象 |
|---|---|
| 自己实现 `GetCardsToTheLeft` / `GetCardsToTheRight` | 引擎按自己的站位编号算 → 拿错卡。蓝图版本配合 `RefreshLocationNumbers` 才一致 |
| 部署时也发一次 `OnMoveToFrontline` | 部署触发的光环加成**翻倍**（+2 变 +4）。客户端只在 `MoveUnitFromSupportToFrontLine` 里发 |
| 效果驱动的位移里重发离场事件 | BP 的 `MoveCardFromBoardToOwnersHand` 自己已经 dispatch 了 `ExecuteOnBefore/AfterLeaveBoardOrOwnerEvents` → 事件发两遍 |
| 在引擎里再发一次 Intel | BP 的 `CardPlayedFromHand` 里已有整条链路 → **翻两倍张数** |
| 用 `CardFunctionTriggers` / `AllCardsInBattle` 这张注册表发触发 | 无头模拟里这张表从来没被 seed 过，是条死路。分派走 `FireTrigger → CardDispatch` |

::: tip 判断方法
问自己：**客户端是靠这段蓝图把效果跑起来的吗？**
是 → 就调蓝图函数，别自己写。只有"没有蓝图可调"（改 `GameState`、拿随机数、接 UI）
才是宿主的活。
:::

## 事件载荷：按形参名，不要按位置

触发点的形参个数从 0 到 6 不等（`OnOtherCardDestroyed` 有 6 个），
而引擎的调用点各不相同。所以载荷是**具名**的，落槽靠转译时生成的形参表：

```csharp
// Bridge/CardDispatch.cs
var names = FnIndex.ParamsOf(t.ToString());   // ← 与发射器 EmitParamBindings 同源
for (var i = 0; i < names.Length; i++)
    args[i] = payload.Get(names[i]);
```

以前是"按位置固定传两个"，第 3 个参数起恒为 `Nothing`。而直译产物里大量
`if (!destroyedInCombat) return;` 这类前置守卫 —— 于是效果**静默消失**：
触发点照常计次、日志一切正常、自对弈"未实现调用 0%"照样是绿的。

## 切完怎么自查

| 工具 | 看什么 |
|---|---|
| `--mode apicheck` | 静态扫所有 `H.Call` 目标：**卡牌逻辑可达的缺口必须是 0** |
| `--mode smoke` | 逐卡强制触发它注册的每一个触发点，把"采样运气"排除掉 |
| `--mode triggerhits` | 运行期实测命中次数：「引擎发了」不等于「有卡接住」 |
| `--mode tests` | 每个 hook 都要有一条**能失败**的断言（不是"跑通没炸"） |
| 自对弈汇总 | 未实现调用占比是北极星；它会掩盖一切，所以必须盯着 |

---

下一篇：[07 · 发射器与运行时：实现特性](/kismet-sim/07-emitter) —— 缝切好了，
剩下的是"改发射器时哪些东西会静默错"。
