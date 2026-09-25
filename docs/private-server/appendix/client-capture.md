---
title: 附录 H · 真实客户端抓包实录
---

# 附录 H · 真实客户端抓包实录

本附录来自一份**真实客户端打到自建私服**的完整抓包（Reqable 导出，28 条记录；客户端是 Android 构建，登录里写作 `KLink 29452.29452`）。

它和[附录 F（官服实测）](/private-server/appendix/live-probe)是互补的两半：

| | 材料 | 回答的问题 |
|---|---|---|
| 附录 F | 直接调官服 API | **服务端返回什么**（权威） |
| 附录 H | 真客户端 + 自建私服 | **客户端发什么、期望什么**（权威） |

::: warning 读这份附录必须先分清"谁说的"
**客户端的请求**是权威协议参考——客户端没必要说假话，它发什么就是协议长什么样。

**响应**来自那台私服（机器人 id `-9178`，即 `fyserver`），**不代表官服**。下面凡涉及响应的地方都标了来源，别把私服的行为当成官方行为抄。
:::

## 一、这份抓包覆盖了什么（以及没覆盖什么）

抓包从客户端启动开始，到一局人机对局结束（玩家在第 2 回合投降）为止。**没有覆盖**的部分如实说明：

- **没有 `POST /singleplayerlobby`** ——这局对战在抓包开始前就已存在（客户端用 `GET /matches/v2/reconnect` 找回来的），所以人机入口仍以[第 13 章](/private-server/13-bot-and-actions)的官服实测为准；
- 对局很短（玩家第 1 回合结束回合 → 第 2 回合投降），因此只出现了 **3 种动作类型**，不是完整动作表；
- 没有匹配（`/lobbyplayers`）、没有抽卡赛/战役。

## 二、客户端真实调用顺序（28 条）

| # | 请求 | 状态 | 说明 |
|---|---|---|---|
| 1 | `GET /` | 200 | 引导包：`{current_user, endpoints}` |
| 2 | `POST /session` | 200 | 登录（见第三节） |
| 3 | `PUT /players/{id}/heartbeat` ×2 | 200 | 心跳 |
| 4 | `GET /players/{id}/library` | 200 | 卡牌库，**274 KB** |
| 5 | `POST /players/{id}/decks` | 200 | 建卡组（见第四节） |
| 6 | `PUT /players/{id}/decks/{deck_id}` | 200 | `{"action":"fill", …}` |
| 7 | `GET /store/txn/dlc` | **404** | ← 私服没实现 |
| 8 | `GET /players/{id}/packs` | **404** | ← 私服没实现 |
| 9 | `GET /players/{id}/dailymissions` | **404** | ← 私服没实现 |
| 10 | `GET /players/{id}/achievements` | **404** | ← 私服没实现 |
| 11 | `PUT /players/{<codec 编码串>}` | **404** | `log-player-event`（见第七节） |
| 12 | `PUT /players/{<codec 编码串>}` | **404** | `accept-eula` |
| 13 | `GET //` | **101** | WebSocket 升级（注意双斜杠） |
| 14 | `GET /matches/v2/reconnect` | 200 | 裸文本 `"null"` |
| 15 | `GET /matches/v2/` | 200 | 开局载荷 |
| 16 | `GET /matches/v2/{id}` | 200 | 关卡载入信号 |
| 17 | `GET /matches/v2/{id}/mulligan/right` | 200 | 拉对手换牌结果 |
| 18 | `POST /matches/v2/{id}/mulligan` | 200 | 换牌（带 82 张牌面，见第五节） |
| 19-22 | `POST /matches/v2/{id}/actions` ×4 | 200 | **动作提交**（见第六节 / 第 13 章） |
| 23-25 | `PUT /matches/v2/{id}/actions` ×3 | 200 | 轮询 |
| 26 | `PUT /matches/v2/{id}` | 200 | 会话动作 `end-match`（投降） |
| 27 | `GET /matches/v2/{id}/post` | 200 | 赛后面板 |
| 28 | `GET /players/{id}/library`（第二次） | 200 | 结算后刷新 |

## 三、`/session` 的真实请求体（21 键）

```jsonc
{ "provider": "device_id",
  "provider_details": { "payment_provider": "XSOLLA" },
  "client_type": "UE5",
  "build": "KLink 29452.29452",          // ← 与 APK 的 "Kards 1.46.24674.APK" 同族不同平台前缀
  "platform_type": "Android",
  "app_guid": "Kards",
  "version": "KLink 29452.29452",
  "platform_info": "{…}",                // ← 307 字节的 JSON 字符串（设备档案）
  "platform_version": "Android 16",
  "account_linking": "",
  "language": "zh-Hans",
  "automatic_account_creation": true,
  "username": "<脱敏>",
  "password": "<脱敏>" }
```

与[附录 F](/private-server/appendix/live-probe)里那份（我自己按 APK 的 Key 拼的）结构一致，差异只在 `platform_type` / `build` / `version` 的平台前缀——**服务端不该校验这几个字段的具体值**，参考实现里也没有校验。

## 四、建卡组与"自动填满"

