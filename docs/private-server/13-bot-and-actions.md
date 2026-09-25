---
title: 13 · 人机对局与对局内协议
---

# 13 · 人机对局与对局内协议

这一章的材料来自三处：**官服实测**（含一轮"自己写客户端去打完整局"的尝试）、**一份真实对局的轮询抓包**（读者提供）、以及**客户端 UHT 结构体**。它补上了本系列此前唯一"只能靠反编译猜"的区域——**对局内动作在网络上到底长什么样**。

::: tip 三条一句话结论
1. `actions` 数组里装的**不是 JSON 对象，而是 codec 编码串**（第 4 章那套），每条解码后是一个 action。
2. **`location_number` 是"牌序位"**——发牌时手牌 `0..N-1`、牌库紧接 `N..38`；换牌后服务端会给牌库**重新编号**。
3. 玩法动作的**提交**没能纯 HTTP 复现（官服一律回 `400 ACTION_ERROR`）——第九节把试过的东西全列出来了，这本身也是个有用的结论。
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

响应里的 `actions` 是从旧到新排列的**增量切片**，客户端按序解码应用。至于**服务端到底保留多少条历史**（窗口上限、是否截断），需要一局有大量动作的真实对局才能测出来——本次因为动作提交未打通（第九节），**没测出窗口大小**，如实标出。

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

### 两条通道

| 通道 | 端点 | 明文外层 | 用途 |
|---|---|---|---|
| 玩法动作 | `POST /matches/v2/{id}/actions` | 一个 `FAction2`（`action_type` / `action_data`…） | 出牌、攻击、结束回合 |
| 会话动作 | `PUT /matches/v2/{id}` | `{"action": "end-match", "value": {…}}` | 结束对局等对局级操作 |

两者都装在 **`{ "a": "<codec 包>" }`** 里。

### 已实测到的动作样本（唯一一条）

抓包里那条解码出来是：

```json
{ "action_id": 3, "action_type": "ActionEndMatch", "player_id": <opponent_id>,
  "action_data": { "reason": "surrender", "winner_side": "left" },
  "sub_actions": [], "turn_number": 1 }
```

即"**对手在回合 1 投降**"，与响应里 `status: "finished"` 吻合。

::: warning 动作类型命名：`Action*` 还是 `XAction*`，目前只有一半证据
实测到的官方动作是 **`ActionEndMatch`**（无 `X` 前缀）；而两套参考实现用的全是 `XActionStartOfTurn` / `XActionEndOfTurn` / `XStartOfGame` 这类 `XAction*` 名字。

两者**大概率并存**（`Action*` 走对局级事件、`XAction*` 走玩法动作），但本系列**只在官服上验到了 `ActionEndMatch` 这一条**，玩法动作的名字尚未证实（第九节）。补实现时请以客户端反编译里的字符串常量为准，别照抄参考实现。
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

## 九、没打通的环节：玩法动作的提交

我写了一个"机器客户端"（用 PowerShell 实现 codec 编解码 + 完整时序）去官服实打一局，结果卡在**提交动作**这一步。**记录如下，因为它本身就是结论。**

试过的全部变体，**一律 `400` + 裸文本 `ACTION_ERROR`**：

| 变体 | 结果 |
|---|---|
| `XStartOfGame`（带/不带 `turn_number`、`sub_actions`） | 400 ACTION_ERROR |
| `XStartOfGame` 且 `action_data` 用 `FActionValue2` 数组形态 | 400 |
| `XActionStartOfGame` / `StartOfGame` / `XStartGame` / `ActionStartOfGame` | 400 |
| `XActionStartOfTurn`（带 `{side:"left"}`） | 400 |
| `XActionEndOfTurn`（带 `{reason:"endTurnButton", side:"left"}`） | 400 |
| `PUT /matches/v2/{id}` + `{"action":"start-of-game","value":{}}` | 400 |
| 包内 `action_id` 取 0 / 1 / 2，头部 aid 同步 | 400 |

**能确定的**：`POST /matches/v2/{id}/actions` 这条路由**存在**（不是 404/405），`{a: packet}` 这个外层**是对的**（服务端解析到了内层并给出游戏层错误）。问题在**包内的动作内容**。

**两个尚未验证的假设**：

1. **动作类型名或必需字段不对**——官服要求特定名字/参数，而这个名字不在我手上的客户端产物里（UHT 头文件没有字符串常量，反编译的 34 个蓝图也不含网络层）；
2. **可能要求存在活动的 WebSocket 会话**——官服实时通道是 `wss://ws.live.1939api.com/ws`，若服务端只接受"在线"会话提交的动作，纯 HTTP 就会被拒。这一点**无法从本次实验区分**。

**要打通，缺的是一份真实客户端提交动作的抓包**：用代理在真客户端里打一局人机，把 `POST /matches/v2/{id}/actions` 的**请求体**留下来即可——外层 `{a:...}` 里那段 codec 串，用第 4 章的方法解出来，动作类型名与全部必需字段就齐了。

在拿到它之前，本节的所有"玩法动作"结论都应视为**未验证**。

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
