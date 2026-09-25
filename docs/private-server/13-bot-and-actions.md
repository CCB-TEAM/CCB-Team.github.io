---
title: 13 · 人机对局与对局内协议
---

# 13 · 人机对局与对局内协议

这一章的材料来自三处：**官服实测**（含一轮"自己写客户端去打完整局"的尝试）、**一份真实对局的轮询抓包**（读者提供）、以及**客户端 UHT 结构体**。它补上了本系列此前唯一"只能靠反编译猜"的区域——**对局内动作在网络上到底长什么样**。

::: tip 三条一句话结论
1. `actions` 数组里装的**不是 JSON 对象，而是 codec 编码串**（第 4 章那套），每条解码后是一个 action。
2. **`location_number` 是"牌序位"**——发牌时手牌 `0..N-1`、牌库紧接 `N..38`；换牌后服务端会给牌库**重新编号**。
3. 玩法动作的**提交格式**已由一份真实客户端抓包解开（第九节）：外层 `{a: 包}`，包内除 `action_type` / `action_data` 外**还必须有 `local_subactions`**。**但按这个格式打官服依然被拒**——官服另有门槛，第九节列了完整的排除过程与剩下的唯一线索。
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

响应是 **201 + 裸文本 `OK`**（不是 JSON）。

| 入口 | 端点 | 语义 |
|---|---|---|
| 真人对战 | `POST /lobbyplayers` | 进匹配队列，等真人 |
| **人机对战** | `POST /singleplayerlobby` | **直接开局**，对手是服务端 AI |

::: warning `"pw"` 不是线上值，是 `fyserver` 的内部标记
参考实现里有 `ex == "pw"` 这类判断（[第 8 章](/private-server/08-match-actions)也引用了它）。追来源：`fyserver` 把请求里的 `extra_data` 存进自己的 `Ex` 字段（默认 `"training"`），创建人机局时**主动改写成 `"pw"`**，之后所有"这是人机局吗"的判断都看 `pw`。

**客户端从不发送 `"pw"`**，官服里也没有这个值——它纯粹是那套实现的自造标记。要对齐官服，认 `match_type: "training"`。
:::

## 二、开局载荷（`GET /matches/v2/` 实测）

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
`left_is_online` 是**整数** `1`，`right_is_online` 是**布尔** `true`——官服自己就不一致。强类型语言反序列化时**必须一个 int 一个 bool**，否则整包解析失败。两套参考实现都踩过这个点。
:::

### `starting_data`（22 字段，关键值）

| 字段 | 实测值 |
|---|---|
| `is_ai_match` | **`true`** ← 人机的判定标志 |
| `right_player_name` | **`"Fischer"`** ← 官方训练机器人有名字 |
| `left_player_name` | `<player_name>` |
| `card_back_left` / `card_back_right` | `"cardback_starter_japan"` / `"cardback_starter_german"` |
| `ally_faction_left` / `ally_faction_right` | `"germany"` / `"germany"` |
| `starting_hand_left` / `deck_left` | **4 张 / 35 张**（先手）或 **5 张 / 34 张**（后手） |
| `starting_hand_right` / `deck_right` | 5 张 / 34 张 |
| `left_player_tag` / `right_player_tag` | `<tag>` / **`null`** |
| `left_player_officer` / `right_player_officer` | `false` / **`null`** |
| `player_stars_left` / `player_stars_right` | **`0`** / **`0`** |
| `equipment_left` / `equipment_right` | `[]` / `[]` |
| `location_card_left` / `location_card_right` | HQ 牌对象 |

> **先手/后手的手牌数**：多局实测出现过"我方 4 张 / 牌库 35 张"与"我方 5 张 / 牌库 34 张"两种，总数恒为 39。合理解释是先手少一张、后手多一张（补偿先后手），但**官服字段里没有直接写明**，这一点属于推断。

### 机器人的六个可观测特征

1. `is_ai_match: true`（显式标志）；
2. `player_id_right` 是**负整数**（多局实测：`-2020`、`-2030`）；
3. `deck_id_right` 也是**负数**（实测 `-202`）；
4. `right_player_name` 是**固定名字**（实测 `"Fischer"`）；
5. `right_player_tag` / `right_player_officer` 是 **`null`**；
6. 开局 `player_status_right` 已是 `mulligan_done`——**AI 不等你，先换完牌**。

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

