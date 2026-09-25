---
title: 08 · 对局动作、调度与结算
---

# 08 · 对局动作、调度与结算

牌桌出现后，双方通过**两个接口 + 一条 WebSocket 通知**交换动作：一个提交，一个轮询。服务端基本不需要理解游戏规则——它只需要**有序转发**。

## 提交动作 `POST /matches/v2/{id}/actions`

```jsonc
// 请求（动作体是第 4 章的 codec 字符串）
{ "a": "3f000312Q2F0A7…" }
```

服务端解密后拿到的是**明文的 MatchAction**，然后按类型分派：

```jsonc
{
  "action_id": 17,                 // 客户端发来的序号（SendActionId）
  "action_type": "XActionStartOfTurn",
  "player_id": 1,
  "action_data": { "side": "left" },
  "sub_actions": [],
  "turn_number": 3,
  "action": "",                    // 部分动作类型走这个字段
  "value": null
}
```

| 动作 | 服务端行为 |
|---|---|
| `action_type == "XActionStartOfTurn"` | `turn += 1`（**唯一需要服务端参与的状态**，因为要下发给对手） |
| `action_type == "XActionCheat"` | 反作弊：封号 + 断开 WS + 判负 |
| `action == "lvl-loaded"` | 返回 `{ "other_player_ready": 1 }`，不入库 |
| `action == "end-match"` | `value.winner_side` 决定胜负 |
| 其它 | 原样入库，编号后等待对手拉取 |

::: code-group

```csharp [C#]
// C#：解密 → 分派 → 入库
var action = codec.Decrypt(body.A);                     // 第 4 章的 Decode

if (action.ActionType == "XActionStartOfTurn") match.Turns++;
if (action.ActionType == "XActionCheat") { /* 封号 + 判负 + 断开 WS */ }
if (action.Action == "lvl-loaded") return Results.Ok(new OtherPlayerReadyDto(1));

// 服务端重新编号：动作序号由服务端定，客户端原始序号保留在 SendActionId
action = action with {
    ActionId = match.CurrentActionId,                   // 服务端序号，递增
    TurnNumber = match.Turns,
    SubActions = action.SubActions ?? new()
};
match.Actions.Add(action);
match.CurrentActionId++;
return Results.Text("OK");
```

```typescript [TypeScript]
// TS：同样的分派
processMatch(matchId: number, action: MatchAction, player: User) {
  const match = MatchService.matchedPairs[matchId];
  if (action.action === 'lvl-loaded') return { otherPlayerReady: 1 };
  if (action.action === 'end-match' && !match.winner_side) match.winner_side = action.value.winner_side;
  if (action.action_type || action.action) {
    if (match.left.player_id === player.id && action.action_id >= match.left_minactionid)
      match.left_minactionid = action.action_id;
    else if (action.action_id >= match.right_minactionid)
      match.right_minactionid = action.action_id;
    // 关键：动作存进"对手"的列表
    if (match.left.player_id === player.id) match.right_actions.push(action);
    else match.left_actions.push(action);
  }
  return 'OK';
}
```

:::

::: warning 动作要存进对手的列表
`left_actions` 里放的是**发给左侧玩家看的动作**，也就是**右侧玩家提交的**。命名很容易反：

```typescript
getActionsById(player_id: number) {
  return this.left.player_id === player_id ? this.left_actions : this.right_actions;
}
```
:::

## 轮询动作 `PUT /matches/v2/{id}/actions`

```jsonc
// 请求
{ "min_action_id": 12, "opponent_id": 2, "time_since_opponent_ping": 0 }

// 响应
{
  "actions": [ "3f000312Q2F0A7…" ],          // 同样是 codec 字符串
  "match": { "player_status_left": "mulligan_done", "player_status_right": "not_done", "status": "running" },
  "opponent_polling": true
}
```

`min_action_id` 是"我已经看到第几号了"。服务端返回**大于等于它、且属于对手的**动作；没有新动作时 `actions` 字段**整个省略**（不是空数组）——两个参考实现都这么做：

```csharp
var result = new Dictionary<string, object>();
var actions = match.GetActionsByMinActionId(body.MinActionId);
if (actions.Count > 0)                       // ← 有才加这个 key
    result["actions"] = actions.Select(codec.Encode).ToArray();
result["match"] = new MatchPollDto(match.PlayerStatusLeft, match.PlayerStatusRight, "running");
result["opponent_polling"] = true;
return Results.Ok(result);
```

客户端轮询很频繁（几百毫秒级），**这个接口必须无锁快速返回**：只读内存、不做 IO。

## 调度（换牌）阶段

```
POST /matches/v2/{id}/mulligan          { "discarded_card_ids": [3, 7] }
  → { "deck": [ … ], "replacement_cards": [ … ] }
GET  /matches/v2/{id}/mulligan/left     → 记录的结果，或字符串 "null"
GET  /matches/v2/{id}/mulligan/right
```

换牌算法是**位置交换**而不是洗牌：从手牌找到要换的卡，随机挑一张牌库的卡，**互换两者的 `location` 和 `location_number`**，于是新卡"占用"旧手牌的位置，旧卡回到牌库那个位置。

