---
title: 08 · 对局同步与结算
---

# 08 · 对局同步与结算

::: tip 先看第 13 章
本章讲**服务端要做什么**（转发、调度、状态机、结算）；报文**长什么样**以[第 13 章 · 人机对局与对局内协议](/private-server/13-bot-and-actions)为准——那里的每条结论都来自**真机抓包**与**官服实测**。

本章与第 13 章若有冲突，**以第 13 章为准**（本章保留的是"实现怎么做"，第 13 章是"协议是什么"）。
:::

牌桌出现后，双方通过**两个 HTTP 接口 + 一条 WebSocket 通知**交换动作：一个提交、一个轮询。服务端**基本不需要理解游戏规则**——它只需要**有序转发**，把一方提交的动作放进另一方的拉取列表里。

## 一、两个接口 + 一条通知

| 用途 | 端点 | 载荷 |
|---|---|---|
| 提交动作 | `POST /matches/v2/{id}/actions` | `{ "a": "<codec 包>" }`，包内是动作明文 |
| 轮询动作 | `PUT /matches/v2/{id}/actions` | `{ min_action_id, opponent_id, time_since_opponent_ping }` |
| 会话动作 | `PUT /matches/v2/{id}` | `{ "a": "<codec 包>" }`，包内是 `{side, action, value}`（投降/结束） |
| WebSocket | `ws://host:port//ws` | 心跳与通知，**不承载动作** |

## 二、动作明文：线路字段 vs 参考实现 DTO

真机提交的动作包**解出来长这样**（[第 13 章](/private-server/13-bot-and-actions)第七/九节有完整样本）：

```jsonc
{
  "action_type": "XActionEndOfTurn",
  "player_id": 1,
  "match_data": { "cards": "[{…82 张牌…}]", "kredits_left": 1, … },   // 仅结束回合带
  "action_data": { "side": "left", "reason": "endTurnButton", "56": "20" },
  "action_id": 3,
  "local_subactions": 1
}
```

**必须收下的字段**：`action_type`、`player_id`、`action_data`、`action_id`、`local_subactions`（结束回合还有 `match_data`）。

::: warning `action` / `value` / `sub_actions` / `turn_number` 是**参考实现的 DTO**，不是真机字段
两套参考实现的 `MatchAction` DTO 里还有 `sub_actions`、`turn_number`、`action`（如 `end-match`）、`value`、`SendActionId` 等字段。两类后果：

- 把 `local_subactions`（真机必备）**漏掉了**——照 DTO 解析会直接丢；
- `action` / `value` 实际出现在**会话动作通道**（`PUT /matches/v2/{id}`）里，不在回合类动作里；
- `turn_number` 在真机里由**服务端**填写后广播，客户端提交时不带。

**结论**：解析时**以真机字段为准**，DTO 里的多余字段当作可选；否则要么丢字段、要么把可选的当成必填而拒收。
:::

## 三、服务端要做的分派

| 动作 | 服务端行为 |
|---|---|
| `XStartOfGame` | 标记开局，回合设为 0 |
| `XActionStartOfTurn` | `turn += 1`（**唯一需要服务端参与的状态**，因为要下发给对手） |
| `XActionEndOfTurn` | 原样入库；人机局还要替 AI 补动作（见第八节） |
| `XActionCheat` | 反作弊：封号 + 断开 WS + 判负 |
| `action == "end-match"`（会话动作） | `value.winner_side` 决定胜负 |
| 其它 | 原样入库、编号后等待对手拉取 |

::: code-group

```csharp [C#]
// C#：解密 → 分派 → 入库
var action = codec.Decrypt(body.A);                     // 第 4 章的 Decode

if (action.ActionType == "XStartOfGame")         match.Turns = 0;
if (action.ActionType == "XActionStartOfTurn")   match.Turns++;
if (action.ActionType == "XActionCheat")         { /* 封号 + 判负 + 断开 WS */ }
if (action.Action == "end-match")                match.WinnerSide = action.Value?.WinnerSide;

// 服务端重新编号：流里的序号由服务端定，客户端原始序号保留在 SendActionId
action = action with {
    ActionId   = match.CurrentActionId,                 // 服务端序号，全局递增（含对手动作）
    TurnNumber = match.Turns,
    LocalSubactions = action.LocalSubactions,           // ← 真机字段，别丢
};
match.Actions.Add(action);
match.CurrentActionId++;
return Results.Text("OK");
```