`card_id` 是数字 id，`name` 是资产名——**牌这边两者都有**（与第 11 章卡牌库"只有 `card_type`"形成对比）。`location` 是小写 `ECardLocationEnum` 名。

## 三、开局换牌

### 端点是 `POST`，不是 `PUT`

```http
POST /matches/v2/{id}/mulligan
{ "discarded_card_ids": [33, 13] }
```

::: warning 用 `PUT` 会拿到 405 和一个非常有用的错误外壳
`kardsservergo` 把换牌注册成了 `PUT`，官服实测是 **`POST`**。发 `PUT` 会返回：

```json
{ "error": { "code": "user_error",
             "description": "The method is not allowed for the requested URL." },
  "message": "Method Not Allowed",
  "status_code": 405 }
```

这是官服（Flask + Werkzeug）的**统一错误外壳**——看到 `error.code` / `message` / `status_code` 三件套就知道是"路由层拒绝"；而 `ACTION_ERROR` 那样的**纯文本**是"游戏层拒绝"。两种错误形状可以拿来区分问题出在哪一层。
:::

### 响应：服务端把洗好的整副牌回给你

```jsonc
HTTP/1.1 201 Created
{
  "ai_error": true,                       // 人机局为 true
  "deck":  [ /* 34 张，已洗牌、已重新编号 */ ],
  "replacement_cards": [ /* 2 张新牌 */ ]
}
```

实测键就这三个（`ai_error` / `deck` / `replacement_cards`），与 `fyserver` 的 `MulliganResult(Deck, ReplacementCards)` 对得上（它少了 `ai_error`）。

::: tip 为什么必须把整副牌回传
换牌之后**牌序由服务端重新决定**（洗牌）。客户端手里没有新牌序，只能信服务端这一份 `deck`。自建服务如果只回 `replacement_cards` 而不回 `deck`，客户端会继续用旧牌序——**抽牌结果与"服务端以为的"立刻分叉**，这是很隐蔽的一类 bug。
:::

### 换牌结果还能从两个 GET 端点读

| 请求 | 换牌**前** | 换牌**后** |
|---|---|---|
| `GET /matches/v2/{id}/mulligan/left` | `{}`（3 字节） | 3848 字节（我方完整结果） |
| `GET /matches/v2/{id}/mulligan/right` | — | 3762 字节（**对手**的完整结果） |

即：**客户端会去拉对手的换牌结果**（用来显示对手换了几张）。未换牌时返回的是**空对象 `{}`**——注意 `fyserver` 这里返回字符串 `"null"`，与官服不同（空对象和 `null` 在客户端的解析路径不一样）。

## 四、`location_number` 到底是什么

这是对局数据里最容易误读的字段。实测三组数据：

**① 发牌时连续编号（这一局我方 5 张手牌）**

```text
手牌 location_number: 33:0  13:1  5:2  20:3  29:4
牌库 location_number: 24:5  22:6  9:7  40:8  8:9  …（共 34 张）
```

手牌是 `0..4`，牌库**紧接** `5..38`——**两段连号**。

**② 对手没换牌时，编号保持原样**

```text
对手（机器人）牌库前 3: 59@deck_right:5  58@deck_right:6  49@deck_right:7
```

机器人 0 张替换，手牌仍是 `0..4`，牌库从 `5` 起。

**③ 一旦换牌，牌库被重新编号**

我弃掉手牌里 `location_number` 为 `0` 和 `1` 的两张（card_id 33、13），服务端返回：

```text
deck 前 3:          23@deck_left:0   18@deck_left:1   7@deck_left:2      ← 牌库重新从 0 开始
replacement_cards:  24@hand_left:0   22@hand_left:1                     ← 新牌接替被弃牌的槽位号
```

**规则归纳**：

- `location_number` 是**该玩家牌序中的位置号（0 基）**，不是"某个 location 内的第几个"；
- 发牌时按"手牌 + 牌库"整体连续编号（手牌占 `0..N-1`，牌库接 `N..38`）；
- **换牌会触发牌库重新编号**（从 0 开始），替补牌**继承被弃牌的槽位号**；
- 因此**不能把 `location_number` 当稳定主键**——它是服务端每轮重算的位置信息。稳定的身份是 `card_id`（配合 `is_gold`）。