```csharp
foreach (var discardId in body.DiscardedCardIds)
{
    int handIndex = hand.FindIndex(c => c.CardId == discardId);
    if (handIndex == -1) continue;                       // ← 找不到就跳过，别抛异常

    int deckIndex = Random.Shared.Next(deck.Count);
    var cardInHand = hand[handIndex];
    var cardInDeck = deck[deckIndex];

    var newHandCard = cardInDeck with { Location = cardInHand.Location, LocationNumber = cardInHand.LocationNumber };
    var newDeckCard = cardInHand with { Location = cardInDeck.Location, LocationNumber = cardInDeck.LocationNumber };

    result.ReplacementCards.Add(newHandCard);
    deck[deckIndex] = newDeckCard;
    hand[handIndex] = newHandCard;                       // ← 必须同步内存手牌，否则后续状态不一致
}
match.PlayerStatusLeft = "mulligan_done";                // 换牌完成即标记
```

::: tip 为什么要存一份 snapshot 给对手
对手客户端会调 `GET /matches/v2/{id}/mulligan/{location}` 来播放"对方换了几张牌"的动画。所以除了返回给本人，还要按 side 存一份：`match.MulliganLeft` / `match.MulliganRight`。没换过牌时返回字符串 `"null"`。
:::

## 结束、结算与断线

**结束**有两个入口：

| 入口 | 触发 |
|---|---|
| `action == "end-match"` | 客户端投降/正常结束，`value.winner_side` 给出胜方 |
| WebSocket 断开 | 服务端判定投降（见下一章） |

**轮询时结算**：一旦 `winner_side` 有值，轮询响应立刻切到终局态：

```csharp
if (!string.IsNullOrEmpty(match.WinnerSide))
    result["match"] = new MatchPollDto(EndMatch, EndMatch, "finished");
```

::: warning 旧 JS 实现会补一条"致死动作"——**C# / Go 都不需要**
先给结论：`fyserver`（C#）与 `kardsservergo`（Go）的结算只做一件事——把双方状态置为 `end_match`、`status` 置为 `finished`。**没有**任何伪造动作。

只有那个已过时的 JS 实现额外插了一条**服务端伪造的伤害动作**：

```typescript
if (match.winner_side) {
  result.match.status = 'finished';
  result.actions = [{
    action_type: 'XActionCheat',
    player_id: 对手id,
    action_data: { '0': 'DamageCard', '1': match.winner_side === 'left' ? '41' : '1', '2': '99', playerID: 对手id },
    action_id: 对手侧的 minactionid + 1,
    local_subactions: 1,
  }].concat(result.actions ?? []);
}
```

`99` 是"致死伤害"，`1`/`41` 是双方 HQ 的 `card_id`——纯客户端演出需求，**不要试图用真实规则解释它**。

**为什么可以不做**：这套"补刀"是早期客户端版本的行为，旧 JS 实现为了适配当时见到的现象加上的。以 C# / Go 为准的现代实现只翻状态即可。

**遇到"胜负不结算"时的排查顺序**：

1. `winner_side` 是否真的写入了（日志确认）；
2. 轮询返回的 `match.status` 是否为 `finished`、双方 `player_status_*` 是否 `end_match`；
3. 上面都对仍不结算，**再考虑**按旧 JS 的形状补一条 `DamageCard` 动作——把它当作兼容性补丁，而不是协议要求。
:::

**战后查询** `GET /matches/v2/{id}/post`：

```jsonc
{ "faction": "Germany", "winner": true }
```

同时把该侧状态置为 `end_match`；**双方都结束后**才能把这局从内存里删掉（`CanRemoveMatch`），否则对手会突然 404。

**重连** `GET /matches/v2/reconnect` 返回完整回放，字段基本是开局数据 + 当前状态 + 全部动作：

```jsonc
{
  "actions": [ "…codec…" ],            // 从 0 号开始的全量动作
  "local_subactions": true,
  "match": { "current_action_id": 17, "current_turn": 3, "status": "running", … },
  "mulligan_left": { … }, "mulligan_right": null,
  "same_turn": false,
  "starting_data": { … },
  "time_since_start_of_turn": -1,
  "waiting_for_sit_n_go_match": false
}
```

没有可重连的对局时返回字符串 `"null"`（就是第 7 章那个坑）。

## 单人对战（`ex == "pw"`）

人机对局要多做两件事：对手侧状态永远是 `mulligan_done`，以及**服务端帮 AI 结束回合**：

```csharp
// 玩家回合结束 → 服务端替 -9178 补两条动作，让 AI 回合也能推进
if (action.ActionType == "XActionEndOfTurn" && match.Ex == "pw")
{
    match.Turns++;
    match.Actions.Add(new MatchAction(match.CurrentActionId++, "XActionStartOfTurn", -9178,
        new() { { "side", "right" }, { "75", "20" } }, new(), match.Turns, SendActionId: action.SendActionId));
    match.Actions.Add(new MatchAction(match.CurrentActionId++, "XActionEndOfTurn", -9178,
        new() { { "side", "right" }, { "75", "20" } }, new(), match.Turns, SendActionId: action.SendActionId));
}
```

AI 玩家 id 固定用 `-9178`，卡组用一份硬编码的卡组码——**服务端不需要真的会下棋**，只要让回合流转起来，人机对战就能打。

::: tip 人机的官服实测形态见第 13 章
上面这段来自 `fyserver` 的实现。**官服实测**（进局端点、机器人特征、开局载荷字段）在[第 13 章](/private-server/13-bot-and-actions)，并顺带解开了"`actions` 数组里到底是 JSON 还是编码串"——是 **codec 包**。

两点提醒：`Ex == "pw"` 是 `fyserver` 的**内部标记，不是线上值**（客户端从不发 `pw`）；官方训练机器人的 id 是 `-2020`、名字是 `"Fischer"`。
:::

---

动作通道是 HTTP 轮询，那 WebSocket 干嘛用的？下一章。
