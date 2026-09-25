---
title: 13 · 人机对局与对局内 actions 协议
---

# 13 · 人机对局与对局内 actions 协议

这一章的材料来自两处：**官服实测**（只读查询 + 一次进入训练局）+ **一份真实对局的 actions 轮询抓包**（感谢读者提供）。它补上了本系列此前唯一"只能靠反编译猜"的区域——**对局内动作在网络上到底长什么样**。

::: tip 一句话结论
`actions` 数组里装的**不是 JSON 对象，而是 codec 编码串**（第 4 章那套）。每个动作是一条独立的包，解码后才是 `{action_id, action_type, player_id, action_data, sub_actions, turn_number}`。
:::

## 一、进入人机：`POST /singleplayerlobby`

```http
POST /singleplayerlobby
Authorization: JWT <token>

{ "player_id": <id>, "deck_id": <deck_id>,
  "extra_data": { "match_type": "training" } }
```

```http
HTTP/1.1 201 Created
Content-Type: text/plain; charset=utf-8

OK
```

注意响应是 **201 + 裸文本 `OK`**（不是 JSON）——两套参考实现都是这么写的，与官服一致。

| 入口 | 端点 | 语义 |
|---|---|---|
| 真人对战 | `POST /lobbyplayers` | 进匹配队列，等真人 |
| **人机对战** | `POST /singleplayerlobby` | **直接开局**，对手是服务端 AI |

`extra_data.match_type` 实测取值为 `"training"`；这个整包就是"训练模式"的开关，客户端还会据此在界面上隐藏对手资料。

::: warning `"pw"` 不是线上值，是 `fyserver` 的内部标记
你在参考实现里会看到 `ex == "pw"` 这类判断（[第 8 章](/private-server/08-match-actions)也引用了它）。追一下来源就清楚了：`fyserver` 把请求里的 `extra_data` 存进自己的 `Ex` 字段（默认 `"training"`），而在创建人机局时**主动把它改写成 `"pw"`**，之后所有"这是人机局吗"的判断都看 `pw`。

也就是说：**客户端从不发送 `"pw"`**，官服里也没有这个值——它纯粹是那套实现的自造标记。要对齐官服，认 `match_type: "training"`。
:::

## 二、开局载荷（官方 `GET /matches/v2/` 实测）

顶层**只有一个键** `match_and_starting_data`。

### `match`（23 字段，实测值）

| 字段 | 实测值 | 备注 |
|---|---|---|
| `match_id` | `<match_id>` | |
| `match_type` | `"training"` | 人机局就是 `training` |
| `status` | `"running"` | **开局即 running**（参考实现先给 `pending`） |
| `start_side` | `"left"` | |
| `current_turn` / `current_action_id` | `1` / `0` | |
| `actions` / `notifications` | `[]` / `[]` | **空数组**，不是 `null` |
| `action_player_id` / `action_side` | `<id>` / `"left"` | 本局"我是哪一边" |
| `player_id_left` / `player_id_right` | `<id>` / **`-2020`** | 机器人的 id 是**负数** |
| `deck_id_left` / `deck_id_right` | `<deck_id>` / **`-202`** | 机器人的卡组 id 也是负数 |
| `player_status_left` / `player_status_right` | `"not_done"` / `"mulligan_done"` | **机器人开局就已完成换牌** |
| `left_is_online` | `1` | ⚠️ **整数** |
| `right_is_online` | `true` | ⚠️ **布尔** |
| `winner_id` / `winner_side` | `0` / `""` | |
| `actions_url` / `match_url` | 绝对 URL | 指向同一主机 |
| `modify_date` | `"2026-09-25T06:30:08.422123Z"` | ISO，6 位小数 |

::: warning 同一对字段，左右类型不同
`left_is_online` 是**整数** `1`，`right_is_online` 是**布尔** `true`——这是官服自己就不一致。用强类型语言反序列化时**必须一个 int 一个 bool**，否则整包解析失败。参考实现（Go/C#）都踩过这个点。
:::

### `starting_data`（22 字段，关键值）