> 这条解释了一个常见现象：自建服务若"随便给 `location_number`"，换牌后客户端的手牌位置会错乱，而且**只在换过牌的局里出现**。

## 五、一局的完整时序（实测）

| # | 客户端动作 | 实测结果 |
|---|---|---|
| 1 | `POST /singleplayerlobby` | `201 OK`，对局已创建 |
| 2 | `GET /matches/v2/` | 拿到 `match_and_starting_data`（23 + 22 字段） |
| 3 | `GET /matches/v2/{id}/mulligan/left` | `{}`（还没有换牌结果） |
| 4 | `POST /matches/v2/{id}/mulligan` | `201`，返回 `ai_error` / `deck`(34) / `replacement_cards`(2) |
| 5 | `GET /matches/v2/{id}/mulligan/right` | 对手（AI）的换牌结果 |
| 6 | `GET /matches/v2/{id}` | **裸文本 `running`** ← 关卡载入完成信号 |
| 7 | `PUT /matches/v2/{id}/actions` | `{"match":{…"status":"running"}}`，此时**没有** `actions` 键 |
| 8 | `POST /matches/v2/{id}/actions` | ⚠️ **实测全部 `400 ACTION_ERROR`**（见第九节） |
| 9 | …回合循环… | 未能进入（卡在第 8 步） |
| 10 | `PUT /matches/v2/{id}`（`{a: 包}`，`action: "end-match"`） | 结束对局的通道（形状来自参考实现，**未实测**） |

第 6 步值得单独说：`GET /matches/v2/{id}` 的响应是**一个裸字符串**（`running` / `finished` 之类），它同时充当"我这边的关卡载入完了"的信号。参考实现里这个接口正是把 `lvl_loaded_left` 置 1、双方都置 1 就转 `running`——**与官服行为一致**。

### 真实一局的动作流（抓包解码，逐条）

一份真实客户端打完整局的抓包，把一局的骨架完整暴露出来了：

| aid | 提交方 | `action_type` | `player_id` | `turn_number` | `action_data` |
|---|---|---|---|---|---|
| 1 | 我方 | `XStartOfGame` | 我方 | `0` | `{"playerID": <我方 id>}` |
| 2 | 我方 | `XActionStartOfTurn` | 我方 | `1` | `{"side":"left","56":"20"}` |
| 3 | 我方 | `XActionEndOfTurn` | 我方 | `1` | `{"side":"left","reason":"endTurnButton","56":"20"}` |
| 4 | 机器人 | `XActionStartOfTurn` | 机器人 | `2` | `{"side":"right","75":"20"}` |
| 5 | 机器人 | `XActionEndOfTurn` | 机器人 | `2` | `{"side":"right","75":"20"}` |
| 6 | 机器人 | `ActionEndMatch` | 我方 | `2` | `{"reason":"surrender","winner_side":"right"}` |
| 7 | — | `XActionStartOfTurn` | 我方 | `3` | `{"side":"left","56":"20"}` |

几个可复用的规律：

- **`turn_number` 从 0 起**：`XStartOfGame` 是 turn 0，之后每个"开始/结束回合"占一个 turn；
- **`ActionEndMatch` 的 `player_id` 是"发起结束的人"**（本局我方投降），但它的 `action_data` 里写的是 `winner_side`（机器人一侧）；
- 机器人那两条的 `action_data` **没有 `reason`**，玩家的结束回合有 `reason: "endTurnButton"`——两种都能被客户端接受；
- 机器人的 `side` 是 `right`、数值键是 **`"75"`**；我方是 `left` + **`"56"`**（见第九节的解释）；
- aid 7 是**对局已经 `finished` 之后**又多出来的一条"开始回合"（服务端的定时器没停）——客户端照样收了，没出问题，但实现时该在终局后停掉 AI 定时器。

## 六、actions 轮询与滑动窗口

```jsonc
// 请求（3 个字段）
PUT /matches/v2/{id}/actions
{ "min_action_id": 3, "opponent_id": <opponent_id>, "time_since_opponent_ping": 0 }
```