```go [Go]
// Go：同样的分派
func HandleAction(c *gin.Context) {
    var body MatchActionEn
    if err := c.ShouldBindJSON(&body); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
        return
    }
    action, err := codec.Decode(body.A)
    if err != nil {
        c.String(http.StatusBadRequest, "ACTION_ERROR")  // ← 与官服同款错误体
        return
    }
    switch action.ActionType {
    case "XStartOfGame":
        match.Turns = 0
    case "XActionStartOfTurn":
        match.Turns++
    case "XActionCheat":
        // 封号 + 判负 + 断开 WS
    }
    action.ActionID = match.CurrentActionID
    action.TurnNumber = match.Turns
    match.Broadcast(action)          // 放进"对手"的拉取列表
    match.CurrentActionID++
    c.String(http.StatusOK, "OK")
}
```

:::

::: warning 序号会分叉（实测）
真机抓包里，客户端提交时自带的 `action_id` 是**它自己的计数**（本局从 `1` 编到 `4`），而服务端广播出去的动作流编号是**服务端自增的**（本局到 `7`，其中 4/5 是机器人的、6 是投降产生的 `ActionEndMatch`）——**两者不是同一套号**，同一段号里还夹着对手的动作。

所以：**服务端编号是权威**（客户端会从流里收到自己刚提交的动作，靠 `action_id` 去重），客户端自带的编号只用于它自己那边的确认——参考实现把它留在 `SendActionId` 是对的。
:::

::: details `action == "lvl-loaded"` 是旧客户端/参考实现的行为
参考实现里有个分支：提交 `{"action": "lvl-loaded"}` 时返回 `{ "other_player_ready": 1 }`，不入库。

**真机不是这么做的**：本次抓包里客户端用 **`GET /matches/v2/{id}`**（响应是**裸文本** `running`）当"我这边的关卡载入完了"的信号，全程没有 `lvl-loaded` 这个动作。

保留这个分支只为兼容旧客户端；新实现按 `GET` 处理即可（见第六节）。
:::

::: warning 动作要存进**对手**的列表
`left_actions` 里放的是**发给左侧玩家看的动作**，也就是**右侧玩家提交的**。命名很容易反：

```typescript
getActionsById(player_id: number) {
  return this.left.player_id === player_id ? this.left_actions : this.right_actions;
}
```
:::

## 四、轮询

```jsonc
// 请求
{ "min_action_id": 12, "opponent_id": 2, "time_since_opponent_ping": 0 }

// 响应（有新动作时）
{
  "actions": [ "3f000312Q2F0A7…" ],          // 同样是 codec 字符串
  "match": { "player_status_left": "mulligan_done", "player_status_right": "mulligan_done", "status": "running" },
  "opponent_polling": true
}
```

三条实测规则（[第 13 章](/private-server/13-bot-and-actions)第六节有完整数据）：

1. `min_action_id` 是**闭区间下界**——返回 `id ≥ min` 的**全部**动作（**包含客户端自己提交的**，见上文"序号会分叉"）；
2. **没有新动作时 `actions` 键整个省略**（不是空数组）；对手没在轮询时 `opponent_polling` 键也省略（不是 `false`）；
3. 响应里的 `match` **只有 3 个字段**（两个 `player_status_*` + `status`），不是开局那 23 个。

```csharp
var result = new Dictionary<string, object>();
var actions = match.GetActionsByMinActionId(body.MinActionId);
if (actions.Count > 0)                       // ← 有才加这个 key
    result["actions"] = actions.Select(codec.Encode).ToArray();
result["match"] = new MatchPollDto(match.PlayerStatusLeft, match.PlayerStatusRight, match.Status);
if (match.OpponentPolling(body.OpponentId)) result["opponent_polling"] = true;
return Results.Ok(result);
```

客户端轮询很频繁（**几百毫秒级**），**这个接口必须无锁快速返回**：只读内存、不做 IO。

## 五、调度（换牌）

```jsonc
// 端点是 POST —— 官服实测 PUT 返回 405（附 Flask 的统一错误外壳）
POST /matches/v2/{id}/mulligan
{ "discarded_card_ids": [3, 7],
  "cards": [ /* 客户端同发的整局 82 张牌面，见附录 H §5 */ ] }

// 响应
{ "ai_error": false, "deck": [ /* 整副、已重编号 */ ], "replacement_cards": [ /* 新牌 */ ] }

GET /matches/v2/{id}/mulligan/left      → 未换牌时是**空对象 `{}`**（不是字符串 "null"）
GET /matches/v2/{id}/mulligan/right
```

