---
title: 07 · 大厅、匹配与开局
---

# 07 · 大厅、匹配与开局

从点"开始对战"到看见牌桌，客户端走三步：**进队列 → 轮询匹配结果 → 收到开局数据**。

## 第一步：进队列 `POST /lobbyplayers`

```jsonc
{
  "player_id": 1,
  "deck_id": 428173,
  "extra_data": ""            // 决定进哪个队列，见下表
}
```

| `extra_data` | 队列 | 说明 |
|---|---|---|
| `""` | 排位/普通 | 主队列 |
| `"brawl"` / `"draft"` / `"pw"` / `"training"` | 各成一体 | 乱斗、竞技场、训练 |
| `"battle_code:XXXX"` | 私密房 | **按 `extra_data` 分桶**，同一个 code 的两人配对 |

实现就是"两个坑位一凑即成对"（`extra_data` 为空进主队列，非空进第二队列，`battle_code:` 前缀单独分桶）：

```typescript
// TypeScript 写法示意（队列语义以 C# / Go 实现为准）
async joinMatch(lobbyPlayer: LobbyPlayer) {
  const user = JSON.parse(await users.get('' + lobbyPlayer.player_id));
  if (user.name === '<anon>') {                        // ← 没改名的玩家不让进（fyserver 亦有此拦截）
    clients[user.id]?.client.send(JSON.stringify({ channel: 'disconnect', message: '请改名' }));
    return;
  }
  if (lobbyPlayer.extra_data.startsWith('battle_code:')) {
    const bucket = (MatchService.battleCodePlayers[lobbyPlayer.extra_data] ??= []);
    bucket.push(lobbyPlayer);
    if (bucket.length >= 2) this.pair(bucket.shift()!, bucket.shift()!);
    return true;
  }
  if (!isValidDeckCode(user.decks[lobbyPlayer.deck_id].deck_code)) return false;   // ← 卡组不合法直接拒
  const queue = lobbyPlayer.extra_data === '' ? MatchService.waitingPlayers1 : MatchService.waitingPlayers2;
  queue.push(lobbyPlayer);
  if (queue.length >= 2) this.pair(queue.shift()!, queue.shift()!);
  return true;
}

private pair(left: LobbyPlayer, right: LobbyPlayer) {
  const matchId = Math.floor(Math.random() * 900000) + 100000;   // 6 位
  MatchService.matchedPairs[matchId] = new MatchInfo(matchId, left, right);
}
```

```csharp
// C#：队列在内存里，配对了就建 MatchInfo
private readonly List<LobbyPlayer> _queue = new();

public bool Join(LobbyPlayer p)
{
    if (p.ExtraData.StartsWith("battle_code:"))
    {
        if (!_codeBuckets.TryGetValue(p.ExtraData, out var bucket))
            _codeBuckets[p.ExtraData] = bucket = new List<LobbyPlayer>();
        bucket.Add(p);
        if (bucket.Count >= 2) Pair(bucket[0], bucket[1], bucket);   // 取下并移除
        return true;
    }
    _queue.Add(p);
    if (_queue.Count >= 2) { Pair(_queue[0], _queue[1], _queue); }
    return true;
}
```

::: warning 队列里的三方竞争
`POST /lobbyplayers` 和随后的轮询在不同请求里并发发生。**入队/配对/取出必须加锁**（C# 用 `SemaphoreSlim` 或 `lock`，TS 单线程天然安全但要小心 `await` 之间的重入）。参考的 Go 实现特意为生成开局数据加了双重检查锁：

```go
// fyserver 对应逻辑：避免并发请求重复生成 MatchStartingInfo（会洗出两副不一样的牌）
await _matchInitLock.WaitAsync();
try { if (match.MatchStartingInfo != null) return match.MatchStartingInfo; … }
finally { _matchInitLock.Release(); }
```
:::

另外两个端点：

| 请求 | 行为 |
|---|---|
| `DELETE /lobbyplayers` | 出队，返回 `{status: 200}`（TS 返回的是字符串 `"{status:200}"`，**兼容写法就别改了**） |
| `POST /singleplayerlobby` | 人机队列，直接造一个 AI 对手（`player_id: -9178`，参考实现给了固定卡组） |

## 第二步：轮询 `GET /matches/v2/`

客户端排队时高频轮询这个接口，直到拿到开局数据：

```typescript
// 语义以 fyserver（C#）为准，这里是 TypeScript 等价写法
async checkMatch(playerId: number) {
  const match = Object.values(MatchService.matchedPairs)
    .find((m) => !m.winner_side && m.hasPlayer(playerId));
  if (!match) return 'null';                    // ← 返回字符串 "null"，不是 JSON null
  return this.makeMatchStartingInfo(playerId, match);
}
```

::: warning `null` 是字符串
没匹配到时响应体是 **`null` 这 4 个 ASCII 字符**。`fyserver` 的写法最直白：

```csharp
var match = matches.GetActiveMatchForUser(user.Id);
if (match == null) return Results.Text("null");    // ← 纯文本，不是 JSON null
```

写成 JSON `null` 或 `{}` 客户端会解析失败。
:::

