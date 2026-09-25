---
title: 附录 G · 端点矩阵与数据复用
---

# 附录 G · 端点矩阵与数据复用

[附录 F](/private-server/appendix/live-probe) 回答了"某个端点长什么样"。这一页回答另一类问题：**官服到底有几个端点、各自用什么方法、哪些数据结构被反复复用**。

方法同上：登录后用 JWT 把官服**自己下发的 `endpoints` 清单**逐个打一遍（而不是猜路径），再对各结构做字段集交叉比对。

## 1. `endpoints` 是**随登录态增长**的

同一个 `GET /`，带不带 JWT 拿到的端点表**不一样**：

| | 无 JWT | 带 JWT |
|---|---|---|
| 端点个数 | 15 | **22** |
| `my_player` / `my_items` / `my_draft` | `null` | 填上了（`/players/<id>`、`/items/<id>`、`/draft/<id>`） |
| `campaign.*` 六件套 | **不存在** | `campaign`、`campaign.reset`、`campaign.upgrade`、`campaign.strategy`、`campaign.victory`、`campaign.abort_victory` |

两点值得注意：

- **键名里带点号**：`campaign.abort_victory` 这样的 key 直接出现在 JSON 里（客户端大概按前缀切分后映射到枚举）。自建服务若要复刻，照抄这种命名即可。
- **`campaign` 族只在登录后出现**：未登录时连 key 都没有，不是值为 `null`。写服务端时"按登录态裁剪端点表"是官方行为，不是可选项。

## 2. `current_user` 就是 JWT 的解码结果

带 JWT 时 `GET /` 返回的 `current_user` 有 15 个字段，与令牌 claim **逐一对应、完全一致**：

```text
client_id, exp, external_id, iat, identity_id, iss, jti,
language, payment, player_id, provider, roles, tier, user_id, user_name
```

这解释了两件事：为什么服务端**只需要一个 token** 就能渲染出用户信息；以及为什么"`exp` 填用户 ID"这种怪做法能过——客户端读的是解码后的字段，不是去校验它。

## 3. 端点矩阵（实测）

| 端点 | 方法 | 状态 | 返回形态 | 备注 |
|---|---|---|---|---|
| `/` | GET | 200 | `{build_info, current_user, endpoints, host_info, server_time, service_name, tenant_name, tier_name}` | 端点表随登录态变化 |
| `/session` | POST | 200 | 约 70 个扁平字段 | 见[附录 F](/private-server/appendix/live-probe) |
| `/config` | GET | 200 | `{xserver_closed, xserver_closed_header, forgot_password_url}` | 唯一配置口 |
| `/players/{id}` | GET | **405** | — | `my_player` 是**写**接口，不能 GET |
| `/players` | GET | **405** | — | 集合也不可 GET（搜索应是 POST） |
| `/players/{id}/decks` | GET | 200 | **裸数组** `[5]` | 元素字段见第 4 节 |
| `/players/{id}/library` | GET | 200 | `{cards, new_cards}` | 条目主键 `card_type` |
| `/players/{id}/packs` | GET | 200 | `[]` | 空集合 |
| `/players/{id}/achievements` | GET | 200 | `[]` | 空集合 |
| `/players/{id}/dailymissions` | GET | 200 | `{missions}` | `missions[]`：`canceled, completed_date, counter, create_date, details, id, mission_id, modify_date, player_id, slot` |
| `/items/{id}` | GET | 200 | `{date, equipped_items, items}` | `items[]`：`cnt, details, item_id` |
| `/draft/` | GET | 200 | `{cost, rewards}` | 抽卡赛元数据 |
| `/draft/{id}` | GET | 200 | `{cards, losses, status, wins}` | `cards[]`：`card_count, total_cards` |
| `/matches/v2/`（未匹配） | GET | 200 | **`null`** | 见第 6 节 |
| `/matches`（未匹配） | GET | 200 | **`null`** | 同上 |
| `/lobbyplayers` | GET | 200 | `[]` | 大厅玩家列表 |
| `/tourney/` | GET | 200 | `{all_knockout_tourneys}` | 元素：`end_date, id, name, rules_json_str, start_date` |
| `/store/` | GET | 200 | **空体（0 字节）** | 不是 JSON，就是什么都没有 |
| `/store/v2/` | GET | 200 | `{alwaysFeatured, currency, groups, message, status, ts}` | `groups[]`：`endDate, group, groupId, hidden, offers, startDate`；`offers[]` 25 字段（`offerId, offerName, gold, diamonds, real, discount, entitlementName, slotType, slotValue, …`） |
| `/store/txn` | GET | 200 | `{campaigns, cards, decks, diamonds, draft_admissions, equipment, gold, packs, resources}` | 交易流水聚合 |
| `/campaign/{id}` | GET | 200 | `[]` | 战役进度（本账号为空） |
| `/campaign/{id}/{reset,upgrade,strategy,victory,abort_victory}` | — | **405** | — | 全是写操作，未触发 |