```jsonc
// 有新动作（真实抓包）
{ "actions": [ "43000171iigcg9DoI3YwDfU9K2UeRy/qCLV8yTbujAzkONQQ/HBslDD1aNhkbDzEbcRJmSXJbThI3JTlWJiAbBQ9jQEttDzIlRghXAQEtfjgDJw53FWsQJQkzAEoDHCUyGkN0WkJbcExfeGJxc04ETS0AJ2w9FjAHdwNrSXcXNxhcHi1ubBhbJxcHGCQUDyo8c30PRU4tASdWKyg3DzFcaQh1Rz4cSQVhMXoYWycXFzUgGR8mIT8iDV0ZHzJlE3sDMRQ7ZiVHOAc3Cw1LY30r" ],
  "match": { "player_status_left": "mulligan_done",
             "player_status_right": "mulligan_done", "status": "finished" },
  "opponent_polling": true }
```

### 三条"省略"规则（实测）

1. **没有新动作时 `actions` 键直接不出现**（不是 `[]`）；
2. **对手没在轮询时 `opponent_polling` 键不出现**（不是 `false`）；
3. 轮询响应里的 `match` **只有 3 个字段**（两个 `player_status_*` + `status`），不是开局那 23 个。

### 滑动窗口：`min_action_id` 是**闭区间下界**

抓包里客户端用 `min_action_id: 3` 轮询，返回的正好是 `action_id: 3` 那一条（解码后确认）——**id ≥ min 的全部返回，边界包含在内**。所以客户端每次把"已处理到的最大 id"发上来即可，不需要 +1。

响应里的 `actions` 是从旧到新排列的**增量切片**，客户端按序解码应用。

**窗口实测**（真客户端 + 私服，一局完整的抓包）：

| 轮询 | 返回 |
|---|---|
| `min_action_id: 1`（动作还没产生时） | **0 条**（响应里没有 `actions` 键） |
| `min_action_id: 1`（稍后） | **5 条**（`aid` 1..5 全量重放） |
| `min_action_id: 6` | **2 条**（`aid` 6、7） |

两次 `min_action_id: 1` 的对比说明：**服务端保留完整历史、按下界全量重放，未见任何截断**（至少 5 条以内是完整回放的）。

::: tip 一个容易踩的点：你提交的动作会被广播回来
上面那次 `min_action_id: 1` 返回的 5 条里，**aid 1/2/3 正是客户端自己刚提交的三个动作**（服务端把它们连同机器人的动作一起广播）。也就是说动作流是**双向合流**的，客户端靠 `action_id` 去重、靠它确认"我的动作生效了"。

自建服务端必须把客户端提交的动作**按 `action_id` 追加进同一条流**，否则客户端会一直等自己的动作回执。
:::

至于服务端**最多**保留多少条（一局拖很久会不会截断、截断策略是什么），本次仍没测出来——需要一局有几十条以上动作的对局才能逼近上限，如实标出。

> 轮询很频繁（客户端几百毫秒一次），实现时必须**只读内存、无 IO**，否则会拖垮整个服务。

## 七、action 系列

### 客户端结构体（UHT，权威类型定义）

```cpp
struct FActionValue2 {          // 一个"具名值"
    FString Name;
    int32   Value;
    FString Text;
};

struct FSubAction {             // 具名子动作
    FString               Name;
    TArray<FActionValue2> Values;
};

struct FAction2 {               // 一条动作
    int32                 action_id;
    FString               action_type;
    int32                 player_id;
    TArray<FActionValue2> action_data;
    TArray<FSubAction>    sub_actions;
};
```

::: warning 结构体与线路有三处不一致
| 项 | 客户端结构体 | 线路实测 |
|---|---|---|
| `action_data` | `TArray<FActionValue2>`（**数组**） | **JSON 对象** `{"reason":"surrender","winner_side":"left"}` |
| `turn_number` | **没有这个字段** | **有**（实测 `1`） |
| `sub_actions` | `TArray<FSubAction>` | 空数组 `[]` |

客户端把线路上的对象**按 key 展开**成 `FActionValue2` 数组（key → `Name`），服务端还多发了一个结构体里没有的 `turn_number`。**自建服务照线路发对象即可**，不要按结构体发数组。
:::

### `action_data` 的三种值形态

`FActionValue2` 有 `Name` / `Value` / `Text` 三个字段，线路上的对象值按类型落到不同字段：

| 线路写法 | 落到 |
|---|---|
| `{"reason": "surrender"}` | `Name=reason`，**`Text`**=`"surrender"` |
| `{"75": 20}` | `Name="75"`，**`Value`**=`20` |
| `{"winner_side": "left"}` | `Name=winner_side`，`Text="left"` |