::: warning 换牌不是"位置交换"，而是**重新洗牌 + 整库重编号**
早期文档（以及部分实现）把换牌写成"把新牌和被弃牌的位置互换、其余不动"。**官服实测不是这样**：

- 替补牌确实**继承被弃牌的槽位号**（弃掉 `0`、`1` 两张 → 新牌拿到 `0`、`1`）；
- 但整副牌库**从 0 重新编号**（原牌库是 `5..38`，换完变成 `0..33`）——说明服务端重排了牌库。

所以：**换牌后必须把整副 `deck` 回传给客户端**（洗牌权在服务端，客户端只认你给的牌序）。只回 `replacement_cards` 会让双方对牌序的认知当场分叉。

`location_number` 的完整语义见[第 13 章](/private-server/13-bot-and-actions)第四节。
:::

```csharp
// 换牌：重新分配整副牌序（简化：把被弃牌换出后洗牌、再统一编号）
var handSize = match.LeftHand.Count;                    // 4 或 5，别写死
var kept = hand.Where(c => !body.DiscardedCardIds.Contains(c.CardId)).ToList();
var pool = deck.Concat(hand.Where(c => body.DiscardedCardIds.Contains(c.CardId))).ToList();

var replacements = new List<MatchCard>();
for (int i = 0; i < body.DiscardedCardIds.Count; i++)
{
    var slot  = hand.First(c => c.CardId == body.DiscardedCardIds[i]).LocationNumber; // ← 继承槽位号
    var drawn = pool[Random.Shared.Next(pool.Count)];
    pool.Remove(drawn);
    replacements.Add(drawn with { Location = isLeft ? "hand_left" : "hand_right", LocationNumber = slot });
    kept.Insert(slot, replacements[^1]);                // ← 按槽位号放回手牌
}

// 牌库重新从 0 编号
var newDeck = pool.Select((c, i) => c with { LocationNumber = i }).ToList();

match.LeftHand = kept;
match.LeftDeck = newDeck;
match.PlayerStatusLeft = "mulligan_done";                // 换牌完成即标记
return Results.Created($"/matches/v2/{id}/mulligan",
    new { ai_error = match.BotEnabled, deck = newDeck, replacement_cards = replacements });
```

::: tip 为什么要按 side 存一份 snapshot 给对手
对手客户端会调 `GET /matches/v2/{id}/mulligan/{location}` 来播放"对方换了几张牌"的动画。所以除了返回给本人，还要按 side 存一份：`match.MulliganLeft` / `match.MulliganRight`。

**未换牌时返回空对象 `{}`**（官服实测）；`fyserver` 这里返回字符串 `"null"`，是偏差（客户端对空对象与 `null` 的解析路径不同）。
:::

## 六、载入与开局

`GET /matches/v2/{id}` 是**双重用途**：既是保活，又是"我这边的关卡载入完了"的信号。响应是**裸文本**（`running` / `finished`），不是 JSON。

```csharp
app.MapGet("/matches/v2/{id}", (int id, MatchStore store) =>
{
    var m = store.Get(id);
    m.LeftLoaded = true;                                  // 谁调的谁就置位
    if (m.LeftLoaded && m.RightLoaded) m.Status = "running";
    return Results.Text(m.Status);                        // ← 裸文本
});
```

::: warning 开局就 `running`，别先给 `pending`
参考实现会先把 `status` 置为 `pending`，等双方载入再转 `running`。而**官服实测开局载荷里就是 `running`**（[第 13 章](/private-server/13-bot-and-actions)第二节）。

如果你的客户端在 `pending` 下卡住不开桌，就是这里——不确定时**直接给 `running`**。
:::

## 七、结束、结算与断线

**结束**有两个入口：

| 入口 | 触发 |
|---|---|
| 会话动作 `PUT /matches/v2/{id}` 里的 `end-match` | 客户端投降/正常结束，`value.winner_side` 给出胜方（真机 body 见[附录 H](/private-server/appendix/client-capture)第七节） |
| WebSocket 断开 | 服务端判定投降（见下一章） |

