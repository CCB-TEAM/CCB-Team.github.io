---
title: 05 · 玩家数据、物品与图书馆
---

# 05 · 玩家数据、物品与图书馆

登录成功后客户端会立刻并发拉几路数据。这些接口大多**只要返回结构正确、内容可以为空**，但有两个必须给真数据：**卡牌库**（否则收藏界面空白、卡组编辑器打不开）和 **`server_options`**（第 3 章已讲）。

## 卡牌库 `/players/{id}/library`

返回全量卡牌清单。客户端据此渲染收藏、判断"你有几张"、以及在卡组编辑器里校验卡组码。

官服实测的响应是一个**裸数组**（没有 `{ "cards": … }` 外壳），每条以 `card_type` 为主键：

```jsonc
// GET /players/{id}/library   → 顶层就是数组
[
  { "card_type": "card_unit_1st_infantry", "count": 40, "gold_card_count": 0,
    "player_id": 1, "recently_crafted_count": 0 }
]
```

| 字段 | 含义 |
|---|---|
| `card_type` | 卡牌资产名（`card_unit_*` / `card_event_*`）——**条目主键** |
| `count` | 普通卡数量（**40 就是"全都有"**，参考实现统一给 40） |
| `gold_card_count` | 金卡数量 |
| `player_id` | 该行归属的玩家 |
| `recently_crafted_count` | 近期合成数（用于 UI 高亮，可全 0） |

::: warning 官服没有数字 `id` 字段
早期版本的本文曾给出带 `"id": 1024` 的示例，那是**误读**：官服响应里只有 `card_type` 资产名，卡牌的数字编码只存在于**客户端内置**的卡组码映射表里（见下）。自建服务发 `{ "cards": [ … ] }` 外壳或多余字段客户端通常也能忍，但**以裸数组 + `card_type` 为准**——实测依据见[附录 F](/private-server/appendix/live-probe)。
:::

::: warning `id` 必须和卡组码表对得上
这是最容易出错的地方：库里 `id` 与客户端内置的卡牌表不一致，卡组编辑器会显示"未知卡牌"，甚至直接崩。**采集方式**：从客户端导出 `deckCodeIDsTable`（`fyserver` 用的是 `library/deckCodeIDsTable2.json`，TS 版直接内联成 `src/library.ts`，Go 版用 `//go:embed` 塞进二进制），它是 `{deck_code_id, card, ID}` 的数组：

```jsonc
[ { "deck_code_id": "1a", "card": "card_unit_1st_infantry", "ID": 1024 }, … ]
```

两个接口名都实现更稳（老版本客户端会请求 `librarynew`）。但要注意：**官服上并不存在 `/librarynew`**（实测 404），它只是参考实现为旧客户端准备的兼容别名：

::: code-group

```csharp [C#]
app.MapGet("/players/{id}/library",    (string id, PlayerLibraryService lib) => Results.Ok(lib.Library));
app.MapGet("/players/{id}/librarynew", (string id, PlayerLibraryService lib) => Results.Ok(lib.Library));
```

```typescript [TypeScript]
@Get('players/:id/library')
library(@Param('id') id: string) {
  return { cards: LIBRARY, new_cards: [] };   // LIBRARY 由 deckCodeIDsTable 生成
}
```

:::
:::

## 物品与装备 `/items/{id}`

`item` 是**桌饰、头像、卡背、表情**这类装饰。返回全量库 + 玩家已装备项：

```jsonc
// GET /items/{id}
{
  "date": "2025-07-06 04:06:03",
  "equipped_items": [ { "faction": "germany", "item_id": "cardback_germany_1", "slot": "cardback" } ],
  "items": [ { "details": "{}", "item_id": "emote_appreciate", "cnt": 0 } ]
}
```

装备时客户端把**整个对象** POST 回来，服务端保存即可：

```jsonc
// POST /items/{id}
{ "faction": "germany", "item_id": "cardback_germany_1", "slot": "cardback" }
// → 200 { "player_id": "1", "equipped_items": [...] }
```

::: tip 去重必须按 `(slot, faction)` 而不是只按 `slot`
每个国家各有独立的卡背/桌面装饰槽。Go 实现的判断是关键细节：