参考实现里同一个 key 既出现过字符串也出现过数字（`{"75": "20"}` 与 `{"75": 20}`）——**两种都能被接住**，但语义落在不同字段上。要用数字语义就发数字。

### 三条通道

| 通道 | 端点 | 明文外层 | 用途 |
|---|---|---|---|
| 玩法动作 | `POST /matches/v2/{id}/actions` | 一个 `FAction2`（`action_type` / `action_data`…） | 出牌、攻击、结束回合 |
| 对局级会话动作 | `PUT /matches/v2/{id}` | `{"side":"","action":"end-match","value":{…}}` | 投降/结束对局 |
| 玩家级会话动作 | `PUT /players/{codec 包}` | **裸 JSON** `{"action":"accept-eula","value":"accepted"}` | 遥测、同意协议 |

对局的两条通道把明文包在 **`{ "a": "<codec 包>" }`** 里；玩家级那条**不套 codec 信封**——它把玩家标识编码进 **URL 路径**，body 就是普通 JSON。详见[附录 H](/private-server/appendix/client-capture)第七节。

### 真实客户端提交的动作（抓包实录）

一份真实客户端打人机局的抓包，把提交格式完整暴露了（明文部分，`a` 字段里的包解出来后就是这些）：

```jsonc
// ① XStartOfGame —— 128 B
{ "action_type": "XStartOfGame", "player_id": <我方 id>,
  "action_data": { "playerID": <我方 id> },        // ← 注意是 camelCase 的 playerID
  "action_id": 1, "local_subactions": 1 }

// ② XActionStartOfTurn —— 142 B
{ "action_type": "XActionStartOfTurn", "player_id": <我方 id>,
  "action_data": { "side": "left", "56": "20" },
  "action_id": 2, "local_subactions": 1 }

// ③ XActionEndOfTurn —— 14 360 B（大头是 match_data）
{ "action_type": "XActionEndOfTurn", "player_id": <我方 id>,
  "match_data": { "cards": "[{…82 张牌…}]", "kredits_left": …, "match_type": "training", … },
  "action_data": { "side": "left", "reason": "endTurnButton", "56": "20" },
  "action_id": 3, "local_subactions": 1 }
```

::: warning 三个"少一个就被拒"的点
1. **`local_subactions` 必须带**（实测值 `1`）。它是每个提交都有的顶层字段；那台私服在开局载荷顶层也回了 `local_subactions: true`，而**官服没有这个键**（见第九节）。两套参考实现的 DTO 里都没有它——照 DTO 解析会把它丢掉。
2. **`XStartOfGame` 的 `action_data` 是 `{"playerID": <id>}`**：键名是 camelCase 的 `playerID`，不是 `player_id`；且必须有值。
3. **`"56"` / `"75"` 这一对数字键**：我方（`left`）用 `"56"`、机器人（`right`）用 `"75"`，值都是字符串 `"20"`。同一个动作两边**用不同的键**——按 `action_type` 硬编码一个键名就会在对手回合失效。推测是"该方本地玩家的某个字段 id"，但**未证实**，照抄实测值最稳。
:::

`match_data` 只在 `XActionEndOfTurn` 上出现（它是客户端主动上报的整局状态快照，字段清单见[附录 H](/private-server/appendix/client-capture)第六节）。

### 已实测到的下行动作样本

抓包里那条解码出来是：

```json
{ "action_id": 3, "action_type": "ActionEndMatch", "player_id": <opponent_id>,
  "action_data": { "reason": "surrender", "winner_side": "left" },
  "sub_actions": [], "turn_number": 1 }
```

即"**对手在回合 1 投降**"，与响应里 `status: "finished"` 吻合。

::: warning 动作类型命名：`Action*` 与 `XAction*` **确实并存**（现已证实）
| 前缀 | 实测动作 | 来源 |
|---|---|---|
| **`X*`** | `XStartOfGame` / `XActionStartOfTurn` / `XActionEndOfTurn` | 真实客户端提交（抓包） |
| **`Action*`** | `ActionEndMatch` | 官服下发 + 私服下发 |