```jsonc
POST /players/{id}/decks
{ "name": "英国卡组", "main_faction": "Britain", "ally_faction": "USA", "deck_code": "" }
```

```jsonc
PUT /players/{id}/decks/{deck_id}
{ "action": "fill",
  "deck_code": "%%25|05080f0r0Z171D1f1H1l1L1v1WbnbOcGd3d6d8dDdEeLhRiIlgoA…" }
```

::: warning `faction` 的大小写：客户端发大写，官服回小写
客户端在**请求**里写的是 `"Britain"` / `"USA"`（首字母大写）；而官服在 `/session` 的 `decks.headers[]` 里回的是小写（`japan` / `germany`，见附录 F）。

**服务端必须大小写不敏感地解析 faction**。同理，`fill` 的 `deck_code` 用的是 `%%<主><盟>|<payload>` 语法（第 6 章），`%%25|` 解出来正是主 Britain(`2`)、盟 USA(`5`)。
:::

`fill` 是"一键填满卡组"操作——`PUT /players/{id}/decks/{deck_id}` 带 `action` 字段时走的是**改卡组内容**的分支，而不是"改名"。

## 五、换牌请求带着**整局牌面**

```jsonc
POST /matches/v2/{id}/mulligan
{ "discarded_card_ids": [],          // 本局没换牌
  "cards": [ /* 82 张 */ ] }         // ← 客户端把整局牌面报上来
```

**82 张的构成**（实测分布）：

| `location` | 张数 |
|---|---|
| `Deck_Left` / `Deck_Right` | 35 / 34 |
| `Hand_Left` / `Hand_Right` | 4 / 5 |
| `Board_HQLeft` / `Board_HQRight` | 1 / 1 |
| `NotAvailable` | 2 |

**每张牌的字段并集（17 个）**：

```text
card_id  name  side  originalSide  location  location_number
kredits  kreditsBuff  operationCost  heavyArmor
hasAlpine  hasAmbush  hasBlitz  hasFury  hasGuard  hasMobilize  hasSmokescreen
```

::: warning 客户端用 `Hand_Left`，服务端用 `hand_left`
同一份数据，**客户端上传时是 PascalCase + 下划线后缀**（`Hand_Left`、`Deck_Right`、`Board_HQLeft`），**服务端下发时是全小写**（`hand_left`、`deck_right`、`board_hqleft`，见[第 13 章](/private-server/13-bot-and-actions)第二节）。

服务端解析这两处**必须大小写不敏感**，否则 82 张牌会全部落空——这类 bug 表现为"换牌没生效/牌库对不上"，很难查。

另外 `NotAvailable` 是"本局用不到、未入手"的牌，它的 `side` 也可能取 `NotAvailable`（本局 2 张）。
:::

私服的响应（来源：`fyserver`）是 `{deck, replacement_cards}`，与官服一致（官服多一个 `ai_error`）。

## 六、结束回合的 `match_data`：把整局状态全量上报

`XActionEndOfTurn` 的明文有 **14 360 字节**，其中 `match_data.cards` 是一个 **12 271 字符的 JSON 字符串**（是**字符串**，不是数组——服务端要二次解析）。

`match_data` 的 10 个键：

| 键 | 实测内容 |
|---|---|
| `cards` | 整局 82 张牌的 JSON **字符串**（字段同第五节） |
| `kredits_left` / `kredits_right` | 当前资源 |
| `max_kredits_left` / `max_kredits_right` | 资源上限 |
| `fatigue_damage_left` / `fatigue_damage_right` | 疲劳伤害 |
| `gameplay_restrictions` | 规则限制 |
| `match_type` | 对局类型（`training`） |
| `strategy` | 打法/策略标记 |

::: tip 自研服务端最省事的做法：直接信 `match_data`
客户端在**每次结束回合**时都会把"整局 82 张牌 + 双方资源 + 疲劳"报上来。与其自己推演牌局，不如把这份数据当**权威状态快照**收下、按它广播。

而两套参考实现的 DTO 里**都没有这个字段**（`fyserver` 的换牌 DTO 只有 `DiscardedCardIds`），等于白扔了客户端主动送来的状态。
:::

## 七、两条会话动作通道：`{action, value}`

除了[第 13 章](/private-server/13-bot-and-actions)讲的玩法动作通道，客户端还会用**两条会话动作通道**，payload 都是 codec 包，明文形如 `{action, value}`：

**① 对局级：`PUT /matches/v2/{id}`**

```jsonc
{ "side": "", "action": "end-match",
  "value": { "winner_id": -9178, "winner_side": "right", "result": "surrender" } }
```

投降走这里（不是玩法动作通道）。服务端随后通过轮询广播 `ActionEndMatch`。

**② 玩家级：`PUT /players/{<codec 编码的玩家标识>}`** ← **本系列此前没有记录的端点**

```jsonc
// 路径段本身就是一个 codec 包，解码后是 "device:Android-…"（客户端的 external_id）
{ "action": "log-player-event",
  "value": "event.player.stats.fps;{\"fps\": 30, \"fullscreenMode\": \"Fullscreen\", \"resolution\": \"2776x1264\", \"scalabilityLevel\": 2}" }

{ "action": "accept-eula", "value": "accepted" }
```