```go
for _, eq := range user.EquippedItems {
    if !(eq.Slot == item.Slot && eq.Faction == item.Faction) {   // slot 和 faction 都相同才删
        newEquipped = append(newEquipped, eq)
    }
}
```

C# 版只按 `slot` 去重（`RemoveAll(i => i.Slot == item.Slot)`）——切换国家时会把别国的装备顺手清掉。**建议按 `(slot, faction)` 实现。**
:::

## 心跳与在线状态

```http
PUT /players/{id}/heartbeat      → {}
DELETE /players/{id}/heartbeat   → {}   # 下线
```

两个方法都注册到同一路由，返回空对象即可：

::: code-group

```csharp [C#]
app.MapMethods("/players/{id}/heartbeat", new[] { "PUT", "DELETE" }, (string id) => Results.Ok(new EmptyResponseDto()));
```

```typescript [TypeScript]
@Put('players/:id/heartbeat')  @Delete('players/:id/heartbeat')
heartbeat() { return {}; }
```

:::

真正的在线状态由 **WebSocket 连接**维护（第 9 章）：连着就是在线，断开就下线并判负。心跳只是保活，不影响业务。

## 其余"占位即可"的接口

这些接口客户端会请求，但**返回结构对就行，内容空着不影响进游戏**：

| 接口 | 返回 |
|---|---|
| `GET /{a}/players/{id}/friends` | `{ "friends": [], "previous_opponents": [] }` |
| `GET /entitlements/{id}` | `[ { "entitlement_type": "emote", "name": "emote_appreciate" } ]` |
| `PUT` `DELETE` `/players/notifications/{id}` | `{}` |
| `GET /players/{id}/packs` | 未开卡包列表（空数组即可） |
| `GET /store/v2/`（旧版 `/store/`） | 商店，见下 |
| `POST /store/v2/txn`（旧版 `/store/txn`） | 空 200 |
| `GET /fp/` | 首页配置，`{}` 即可 |

::: warning 注意 friends 路径里的 `/{a}/` 段
真实路径形如 `/{任意段}/players/{id}/friends`，前缀段是客户端自带的（不同版本不同）。用**通配段**匹配，不要写死：

```csharp
app.MapGet("/{a}/players/{player_id}/friends", (string a, string player_id) =>
    Results.Ok(new FriendsReponse(new List<int>(), new List<int>())));
```
:::

## 商店的最小形态

商店接口的响应形状固定，内容来自你自己的配置：

```jsonc
{
  "currency": "USD",
  "groups":        [ … ],     // 商品分组
  "always_featured": [ … ],   // 常驻推荐位
  "message": "Offers for 2025-07-06T04:06:03.000000Z",
  "status": 200,
  "ts": 1751774763.5          // Unix 秒（带小数）
}
```

旧版本客户端请求的是 `/store/`（没有 `v2`）、下单走 `/store/txn`，**两条都注册上**，成本极低但能省掉一轮"客户端黑屏"排查。

开箱（`PUT /crate/claim`）返回的奖励结构里两处字段是 **camelCase**，与全局的 snake_case 策略不同：

```jsonc
{
  "dust": 1000,
  "items": [
    { "data": { "dust": 1000, "isGold": null, "itemType": "card", "name": "card_wildcard_elite" }, "qty": 5 },
    { "data": { "dust": 1000, "isGold": null, "itemType": "gold", "name": "" }, "qty": 30 }
  ]
}
```

::: details 序列化策略：全局 snake_case + 局部覆盖
`fyserver` 的做法值得照抄：全局用 `JsonNamingPolicy.SnakeCaseLower`，个别字段用特性覆盖：

```csharp
public record ClaimItemData(
    int Dust,
    [property: JsonPropertyName("isGold")]   bool? IsGold,
    [property: JsonPropertyName("itemType")] string ItemType,
    string Name
);
```

TS 侧用装饰器或直接返回对象字面量；Go 侧用 `json:"isGold"` tag。**别为了几个字段把全局策略改掉**，否则 `equipped_items` 会变成 `equippedItems`，客户端直接解析失败。
:::

---

数据接口齐了，下一章做卡组——包括那个自成一体的卡组码格式。