规律很清晰：**玩家自己的玩法动作带 `X` 前缀，对局级事件（结束对局）不带**。`X` 对应的应该就是"客户端本地发起的动作"——与 `local_subactions`（本地子动作）这个字段名呼应。两套参考实现用的 `XAction*` 名字是**对的**。
:::

::: tip 包的 3 字节头部不是 `action_id`
第 4 章讲过 codec 包头部有 3 个字节。实测确认：**动作序号不在那里**，它在明文里的 `action_id`。

| 材料 | 头部字段实测值 |
|---|---|
| 私服抓包（双向 12 个包） | 恒等于**对局 id**（6 位数，两个方向都一致） |
| 官服抓包（同局两次下发） | 恒为 `15536472`；该局对局 id 是 9 位数——既不等于它，也不等于它的 mod 2²⁴ 截断值（差 52） |

结论：这是**会话 / 路由 id，由服务端自选、客户端原样回显**，只需在同一局内保持一致。参考实现把它当 "session action id" 用，方向是对的；**但绝不要拿它当动作序号**。
:::

## 八、强逻辑（必须守住的不变量）

这几条不是风格问题，破了任何一条都会表现为"能进游戏但很快出怪事"：

1. **容器与类型是硬的**
   `left_is_online` 必须是 int、`right_is_online` 必须是 bool；`actions` / `notifications` 开局是 `[]`，但**轮询时无动作要整个键省掉**；未匹配的对局返回 JSON `null`（不是字符串）。
2. **`location_number` 必须自洽**
   发牌时手牌 `0..N-1`、牌库接 `N..38`；**换牌后必须重编号**，替补牌继承被弃牌的槽位。不要把它当主键，也不要让它重号。
3. **换牌必须回传整副牌**
   洗牌权在服务端，客户端只认服务端给的新牌序。
4. **`action_id` 单调递增，`min_action_id` 闭区间**
   客户端靠它做增量拉取；跳号或回退会让客户端漏动作或重复应用。
5. **状态机顺序**
   `player_status_*`：`not_done` →（换牌）`mulligan_done` →（结束）与 `status: finished` 配套；**人机的右侧开局就必须是 `mulligan_done`**。
6. **`GET /matches/v2/{id}` 兼作载入信号**
   它是裸字符串，不是 JSON；双方都载入后服务端才应转 `running`。
7. **错误分层**
   路由/参数层给 `{error:{code,description},message,status_code}`；游戏层给纯文本（如 `ACTION_ERROR`）。别混用——排查时这是最快的定位手段。
8. **轮询路径零 IO**
   几百毫秒一次的高频接口，只读内存。

## 九、玩法动作的提交：格式已解开，但官服还有一道门槛

我写过一个"机器客户端"（PowerShell 实现 codec 编解码 + 完整时序）去官服实打一局，卡在提交动作。后来拿到真实客户端的抓包，格式对上了；但**按真实客户端的格式重新提交，官服依然拒**——所以这一节分两半：**格式（已解开）**与**官服那道额外的门槛（未解开）**。

### 格式：真实客户端就是这么发的（已验证）

```jsonc
// 开局（128 B）
{ "action_type": "XStartOfGame", "player_id": <我方 id>,
  "action_data": { "playerID": <我方 id> },
  "action_id": 1, "local_subactions": 1 }

// 开始回合（142 B）
{ "action_type": "XActionStartOfTurn", "player_id": <我方 id>,
  "action_data": { "side": "left", "56": "20" },
  "action_id": 2, "local_subactions": 1 }

// 结束回合（14 360 B，大头是 match_data）
{ "action_type": "XActionEndOfTurn", "player_id": <我方 id>,
  "match_data": { "cards": "[{…82 张牌…}]", "kredits_left": …, "match_type": "training", … },
  "action_data": { "side": "left", "reason": "endTurnButton", "56": "20" },
  "action_id": 3, "local_subactions": 1 }
```

必备字段：`action_type` / `player_id` / `action_data` / `action_id` / **`local_subactions`**，结束回合另加 `match_data`；`b64Cipher` 要**保留 base64 填充**（[第 4 章](/private-server/04-codec)）。

**自建服务端照这个收就对了**——实测那台私服（`fyserver`）原样收下并正确推进了对局，两套参考实现里没有的 `local_subactions` 也照样能用。

### 官服那道门槛：试过的都排除了

按上面的格式重新打官服，结果**仍然 `400 ACTION_ERROR`**。逐项排除如下：