| 字段 | 实测值 |
|---|---|
| `is_ai_match` | **`true`** ← 人机的判定标志 |
| `right_player_name` | **`"Fischer"`** ← 官方训练机器人有名字 |
| `left_player_name` | `<player_name>` |
| `card_back_left` / `card_back_right` | `"cardback_starter_japan"` / `"cardback_starter_german"` |
| `ally_faction_left` / `ally_faction_right` | `"germany"` / `"germany"` |
| `starting_hand_left` / `deck_left` | **4 张** / **35 张** |
| `starting_hand_right` / `deck_right` | **5 张** / **34 张** |
| `left_player_tag` / `right_player_tag` | `<tag>` / **`null`** |
| `left_player_officer` / `right_player_officer` | `false` / **`null`** |
| `player_stars_left` / `player_stars_right` | **`0`** / **`0`** |
| `equipment_left` / `equipment_right` | `[]` / `[]` |
| `location_card_left` / `location_card_right` | HQ 牌对象 |

### 机器人的六个可观测特征

1. `is_ai_match: true`（显式标志）；
2. `player_id_right` 是**负整数**（实测 `-2020`）；
3. `deck_id_right` 也是**负数**（实测 `-202`）；
4. `right_player_name` 是**固定名字**（实测 `"Fischer"`）；
5. `right_player_tag` / `right_player_officer` 是 **`null`**；
6. 开局 `player_status_right` 已是 `mulligan_done`——**AI 不等你，先换完牌**。

> 自建服务只要把 `is_ai_match` 置 `true` 并让右侧状态先到 `mulligan_done`，客户端就会走人机界面的分支。负 id 与固定名字是"像官服"的加分项，不是硬要求。

### 牌对象形态（两种）

手牌（**5 字段，无 `faction`**）：

```json
{ "card_id": 37, "is_gold": false, "location": "hand_left",
  "location_number": 0, "name": "card_unit_zero" }
```

HQ 牌（**6 字段，多一个 `faction`**）：

```json
{ "card_id": 1, "faction": "japan", "is_gold": false,
  "location": "board_hqleft", "location_number": 0, "name": "card_location_changchun" }
```

`card_id` 是数字 id，`name` 是资产名——**牌这边两者都有**（与第 11 章卡牌库"只有 `card_type`"形成对比）。`location` 是小写的 `ECardLocationEnum` 名。

## 三、actions 轮询 `PUT /matches/v2/{id}/actions`

客户端**持续 PUT 这个地址**来收动作（不是 WebSocket）：

```jsonc
// 请求（3 个字段）
{ "min_action_id": 3, "opponent_id": <opponent_id>, "time_since_opponent_ping": 0 }
```

```jsonc
// 无新动作时的响应（实测 101 字节）
{ "match": { "player_status_left": "not_done",
             "player_status_right": "mulligan_done",
             "status": "running" } }

// 有新动作时（真实抓包）
{ "actions": [ "43000171iigcg9DoI3YwDfU9K2UeRy/qCLV8yTbujAzkONQQ/HBslDD1aNhkbDzEbcRJmSXJbThI3JTlWJiAbBQ9jQEttDzIlRghXAQEtfjgDJw53FWsQJQkzAEoDHCUyGkN0WkJbcExfeGJxc04ETS0AJ2w9FjAHdwNrSXcXNxhcHi1ubBhbJxcHGCQUDyo8c30PRU4tASdWKyg3DzFcaQh1Rz4cSQVhMXoYWycXFzUgGR8mIT8iDV0ZHzJlE3sDMRQ7ZiVHOAc3Cw1LY30r" ],
  "match": { "player_status_left": "mulligan_done",
             "player_status_right": "mulligan_done",
             "status": "finished" },
  "opponent_polling": true }
```

::: tip 三个"省略"规则（实测）
1. **没有新动作时 `actions` 键直接不出现**（不是 `[]`）；
2. **对手没在轮询时 `opponent_polling` 键不出现**（不是 `false`）；
3. 轮询响应里的 `match` **只有 3 个字段**（两个 `player_status_*` + `status`），不是开局那 23 个。