两个都被私服 **404**。要点：

- 玩家标识**编码在 URL 路径里**，不在 body 里；
- 已知的 `action` 值：`log-player-event`（遥测，value 是 `事件名;JSON`）、`accept-eula`（同意协议）；
- 404 不影响进局（客户端照常继续），但"界面完整性"上会缺东西。要做忠实实现，至少返回 200。

## 八、私服 404 清单 = 客户端期望清单

客户端**实际会调**、而这台私服没实现的端点。这一栏比第 12 章的推断更硬——它是客户端的真实行为：

| 客户端调用 | 私服响应 | 建议 |
|---|---|---|
| `GET /players/{id}/achievements` | 404 | 至少返回 200 + 空结构 |
| `GET /players/{id}/dailymissions` | 404 | 同上 |
| `GET /players/{id}/packs` | 404 | 同上 |
| `GET /store/txn/dlc` | 404 | **新端点**：DLC 交易查询 |
| `PUT /players/{codec}` | 404 ×2 | 见第七节 |

自写示例见[第 12 章](/private-server/12-unimplemented)第六节。

## 九、WebSocket 心跳帧（实测）

升级请求是 `GET //` → **101**，即地址形如 `ws://<host>:<port>//`（**双斜杠**，第 9 章记过这个坑）。本局共 4 条消息，两问两答，间隔约 **20 秒**：

```jsonc
// client → server（对局中会多一个 match_id）
{ "sender": "", "timestamp": "", "receiver": "",
  "channel": "ping", "message": "ping", "context": "", "match_id": "<match_id>" }

// server → client
{ "timestamp": "1790320130002", "context": "", "message": "pong",
  "channel": "ping", "sender": "<player_id>", "receiver": "", "match_id": null }
```

- `timestamp` 是 **Unix 毫秒的字符串**；
- `channel: "ping"` 就是第 9 章那四个 channel 里的心跳；
- 心跳里带 `match_id`，意思是"我还在这局里"——离线判定（`idel_disconnect_minutes`）就靠它。

## 十、零散响应的真实形态

| 请求 | 响应（来源：私服） |
|---|---|
| `GET /` | `{current_user, endpoints}`；`current_user` 就是 JWT 的 claim（`client_id`/`exp`/`iat`/`iss`/`jti`…），`endpoints` 是端点表（`draft`/`email`/`lobbyplayers`/`matches`…） |
| `GET /matches/v2/{id}/post` | `{"faction":"Britain","winner":false}` ← 赛后面板，`faction` **首字母大写** |
| `GET /matches/v2/reconnect` | 裸文本 `"null"`（**带引号**） |
| `GET /matches/v2/` | 顶层 `local_subactions: true` + `match_and_starting_data` |
| `GET /players/{id}/library` | `{cards, new_cards}`，每行 `{card_type, count, gold_card_count, id, recently_crafted_count}` |

::: tip 两处对既有记录的补充
1. **`library` 每行还有一个数字 `id`**（如 `1021`）——[第 11 章](/private-server/11-items-library)记录的行键是 `{card_type, count, gold_card_count, recently_crafted_count}`，这份抓包说明 `id` 也可能下发（客户端不依赖它）；
2. **`local_subactions` 出现在两处**：客户端每个动作提交里都有（第 13 章），这台私服在开局载荷顶层也回了一个 `local_subactions: true`。官服的开局载荷**是否也带**这一点尚未复核——如果你的客户端不认这个字段，别急着加。
:::

## 十一、给私服作者的落点清单

1. **大小写不敏感**是硬要求：`location`（`Hand_Left` vs `hand_left`）、`side`、`faction`（`Britain` vs `britain`）三处，客户端与官服用了不同风格；
2. **`local_subactions`** 是客户端动作提交的必备字段（第 13 章）；
3. **会话动作两条通道**：`PUT /matches/v2/{id}`（对局级）与 `PUT /players/{codec}`（玩家级）——后者可 404，但最好 200；
4. **四个 404 端点**（`achievements` / `dailymissions` / `packs` / `store/txn/dlc`）是客户端真的会调的，见第 12 章的自写示例；
5. **别丢 `match_data`**：客户端白送的权威状态快照；
6. **WebSocket 必须回 pong**：客户端 20 秒一次心跳，不回会被判离线。

## 十二、与其它材料的分工

| 材料 | 用途 |
|---|---|
| [第 13 章](/private-server/13-bot-and-actions) | 对局内协议（动作提交/动作流/换牌/`location_number`）的**规则** |
| **本附录** | 真实客户端**逐条请求的实测形态**与"客户端期望清单" |
| [附录 F](/private-server/appendix/live-probe) | 官服**响应**的权威形态 |
| [附录 G](/private-server/appendix/endpoint-matrix) | 端点矩阵与数据复用 |

三份材料合起来，才能既知道"服务端该返回什么"，也知道"客户端会发什么、会来要什么"。