| 假设 | 实测 | 结论 |
|---|---|---|
| 外层信封 `{a: 包}` 不对 | 路由存在、服务端解到内层才报游戏层错误 | ❌ 排除 |
| 动作类型名不对 | `XStartOfGame` / `XActionStartOfGame` / `StartOfGame` / `XStartGame` / `XActionStartOfTurn` / `XActionEndOfTurn` 全试 | ❌ 不足以解释 |
| `action_data` 形态不对 | 对象 / `FActionValue2` 数组 / 带 `side` / 带 `playerID` 都试 | ❌ 排除 |
| 缺 `local_subactions` | 补上照样 400 | ❌ 排除（**注意：这不是官服被拒的原因**，只是私服路径上必需的字段） |
| Base64 填充被裁 | 保留 `=` 重试照样 400 | ❌ 排除 |
| 头部 3 字节会话 id 取值 | `0` / 对局 id 截断 / 我方 id 截断 全试 | ❌ 排除 |
| 没有活动的 WebSocket 会话 | 用 .NET WebSocket 真连上 `wss://ws.live.1939api.com/ws` 并完成 ping/pong（含带 `match_id` 的心跳），再提交照样 400 | ❌ 排除 |
| 请求头不像客户端 | 换成客户端同款 `X-Api-Key`（`…:KLink 29452.29452`）、`User-Agent`、`Accept` 照样 400 | ❌ 排除 |

**还剩什么？** 一条实测线索：**官服的开局载荷顶层只有 `match_and_starting_data`，而那台私服的顶层多了 `local_subactions: true`**。这很像**能力协商**——服务端声明自己支持 `local_subactions`，客户端才在动作里带它。

如果是这样，那么客户端跟官服说话时用的是**另一套（不带 `local_subactions` 的）动作格式**，而我手上只有"客户端 → 私服"的样本，所以拼不出官服那一套。**这条推断没有验证**，但它是目前最合理的解释，也指出了唯一的取证路径：**抓一份真实客户端打官服的动作提交**（需要代理 + 证书拦截 `kards.live.1939api.com`，本系列最早那份官服抓包就是这么来的），把 `POST /matches/v2/{id}/actions` 的请求体解出来即见分晓。

::: tip 对私服作者的实际意义
这一整节的未解之谜**不影响自建私服**：

- 你的服务端只需要**接受**真实客户端发来的格式（上面那份模板），实测已被 `fyserver` 验证可行；
- "官服还认什么"只关系到"官方协议考古"，不关系到能不能开局。

所以实现时按模板收、字段校验放宽即可，不必纠结官服那道门槛。
:::

### 失败矩阵（存档）

| 变体 | 结果 |
|---|---|
| `XStartOfGame`（带/不带 `turn_number`、`sub_actions`） | 400 ACTION_ERROR |
| `XStartOfGame` 且 `action_data` 用 `FActionValue2` 数组形态 | 400 |
| `XActionStartOfGame` / `StartOfGame` / `XStartGame` / `ActionStartOfGame` | 400 |
| `XActionStartOfTurn`（带 `{side:"left"}`） | 400 |
| `XActionEndOfTurn`（带 `{reason:"endTurnButton", side:"left"}`） | 400 |
| `PUT /matches/v2/{id}` + `{"action":"start-of-game","value":{}}` | 400 |
| 包内 `action_id` 取 0 / 1 / 2，头部 aid 同步 | 400 |

**当时就能确定的两件事**（现在回看依然正确）：路由存在（不是 404/405）、外层 `{a: packet}` 正确（服务端解到了内层）。

### 还差的两块

1. **官服的动作提交格式**（见上，需要"客户端 → 官服"的抓包）；
2. **出牌/攻击类动作**的 `action_data` 键名——手上这份对局里玩家只做了"结束回合"和"投降"，所以只覆盖了 3 种玩法动作。更长的对局（无论对官服还是对私服）都能补上。

## 十、与参考实现对照