参考实现里 Go 版把 `opponent_polling` 无条件写进响应，属于轻微偏离——客户端能容忍，但贴着官服更好。
:::

## 四、`actions` 数组里是 codec 包

上面那条长字符串就是第 4 章的包格式：

```
43       000171   iigc    <37 字节密钥>              <base64 密文>
表索引    明文长度  action_id(3 字节, 与密钥前 3 字节异或后 base64)
```

把它解出来是：

```json
{
  "action_id": 3,
  "action_type": "ActionEndMatch",
  "player_id": <opponent_id>,
  "action_data": { "reason": "surrender", "winner_side": "left" },
  "sub_actions": [],
  "turn_number": 1
}
```

即"**右侧玩家在回合 1 投降**"，与响应里 `status: "finished"` 吻合。

### 动作对象字段

| 字段 | 说明 |
|---|---|
| `action_id` | 单调递增，与轮询请求的 `min_action_id` 配合做增量拉取 |
| `action_type` | 动作类型名（本条为 `ActionEndMatch`） |
| `player_id` | **动作发起者**（投降的是他） |
| `action_data` | 动作参数，随类型变化 |
| `sub_actions` | 子动作数组 |
| `turn_number` | 回合号 |

::: warning 动作类型命名：官服有 `Action*`，参考实现用 `XAction*`
实测这条是 **`ActionEndMatch`**（无 `X` 前缀），而两套参考实现里用的是 `XActionStartOfTurn` / `XActionEndOfTurn` / `XStartOfGame` 这类 `XAction*` 名字。

这两套命名**大概率是并存的**（`XAction*` 走对局内玩法，`Action*` 走对局级事件），但本系列只实测到后者这一条。**补实现时按客户端反编译里的字符串常量对齐**，别照抄参考实现的名字。
:::

### .NET 解包的一个坑（我踩了）

Go 的官方实现是这么取 action_id 的：

```go
headerBytes, _ := base64.StdEncoding.DecodeString(packet[8:12] + "==")  // Go 容忍并忽略错误
```

**同样的写法在 .NET 会直接抛异常**——`packet[8:12]` 是 4 个字符（已是一个完整 base64 三元组），再补 `==` 就变成非法输入：

```csharp
// ❌ Convert.FromBase64String(p.Substring(8, 4) + "==")  → 抛 FormatException
var header = Convert.FromBase64String(p.Substring(8, 4));   // ✅ 4 字符直接用
```

### 提交动作（客户端 → 服务端）

两个方向都用 codec 包，但装在**不同的外层字段**里：

| 方向 | 端点 | 外层 |
|---|---|---|
| 轮询收动作 | `PUT /matches/v2/{id}/actions` | 明文 JSON（`min_action_id` 等） |
| 提交动作 | `POST /matches/v2/{id}/actions` | `{ "a": "<codec 包>" }` |
| 结束对局 | `PUT /matches/v2/{id}` | `{ "a": "<codec 包>" }`，明文为 `{"action":"end-match","value":{…}}` |

## 五、与参考实现对照

| 项 | 官服实测 | `kardsservergo` | `fyserver` |
|---|---|---|---|
| 机器人 id | **`-2020`** | `900000001`（正数） | `-9178`（负数 ✓） |
| 机器人名字 | `"Fischer"` | `"Training Bot"` | — |
| 人机标记 | `is_ai_match: true` | `is_ai_match` | 内部 `Ex == "pw"` |
| `player_stars_*` | `0` | `20` | — |
| `right_player_tag` | `null` | `0` | — |
| 开局 `status` | `"running"` | `"pending"` → 双方载入后转 `running` | — |
| `opponent_polling` | 对手没轮询时**省略** | 恒发（含 `false`） | — |
| 顶层键 | 只有 `match_and_starting_data` | 额外有 `local_subactions` / `action_player_id` / `action_side` | 一致 |
| 动作类型 | 实测 `ActionEndMatch` | `XActionStartOfTurn` / `XActionEndOfTurn` | 同 Go |

