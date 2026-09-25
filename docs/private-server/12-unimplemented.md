---
title: 12 · 参考实现没覆盖的端点
---

# 12 · 参考实现没覆盖的端点

把官服实测出的端点清单（22 项来自 `GET /` 的 `endpoints` 表，另加 2 项表外）和两套参考实现**实际注册的路由**一比，会发现**有一打端点是两边都没做的**。

这一章把它们列全，并回答一个关键问题：没有服务端参考，能不能补？

::: tip 结论先说：所谓"没有协议参考"并不成立
**参考就在客户端里。** UHT 转储的 `kards/Public` 下，每个异步操作都有一个同名头文件，里面就是该请求/响应的结构体——`CampaignReset.h`、`CampaignUpgradeCard.h`、`DraftMakePickResponse.h`、`TourneyGetTourney.h`……**操作名即文件名**。缺的只是"能跑的服务端样本"，而形态可以直接从客户端产物读出来。
:::

## 一、覆盖矩阵（官服实测 vs 两套实现）

### 两边都没做的（本章重点）

| 端点 | 官服实测 | 客户端结构体 |
|---|---|---|
| `GET /campaign/{id}` | `[]`（空列表，元素见 `FCampaign`） | ✅ `Campaign.h` |
| `GET /campaign/{id}/{reset,upgrade,strategy,victory,abort_victory}` | **405**（写操作，非 GET） | ✅ 每个都有独立 DTO |
| `GET /draft/`（抽卡赛元数据） | `{cost, rewards}` | ✅ `DraftInfo.h` |
| `GET /draft/{id}`（我的抽卡赛） | `{cards, losses, status, wins}` | ✅ `DraftStatus.h` |
| `GET /tourney/`（锦标赛） | `{all_knockout_tourneys: […]}` | ✅ `Tourney.h` |
| `GET /players/{id}/achievements` | `[]` | ✅ `Achievement.h` |
| `GET /players/{id}/dailymissions` | `{missions: […10 字段…]}` | ✅ `DailyMissionsStruct.h` |
| `GET /players/{id}/decks` | **裸数组**（元素 11 字段） | ✅ `DeckHeader` 一类 |
| `GET /lobbyplayers` | `[]` | ✅ |
| `GET /matches`（v1） | `null` | — |
| `POST /players`（玩家搜索） | GET 是 405 | ✅ |
| `POST /email/set`（改邮箱） | POST 专用 | ✅ |
| `GET /store/txn`（交易流水） | `{campaigns, cards, decks, diamonds, draft_admissions, equipment, gold, packs, resources}` | ✅ |

### 只有一边做了的

| 端点 | 官服实测 | `kardsservergo` | `fyserver` |
|---|---|---|---|
| `GET /players/{id}/packs` | `[]` | ✅ | ❌ 未见注册 |
| `GET /entitlements/{id}` | 200 `[{entitlementType, name}]` | ❌ | ✅ |
| `GET /fp/`（首页内容） | 200 富结构 | ⚠️ 桩 `{"custom":"your_value"}` | ✅ |
| `GET /store/` | 200 **空体** | ❌ | ✅ |
| `GET /store/v2/`（view_offers） | 200 大结构 | ❌ | ✅ |
| `POST /store/txn` · `/store/v2/txn` | POST 专用 | ❌ | ✅（空实现） |
| `PUT /crate/claim` | POST/PUT 专用 | ❌ | ✅ |
| `GET /players/{id}/librarynew` | **官服 404** | ❌ | ✅（兼容旧客户端） |
| `PUT/DELETE /players/notifications/{id}` | — | ❌ | ✅ |
| `DELETE /lobbyplayers` | — | ⚠️ 未见注册 | ✅ |

::: details 为什么两套实现都"只写不读"卡组
`GET /players/{id}/decks` 两边都没做，但游戏照样能进——因为**会话响应已经把卡组列表内联了**（[附录 G](/private-server/appendix/endpoint-matrix) 证明了 `session.decks.headers[]` 与端点元素**字段逐一相同**）。客户端从 `/session` 拿卡组，端点只用于增删改。