| 项 | 官服实测 | `kardsservergo` | `fyserver` |
|---|---|---|---|
| 机器人 id | **负数**（`-2020`/`-2030`） | `900000001`（正数） | `-9178`（负数 ✓） |
| 机器人名字 | `"Fischer"` | `"Training Bot"` | — |
| 换牌方法 | **`POST`** | `PUT`（❌ 会 405） | `POST` ✓ |
| 换牌结果键 | `{ai_error, deck, replacement_cards}` | `{deck, replacement_cards}` | `{deck, replacement_cards}` |
| 未换牌时的 `/mulligan/{loc}` | **`{}`** | `{deck:[], replacement_cards:[]}` | 字符串 `"null"` |
| `player_stars_*` | `0` | `20` | — |
| `right_player_tag` | `null` | `0` | — |
| 开局 `status` | `"running"` | `"pending"` → 载入后 `running` | — |
| `opponent_polling` | 未轮询时**省略** | 恒发（含 `false`） | — |
| 顶层键 | 只有 `match_and_starting_data` | 额外有 3 个键 | 一致 |
| `GET /matches/v2/{id}` | 裸文本 `running` | 裸文本（✓） | 裸文本 `running`（✓） |
| 动作类型 | 实测 `ActionEndMatch` | `XAction*` | `XAction*` |

**结论**：字段名与结构基本照抄成功（`match` 23 项、`starting_data` 22 项**逐一相同**），差的是**方法、取值风格与省略规则**。这类偏差不会让游戏进不去，但会在特定分支（换牌、人机、终局）上暴露。

## 十一、自写最小人机实现

三个端点就能跑通人机：进局、开局载荷、轮询（并按需广播 AI 动作）。

::: code-group

```csharp [C#]
// 换牌：必须重新洗牌并回传整副牌；未换牌时 GET 返回 {}
app.MapPost("/matches/v2/{id}/mulligan", (int id, MulliganCards req, MatchStore store) =>
{
    var m = store.Get(id);
    var (deck, replacements) = m.ApplyMulligan(req.DiscardedCardIds); // 内部：换牌 + 洗牌 + 重编号
    return Results.Created($"/matches/v2/{id}/mulligan", new
    {
        ai_error = false,
        deck,                        // ← 整副牌，必须回
        replacement_cards = replacements
    });
});
app.MapGet("/matches/v2/{id}/mulligan/{location}", (int id, string location, MatchStore store) =>
    store.Get(id).MulliganOf(location) is { } r ? Results.Ok(r) : Results.Ok(new { })); // 空对象，不是 "null"

// 轮询：无新动作时不发 actions / opponent_polling 键
app.MapPut("/matches/v2/{id}/actions", (int id, PollReq req, MatchStore store) =>
{
    var m = store.Get(id);
    var payload = new Dictionary<string, object?>
    {
        ["match"] = new { player_status_left = m.StatusLeft, player_status_right = m.StatusRight, status = m.Status }
    };
    var fresh = m.Actions.Where(a => a.ActionId >= req.min_action_id).Select(a => a.Packet).ToList(); // 闭区间
    if (fresh.Count > 0) payload["actions"] = fresh;
    if (m.OpponentPolling(req.opponent_id)) payload["opponent_polling"] = true;
    return Results.Ok(payload);
});
```

```go [Go]
// 换牌：POST（不是 PUT）
func HandleMulligan(c *gin.Context) {
    var req struct {
        DiscardedCardIDs []int `json:"discarded_card_ids"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
        return
    }
    match, _, side, ok := currentUserMatch(c)
    if !ok {
        return
    }
    deck, replacements := match.ApplyMulligan(side, req.DiscardedCardIDs) // 换牌 + 洗牌 + 重编号
    c.JSON(http.StatusCreated, gin.H{
        "ai_error":          match.BotEnabled,
        "deck":              deck, // ← 整副牌，必须回
        "replacement_cards": replacements,
    })
}

// 未换牌时返回空对象
func GetMulliganLeft(c *gin.Context) {
    match, _, _, ok := currentUserMatch(c)
    if !ok {
        return
    }
    if match.PlayerStatusLeft != "mulligan_done" {
        c.JSON(http.StatusOK, gin.H{}) // ← {} 而不是 "null"
        return
    }
    c.JSON(http.StatusOK, gin.H{"deck": match.LeftDeckCards, "replacement_cards": match.LeftReplacementCards})
}
```

:::

AI 这边最省事的做法：**等玩家结束回合后，延迟若干秒把"开始回合 + 结束回合"两条 codec 包塞进动作队列**，玩家一侧就会看到对手"思考了一下然后过牌"。要做真正的 AI，再在这两条之间插入出牌动作即可。