**结论**：字段名和结构基本照抄成功（`match` 23 项、`starting_data` 22 项**逐一相同**），差的是**取值风格**。这说明参考实现是先有一份字段清单、再自行填值的——所以"能进游戏"但"不完全像官服"。

## 六、自写最小人机实现

只要三个端点就能跑通人机：进局、开局载荷、轮询（并按需广播 AI 动作）。

::: code-group

```csharp [C#]
// 1) 进人机 —— 201 + 裸文本 OK
app.MapPost("/singleplayerlobby", (LobbyReq req, MatchStore store, HttpContext ctx) =>
{
    var id = Auth.PlayerId(ctx);
    var match = store.CreateBotMatch(id, req.deck_id, req.extra_data.match_type); // 机器人已在右侧换完牌
    return Results.Text("OK", "text/plain", 201);
});

// 2) 开局载荷 —— 顶层只有 match_and_starting_data；注意 left_is_online 是 int、right_is_online 是 bool
app.MapGet("/matches/v2/", (MatchStore store, HttpContext ctx) =>
{
    var m = store.Current(Auth.PlayerId(ctx));
    if (m is null) return Results.Text("null", "application/json");   // 无对局 = JSON null
    return Results.Ok(new { match_and_starting_data = new { match = m.Header(), starting_data = m.Starting() } });
});

// 3) 轮询 —— 无新动作时不要发 actions / opponent_polling 键
app.MapPut("/matches/v2/{id}/actions", (int id, PollReq req, MatchStore store) =>
{
    var m = store.Get(id);
    var payload = new Dictionary<string, object?>
    {
        ["match"] = new { player_status_left = m.StatusLeft, player_status_right = m.StatusRight, status = m.Status }
    };
    var fresh = m.Actions.Where(a => a.ActionId >= req.min_action_id).Select(a => a.Packet).ToList();
    if (fresh.Count > 0) payload["actions"] = fresh;                       // ← 空则不出现
    if (m.OpponentPolling(req.opponent_id)) payload["opponent_polling"] = true; // ← false 则不出现
    return Results.Ok(payload);
});
```

```go [Go]
// 1) 进人机
func JoinSinglePlayerLobby(c *gin.Context) {
    var req struct {
        PlayerID  uint `json:"player_id"`
        DeckID    uint `json:"deck_id"`
        ExtraData struct {
            MatchType string `json:"match_type"`
        } `json:"extra_data"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
        return
    }
    user := c.MustGet("user").(*models.User)
    if _, err := game.GlobalManager.CreateBotMatch(user.ID, req.DeckID); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    c.String(http.StatusCreated, "OK") // ← 201 纯文本
}

// 2) 轮询：只发"非空/非假"的键
func PollActions(c *gin.Context) {
    var req struct {
        OpponentID  int `json:"opponent_id"`
        MinActionID int `json:"min_action_id"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.Status(http.StatusBadRequest)
        return
    }
    match, _, _, ok := currentUserMatch(c)
    if !ok {
        return
    }
    match.RLock()
    defer match.RUnlock()

    resp := gin.H{"match": gin.H{
        "player_status_left":  match.PlayerStatusLeft,
        "player_status_right": match.PlayerStatusRight,
        "status":              match.Status,
    }}
    actions := []string{}
    for _, id := range match.Actions {
        if id < req.MinActionID {
            continue
        }
        if pkt, ok := match.ActionsData[id]; ok {
            actions = append(actions, pkt)
        }
    }
    if len(actions) > 0 {
        resp["actions"] = actions // ← 空则省略
    }
    if match.OpponentPolling(req.OpponentID) {
        resp["opponent_polling"] = true // ← false 则省略
    }
    c.JSON(http.StatusOK, resp)
}
```

:::

AI 这边最省事的做法（参考实现的思路）：**等玩家结束回合后，延迟若干秒把"开始回合 + 结束回合"两条 codec 包塞进动作队列**，玩家一侧就会看到对手"思考了一下然后过牌"。要做真正的 AI，再在这两条之间插入出牌动作即可。