**轮询时结算**：一旦 `winner_side` 有值，轮询响应立刻切到终局态，并广播一条 `ActionEndMatch`：

```csharp
if (!string.IsNullOrEmpty(match.WinnerSide))
{
    result["match"] = new MatchPollDto("end_match", "end_match", "finished");
    // 官服/私服实测都会下发这条（真机样本：{"reason":"surrender","winner_side":"right"}）
    match.Broadcast(new MatchAction(match.CurrentActionId++, "ActionEndMatch",
        surrendererId, new() { { "reason", "surrender" }, { "winner_side", match.WinnerSide } }));
}
```

::: warning 旧 JS 实现会补一条"致死动作"——**C# / Go / 官服都不需要**
先给结论：`fyserver`（C#）与 `kardsservergo`（Go）的结算只做一件事——把双方状态置为 `end_match`、`status` 置为 `finished`（外加一条 `ActionEndMatch`）。**没有**任何伪造的伤害动作。

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

**遇到"胜负不结算"时的排查顺序**：

1. `winner_side` 是否真的写入了（日志确认）；
2. 轮询返回的 `match.status` 是否为 `finished`、双方 `player_status_*` 是否 `end_match`；
3. 上面都对仍不结算，**再考虑**按旧 JS 的形状补一条 `DamageCard` 动作——把它当作兼容性补丁，而不是协议要求。
:::

**战后查询** `GET /matches/v2/{id}/post`：

```jsonc
// 来源：私服实测（真机客户端确实会调这个端点）
{ "faction": "Britain", "winner": false }
```

注意 `faction` 这里是**首字母大写**（与卡组头一致），而 `/session` 的 `decks.headers[].main_faction` 是小写——服务端两种都要能处理。

同时把该侧状态置为 `end_match`；**双方都结束后**才能把这局从内存里删掉（`CanRemoveMatch`），否则对手会突然 404。

**重连** `GET /matches/v2/reconnect` 返回完整回放，字段基本是开局数据 + 当前状态 + 全部动作：

```jsonc
// 来源：fyserver 实现（真机实测：无可重连对局时返回字符串 "null"）
{
  "actions": [ "…codec…" ],            // 从 0 号开始的全量动作
  "local_subactions": true,            // ← 私服加的键，官服没有
  "match": { "current_action_id": 17, "current_turn": 3, "status": "running", … },
  "mulligan_left": { … }, "mulligan_right": null,
  "same_turn": false,
  "starting_data": { … },
  "time_since_start_of_turn": -1,
  "waiting_for_sit_n_go_match": false
}
```

## 八、单人对战（人机）

人机对局要多做两件事：**对手侧状态永远是 `mulligan_done`**，以及**服务端帮 AI 结束回合**：

```csharp
// 玩家回合结束 → 服务端替机器人补两条动作，让 AI 回合也能推进
if (action.ActionType == "XActionEndOfTurn" && match.IsBotMatch)
{
    match.Turns++;
    match.Actions.Add(new MatchAction(match.CurrentActionId++, "XActionStartOfTurn", botId,
        new() { { "side", "right" }, { "75", "20" } }, new(), match.Turns, SendActionId: action.SendActionId));
    match.Actions.Add(new MatchAction(match.CurrentActionId++, "XActionEndOfTurn", botId,
        new() { { "side", "right" }, { "75", "20" } }, new(), match.Turns, SendActionId: action.SendActionId));
}
```

**这段与真机动作流完全对得上**：抓包里机器人的那两条动作正是 `{"side":"right","75":"20"}`（[第 13 章](/private-server/13-bot-and-actions)第五节表格 aid 4/5）——注意机器人用 `"75"`、玩家一侧用 `"56"`，别共用一份键名。

**服务端不需要真的会下棋**：只要让回合流转起来，人机对战就能打。

::: tip 人机的官服实测形态见第 13 章
机器人 id 在**官服**是负数（实测 `-2020`/`-2030`）、名字是 `"Fischer"`，**不是** `fyserver` 的 `-9178`；`Ex == "pw"` 是 `fyserver` 的内部标记，客户端从不发这个值——认 `extra_data.match_type: "training"`。

进局端点、开局载荷字段、轮询规则、动作提交格式全在[第 13 章](/private-server/13-bot-and-actions)。
:::

---

动作通道是 HTTP 轮询，那 WebSocket 干嘛用的？下一章。