::: tip 405 比 404 有信息量
`405 Method Not Allowed` 说明**路由存在、只是方法不对**；`404` 说明路径根本不存在（如 `/.com/config`）。排障时先分清这两者，能省掉一半猜测。
:::

## 4. 复用证据：字段集**完全相同**的结构对

对每个结构的字段名集合两两求交，以下是完全一致的（即"同一批对象被换了地方再发一次"）：

| A | B | 结论 |
|---|---|---|
| `/session` → `decks.headers[]` | `GET /players/{id}/decks[]` | **11 个字段逐一相同**（`ally_faction, card_back, create_date, deck_code, favorite, id, last_played, main_faction, modify_date, name, player_id`）——会话把卡组列表**内联**了，端点只是同一批对象换个容器 |
| `/session` → `all_knockout_tourneys[]` | `GET /tourney/` 的元素 | 同为 `{end_date, id, name, rules_json_str, start_date}`，会话内联了赛事 |
| `/session` → `new_cards` | `library.new_cards` | 同名同用途（两处都为空，只能确认名称与位置） |
| `view_offers.groups[]` | `view_offers.alwaysFeatured[]` | **同一份 payload 内**复用同一个 group 结构 |
| `/session` → `current_user` | JWT claim 集 | 15 字段完全一致（第 2 节） |

**实践含义**：服务端不必为 `/session` 和各个子端点各写一套序列化——**同一批 DTO 内联到哪里都一样**。反过来说，只要改变其中一个结构的字段，客户端会在它出现的每个位置同时受影响。

## 5. 同名不同形：最容易踩的六个键

用户说的"不同端点不同格式"主要体现在**同一个键名在不同端点里是不同类型**：

| 键 | 形态 A | 形态 B |
|---|---|---|
| `decks` | `/session` → **对象** `{ "headers": [ … ] }` | `GET /players/{id}/decks` → **裸数组** `[ … ]` |
| `server_time` | `/session` → `2026.09.25-06.03.07`（点分） | `/` → `2026-09-25T06:00:00.420343Z`（ISO 6 位小数） |
| `cards` | `library.cards` = **卡牌行数组** | `transactions.cards` = **数量**；`my_draft.cards` = `{card_count, total_cards}` |
| `id` | 卡组 `id` = 卡组数字 ID | 卡牌行里**没有 `id`**，只有 `player_id` |
| `date` | `my_items.date` = 整份物品的时间戳 | `missions[].create_date` / `completed_date` = 单条任务时间 |
| `currency` | `/session.currency` = `"USD"` | `/store/v2/.currency` = `"USD"`（**实测两者都是字符串**，未发现差异） |

::: warning `decks` 的两种形态是最典型的坑
`/session` 里必须包一层 `{"headers": [...]}`，独立端点则必须是裸数组。**同一批对象、两种容器**——这类差异只能靠实测发现，无法从命名推断。
:::

## 6. 空响应的三种语义（实测原文）

"没有数据"在这个 API 里有三种写法，客户端三种都认，但含义不同：

| 原文 | 出现位置 | 含义 |
|---|---|---|
| `[]` | `/players/{id}/packs`、`/achievements`、`/lobbyplayers`、`/campaign/{id}` | **空集合** |
| `null` | `/matches/v2/`、`/matches` | **JSON null 字面量**（未匹配） |
| *（0 字节）* | `/store/` | **空体**，连 JSON 都不是 |

::: danger 纠正：未匹配时官服返回的是 JSON `null`，不是字符串 `"null"`
正文第 7 章与[附录 D](/private-server/appendix/smoke-test) 曾断言"必须返回**字符串** `null`，JSON `null` 会让客户端卡在排队转圈"。**官服实测返回的正是 JSON `null`（4 字节 `null`）**，而客户端在官服上工作正常——所以两种都能过。真正的禁忌只有一个：**别返回 `{}` 或 `[]`**。附录 D 的断言已据此更正。
:::

## 7. 本页未覆盖

保持边界清楚——以下都**没有**实测，因为它们会改动账号数据或需要真实对局：

| 项 | 原因 |
|---|---|
| `campaign.*` 的五个写操作 | 会推进/重置战役进度 |
| `/store/v2/txn`（购买）与 `/email/set` | 会产生真实交易 |
| 对局中的 `action_data`、WS 帧 | 需要进对局并抓包，本页只用只读接口 |
| `heartbeat` 的实际副作用 | 会置在线状态，为保持只读而跳过 |
| `/players` 的 POST（搜索） | 未验证参数形态 |