这是"没实现也能跑"的典型：**先看客户端到底读哪里**，能省掉一半接口。
:::

## 二、客户端结构体索引（按操作名找）

需要在没有服务端样本的情况下补一个端点时，按这张表去 UHT 转储里找（路径：`<游戏>\Binaries\Win64\ue4ss\UHTHeaderDump\kards\Public\`）：

| 功能 | 头文件 |
|---|---|
| 战役（域对象） | `Campaign.h`（13 字段）、`CampaignCardUpgrades.h`、`CampaignScenarioStars.h`、`CampaignCardStats.h`、`EnumCampaignStrategy.h` |
| 战役（各操作 DTO） | `CampaignGetCampaign.h`、`CampaignReset.h`、`CampaignUpgradeCard.h`、`CampaignSetStrategy.h`、`CampaignScenarioVictory.h`、`CampaignAbortVictory.h` |
| 抽卡赛 | `DraftInfo.h`、`DraftStatus.h`、`DraftCard.h`、`DraftCards.h`、`DraftCardStatus.h`、`DraftRewardInfo.h`、`DraftMakePickResponse.h`、`DraftAsyncGetInfo.h`、`DraftAsyncMakePick.h`、`MatchDraftStatus.h` |
| 锦标赛 | `Tourney.h`、`TourneyGetTourney.h`、`TourneyRound.h`、`TourneyRoundMatchup.h`、`TourneySession.h`、`TourneyPlayer.h`、`TourneyLeaderboardEntry.h` |
| 成就 | `Achievement.h`、`AchievementLevel.h`、`Achievements.h` |
| 每日/全局任务 | `DMission.h`、`DailyMissions.h`、`DailyMissionsStruct.h`、`GlobalMissionStruct.h`、`GlobalMissionProgress.h`、`EDailyMissionTriggersEnum.h` |
| 物品与装备 | `PlayerItems.h`、`PlayerItem.h`、`PlayerEquippedItem.h`（已在[第 11 章](/private-server/11-items-library)与官服实测对上） |
| 卡牌库 | `LibraryCard.h`、`LibraryCards.h` |

**规律**：客户端每个异步请求都有一个 `XxxAsyncYyy.h` 或 `XxxYyyResponse.h`——**那对文件就是该端点的请求体与响应体**。

## 三、逐项实现要点

### 战役 `campaign`（6 个端点，写操作为主）

`GET /campaign/{id}` 实测返回 `[]`——**空列表**，元素是 `FCampaign`。所以它是"该玩家已开启的战役列表"，不是单对象。

`FCampaign` 的 13 个字段（客户端产物）：

```text
campaign_name, scenario, strategy, card_upgrades[], last_card_upgraded,
pending_upgrades[], high_score, scenario_stars[], strategies_done[],
first_strategy, purchased, rewards_given[]
```

六个子端点对应 `CampaignReset` / `CampaignUpgradeCard` / `CampaignSetStrategy` / `CampaignScenarioVictory` / `CampaignAbortVictory` / `CampaignGetCampaign` 各自的结构体。**它们全部是写操作，会改进度，因此本系列未实测**——补的时候请在自己的私服上验证，别拿官服账号试。

### 每日任务 `dailymissions`

官服返回 `{ "missions": [ … ] }`，每行有 10 个字段：

```text
canceled, completed_date, counter, create_date, details, id, mission_id, modify_date, player_id, slot
```

注意与客户端域结构 `FDMission` 的差别——后者只有 5 个字段：

```cpp
struct FDMission { int32 ID; FString mission_id; int32 counter; int32 Slot; bool IsDirty; };
```

服务端下发的字段**多于**客户端结构体（多了时间戳、`player_id`、`canceled`、`details`），这与卡牌库、物品的情况一致：**服务端结构通常是客户端结构的超集**。线上的具体容器以 `DailyMissionsStruct.h` 为准（此项未逐一核对）。

### 成就 `achievements`

官服实测 `[]`。客户端有 `Achievement.h`（元素）与 `Achievements.h`（包装 `{Achievements: []}`）。

::: warning 容器形态别从包装结构体推断
`FAchievements` 是**对象**包装，但官服端点返回的是**裸数组** `[]`；`FLibraryCards` 是包装，而 library 端点返回的也是**对象** `{cards, new_cards}`。**同一种"包装结构体"在不同端点上的容器并不一致**——只能实测（下一节给出实测归类）。
:::

### 抽卡赛 `draft` / `my_draft`

| 端点 | 官服实测 |
|---|---|
| `GET /draft/` | `{ "cost": …, "rewards": … }`（抽卡赛元数据） |
| `GET /draft/{id}` | `{ "cards": [{ "card_count": …, "total_cards": … }], "losses": …, "status": …, "wins": … }` |

其余操作用 `DraftAsyncEnterDraft` / `DraftAsyncMakePick` / `DraftAsyncRetireFromDraft` / `DraftAsyncGetPick` / `DraftAsyncGetDeck` 这几组结构体。

### 锦标赛 `tourneys`

`GET /tourney/` 返回 `{ "all_knockout_tourneys": [ … ] }`，元素 5 个字段：`end_date, id, name, rules_json_str, start_date`——与 `/session` 内联的 `all_knockout_tourneys[]` **同构**（[附录 G](/private-server/appendix/endpoint-matrix)）。`rules_json_str` 又是"字符串化 JSON"的老套路，用时再解一次。

### 其余几条

| 端点 | 要点 |
|---|---|
| `GET /lobbyplayers` | `[]`。两套实现只做了 `POST`（进队列）与 `DELETE`（出队列）——**"大厅玩家列表"没人做**，属于纯展示功能 |
| `GET /matches`（v1） | `null`。主线是 `matches2`，v1 只在老客户端里出现 |
| `POST /players` | `GET /players` 是 405，说明集合端点是**写/搜索**语义（按名字找玩家），不是列表 |
| `POST /email/set` | 改邮箱，涉及验证流程，未实测 |
| `GET /store/txn`（transactions） | 返回一组**计数器聚合**（`gold` / `diamonds` / `packs` / `campaigns` / `decks` / `equipment` …），与 `/session` 的顶层货币字段是两套表达 |

## 四、容器形态：必须实测的三类

这是"不同端点不同格式"最容易翻车的地方，实测归类如下：

| 容器 | 端点 |
|---|---|
| **裸数组** | `decks`、`campaign/{id}`、`achievements`、`packs`、`lobbyplayers` |
| **对象** | `library` → `{cards, new_cards}`；`dailymissions` → `{missions}`；`my_items` → `{date, items, equipped_items}`；`tourneys` → `{all_knockout_tourneys}`；`draft/{id}` → `{cards, losses, status, wins}` |
| **`null`** | `matches`、`matches/v2/`（未匹配时） |

::: warning 空响应不要给 `{}`
未匹配/无数据时，官服用 `[]` 或 `null`。返回 `{}` 是"排队永远转圈"类问题的经典成因（[附录 D](/private-server/appendix/smoke-test) 的断言就守这一条）。
:::

## 五、没有样本时，怎么补一个端点

这是本章真正想留下的方法，五步：

1. **先问官服** —— 本系列[附录 F](/private-server/appendix/live-probe)/[附录 G](/private-server/appendix/endpoint-matrix) 就是这么做的；只要有一个能登录的账号，形态是可测的。
2. **找客户端结构体** —— 按"操作名即文件名"在 `UHTHeaderDump/kards/Public` 里检索（第二节的表）。
3. **看客户端怎么消费** —— 蓝图反编译里搜该结构体字段名，能确认"缺这个键会不会崩"。
4. **先发最小数据** —— 空集合（`[]` 或对应空对象）先让界面不崩，再逐字段填，每填一个看一眼界面。
5. **标注证据强度** —— 实测 / 客户端结构体 / 推断，三者分清（本系列每条结论都标了）。

## 六、自己写：未实现端点的最小示例

这些端点没有服务端样本，但形态是已知的——下面是**本系列自己写的**最小实现，重点全在"**容器别给错**"（第二节的实测归类）。

::: code-group

```csharp [C#]
// 裸数组的三兄弟：战役、成就、卡牌包
app.MapGet("/campaign/{id}",             (string id) => Results.Ok(Array.Empty<object>()));
app.MapGet("/players/{id}/achievements", (string id) => Results.Ok(Array.Empty<object>()));
app.MapGet("/players/{id}/packs",        (string id) => Results.Ok(Array.Empty<object>()));

// 卡组列表：裸数组，元素与 session.decks.headers[] 同构（会话已内联，端点是给写操作用的）
app.MapGet("/players/{id}/decks", (string id, DeckStore decks) => Results.Ok(decks.Headers(id)));

// 对象包装的两个：每日任务、锦标赛
app.MapGet("/players/{id}/dailymissions", (string id) =>
    Results.Ok(new { missions = Array.Empty<object>() }));
app.MapGet("/tourney/", () =>
    Results.Ok(new { all_knockout_tourneys = Array.Empty<object>() }));

// 交易流水：一组计数器聚合（注意与 /session 的顶层货币字段是两套表达）
app.MapGet("/store/txn", (string id, Wallet w) => Results.Ok(new
{
    gold = w.Gold(id), diamonds = w.Diamonds(id), packs = w.Packs(id),
    campaigns = 0, cards = 0, decks = 0, draft_admissions = 0, equipment = 0, resources = 0
}));

// 权益清单：扁平数组，外观界面用它判断"我有没有这个表情/卡背"
app.MapGet("/entitlements/{id}", (string id, ItemStore items) =>
    Results.Ok(items.Owned(id).Select(i => new { entitlementType = i.Kind, name = i.ItemId })));
```

```go [Go]
// 空集合优先：客户端是按容器类型解析的，容器错了才出事，字段少没事
func GetCampaign(c *gin.Context)     { c.JSON(http.StatusOK, []any{}) } // 裸数组
func GetAchievements(c *gin.Context) { c.JSON(http.StatusOK, []any{}) } // 裸数组
func GetPacks(c *gin.Context)        { c.JSON(http.StatusOK, []any{}) } // 裸数组

// 卡组列表：与 session 内联的 decks.headers 同构
func GetDecksEndpoint(c *gin.Context) { c.JSON(http.StatusOK, deckHeaders(c)) }

// 对象包装
func GetDailyMissions(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"missions": []any{}})
}
func GetTourneys(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{"all_knockout_tourneys": []any{}})
}

// 交易流水：计数器聚合
func GetTransactions(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
        "gold": 0, "diamonds": 0, "packs": 0, "campaigns": 0,
        "cards": 0, "decks": 0, "draft_admissions": 0, "equipment": 0, "resources": 0,
    })
}
```

:::

::: tip 写操作的实现顺序
`campaign.reset` / `upgrade` / `strategy` / `victory` / `abort_victory` 都是写操作：**先让你的 GET 能返回一条结构合法的 `FCampaign`**，再实现写操作去改它——顺序反了会出现"写成功但界面不显示"，很难查。
:::

## 七、边界

- **写操作一律未实测**：`campaign.*`、`crate/claim`、`store/*/txn`、`email/set`——它们会改账号数据或产生真实交易。要验证请在自己私服上做。
- 本章所有"官服实测"值来自只读 GET，采集方式与隐私处理见[附录 F](/private-server/appendix/live-probe)。
- `DailyMissionsStruct.h` 与成就端点的**数据容器**是本章唯一没核到底的两处，已在文中标出——按第 5 节的方法补测即可。