匹配到之后，`GET /matches/v2/{id}` 只是保活，返回 `"running"` 字符串即可。

## 第三步：开局数据 `MatchStartingInfo`

这是整条链路里第二大的结构（仅次于 `SessionResponse`）：

```jsonc
{
  "local_subactions": true,
  "match_and_starting_data": {
    "match": {
      "action_player_id": 2,                  // 轮到谁
      "action_side": "right",
      "actions": [],
      "actions_url": "http://127.0.0.1:5231/matches/v2/482913/actions",
      "current_action_id": 0,
      "current_turn": 1,
      "deck_id_left": 428173, "deck_id_right": 991204,
      "left_is_online": 1, "right_is_online": 1,
      "match_id": 482913,
      "match_type": "battle",                 // battle | code | brawl | draft | training
      "match_url": "http://127.0.0.1:5231/matches/v2/482913",
      "modify_date": "2025-07-06T04:06:03.123456Z",
      "notifications": [],
      "player_id_left": 1, "player_id_right": 2,
      "player_status_left": "not_done",       // not_done → mulligan_done → end_match
      "player_status_right": "not_done",
      "right_is_online": 1,
      "start_side": "left",
      "status": "pending",                    // pending → running → finished
      "winner_id": 0, "winner_side": ""
    },
    "starting_data": {
      "ally_faction_left": "finland",         // ← 小写
      "ally_faction_right": "italy",
      "card_back_left": "cardback_starter_germany",
      "card_back_right": "cardback_starter_britain",
      "starting_hand_left":  [ /* 4 张 MatchCard */ ],
      "starting_hand_right": [ /* 5 张 */ ],
      "deck_left":  [ /* 剩余 36 张 */ ],
      "deck_right": [ /* 剩余 35 张 */ ],
      "equipment_left": ["cardback_x"],       // 只发 item_id
      "equipment_right": [],
      "is_ai_match": false,
      "left_player_name": "<anon>", "right_player_name": "<anon>",
      "left_player_officer": false, "right_player_officer": false,
      "left_player_tag": 1234, "right_player_tag": 5678,
      "location_card_left":  { /* HQ 卡 */ },
      "location_card_right": { /* HQ 卡 */ },
      "player_id_left": 1, "player_id_right": 2,
      "player_stars_left": 120, "player_stars_right": 120
    }
  }
}
```

注意 `ally_faction_*` 是**小写**，而卡组头里的 `ally_faction` 是 `Finland`——同一个信息两种大小写，别复用同一个 DTO。

### `MatchCard`

```jsonc
{
  "card_id": 7,                    // 本局唯一，客户端用它指代一张牌
  "is_gold": false,
  "location": "hand_left",         // deck_left/deck_right/hand_left/hand_right/board_hqleft/board_hqright
  "location_number": 2,            // 同一 location 内的序号（手牌从左到右）
  "name": "card_unit_1st_infantry" // 卡牌资产名
}
```

### 发牌算法

规则简单但有一处必须照做——**双方 `card_id` 的号段要不重叠**：

| 侧 | `card_id` 起始 | 起手 | 牌库 |
|---|---|---|---|
| left | `1` 起（第 1 个给 HQ） | 4 张 | 剩余 36 张 |
| right | `41` 起（第 1 个给 HQ） | 5 张 | 剩余 35 张 |

```csharp
// 1. 解析卡组码 → 展开成 30 张（40 张含倍数）卡牌实例，card_id 从 startId 递增
//    先给 HQ 卡留一个 id：locationCard 用 startId，随后 startId++ 再发牌
foreach (var group in groups.Select((g, i) => (g, i)))            // i 即"倍数 - 1"
    foreach (var pair in group.g.Chunk(2))
        for (int n = 0; n <= group.i; n++)
            cards.Add(new MatchCard(CardId: startId++, IsGold: false,
                                    Location: isLeft ? "deck_left" : "deck_right",
                                    LocationNumber: 0, Name: table[pair].Card));

// 2. 洗牌：随机排序后重排 location_number
cards = cards.OrderBy(_ => Random.Shared.Next())
             .Select((c, i) => c with { LocationNumber = i }).ToList();

// 3. 切手牌：左侧 4 张、右侧 5 张，手牌 location_number 从 0 重排，牌库接着排
var hand = cards.Take(isLeft ? 4 : 5)
                .Select((c, i) => c with { Location = isLeft ? "hand_left" : "hand_right", LocationNumber = i });
var deck = cards.Skip(4)
                .Select((c, i) => c with { LocationNumber = i + 4 });
```

::: tip 三个"必须一致"的点
1. **同一局的双方必须拿到同一份开局数据**：并发轮询很容易触发两次生成 → 两个人看到不同的初始手牌。用锁 + 缓存（`match.MatchStartingInfo != null` 直接返回）。
2. **`action_player_id` / `action_side` 是相对视角**：给 left 玩家看时指向 right，反之亦然。参考实现每次返回前都重算这两个字段。
3. **HQ 卡的 `card_id` 也算一号**：不预留会让 HQ 和第一张手牌撞 id，客户端会出现"出一张牌凭空变成 HQ"的诡异 bug。
:::

---

开局完成，牌桌出现。下一章：动作怎么传。
