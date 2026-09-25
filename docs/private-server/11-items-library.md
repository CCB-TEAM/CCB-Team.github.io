---
title: 11 · 物品、装备与卡牌库
---

# 11 · 物品、装备与卡牌库

前几章讲的是"能不能进游戏"。这一章讲两块**界面直接吃数据**的接口——**卡牌库（lib）**和**物品装备（equ）**。它们的特点是：结构拿错不会崩，但会**空列表、白屏、装备不显示**，而且字段名和客户端结构体对不上的地方特别多。

本章把三个来源并排放：**官服实测**（可信度最高）、**客户端 UHT 结构体**（字段类型的权威）、**两套参考实现**（能跑的样本）。凡三者不一致的地方都点出来。

## 一、卡牌库 `/players/{id}/library`

### 官服实测

```jsonc
// GET /players/{id}/library   （带 jwt + API Key 头）
{
  "cards": [
    { "card_type": "card_event_carpet_bombing", "count": 1, "gold_card_count": 0,
      "player_id": <id>, "recently_crafted_count": 0 }
    // …本账号共 110 条，按资产名字母序
  ],
  "new_cards": []
}
```

### 客户端结构体 `FLibraryCard`（UHT）

```cpp
struct FLibraryCard {
    int32   deck_id;                 // ← 官服不下发
    FString card_type;
    int32   count;
    int32   gold_card_count;
    int32   wanted_card_count;       // ← 官服不下发
    int32   recently_crafted_count;
};
```

### 三者对照——这是本章最值得记的一张表

| 字段 | 官服下发 | 客户端结构体 | 谁在用 |
|---|---|---|---|
| `card_type` | ✅ | ✅ `FString` | **条目主键**，客户端按它查内置卡表 |
| `count` | ✅ 真实持有数（1、2…） | ✅ `int32` | 收藏界面数量徽标 |
| `gold_card_count` | ✅ | ✅ `int32` | 金卡数量 |
| `recently_crafted_count` | ✅ | ✅ `int32` | "最近合成"高亮 |
| `player_id` | ✅ | ❌ **结构体里没有** | 多余字段，客户端忽略 |
| `deck_id` | ❌ **不下发** | ✅ `int32` | **卡组码那两个字符对应的数字**，客户端自己填 |
| `wanted_card_count` | ❌ **不下发** | ✅ `int32` | 愿望单/合成意图，客户端自己填 |

::: tip 两个关键结论
**1. 线上主键是 `card_type`，不是数字 id。** 我们早期版本曾以为客户端按数字 `id` 索引卡牌——实际那个数字（`FLibraryCard.deck_id`）**官服根本不下发**，是客户端拿 `card_type` 去查内置的 `deckCodeIDsTable` 得到的。所以自建服务**只要保证 `card_type` 正确**，数字 id 不用管。

**2. 官服多发了一个 `player_id`。** 它在客户端结构体里不存在，属于服务端实现细节外泄到协议里——客户端直接忽略。自建服务发不发都行，**但别把它当成主键**。
:::

### `count` 与 `new_cards`

- 官服给的是**真实持有数**（本账号 1、1、1、…、2，无金卡）；两套参考实现统一给 **40**（"全都有"），这对自建服务是完全可接受的偷懒做法。
- `new_cards` 用于"新获得卡牌"的高亮，官服这里为空数组。**外壳必须保留 `new_cards` 键**（客户端结构体之外另读，见[附录 F](/private-server/appendix/live-probe) 的形态说明）。

> 卡组码那两个字符与 `card_type` 的对应表（`deckCodeIDsTable`）怎么采集，见[第 5 章](/private-server/05-player-data)。

## 二、物品与装备 `/items/{id}`

### 官服实测（原文，共 30 条）

```jsonc
// GET /items/{id}
{
  "date": "2026-09-25 06:11:54",
  "equipped_items": [],
  "items": [
    { "cnt": 0, "details": "{}", "item_id": "emote_hello" },
    { "cnt": 0, "details": "{}", "item_id": "emote_greetings" },
    // …24 个表情 + item_lugerinn + 5 个 cardback_starter_{britain,german,japan,soviet,usa}
    { "cnt": 0, "details": "{}", "item_id": "cardback_starter_usa" }
  ]
}
```

### 客户端结构体（UHT）

```cpp
struct FPlayerItem {
    FString details;
    FString item_id;
    int32   cnt;
};

struct FPlayerEquippedItem {
    FString      item_id;
    FString      Slot;        // ← 注意大写 S
    EFactionEnum faction;     // 阵营，卡背/桌布按国别区分
};

struct FPlayerItems {
    TArray<FPlayerItem>         Items;          // ← 大写 I
    TArray<FPlayerEquippedItem> equipped_items; // ← 小写
};
```

::: warning 同一结构里大小写混用，是官方自己就这么写的
`FPlayerItems` 里第一个字段是 **`Items`**（大写），第二个是 **`equipped_items`**（小写）；`FPlayerEquippedItem.Slot` 又是大写 `S`。客户端对大小写宽容，但**你在 Go 里照抄结构体 tag 时要小心**（`json:"Slot"` 与 `json:"slot"` 是两个不同的键）。
:::

### 四个容易踩的点

| 点 | 说明 |
|---|---|
| **`date` 的格式** | `2026-09-25 06:11:54`——**空格分隔、无小数位**。这是本系列反复提到的"第三种时间格式"的归属地（点分格式是 `/session` 的 `server_time`，ISO 6 位小数是 `last_logon_date` 一类） |
| **`details` 是字符串化的 JSON** | 实测值为 `"{}"`（字符串，不是对象）。和 `server_options` 同一套路：**拿到后要再解一次** |
| **`items` 是全量目录，不只是已拥有** | 本账号 30 条全部 `cnt: 0`——`cnt` 是"持有数量"，0 表示未拥有。客户端据此把未拥有的置灰 |
| **`equipped_items` 本账号为空** | 所以它的形状来自**客户端结构体 + 两套实现**交叉印证，不是官服实测（见下） |

### 装备写入 `POST /items/{id}`

官服这个接口**会改账号数据，因此没有实测**。两套实现的语义如下（都接受一个完整物品对象）：

| | 去重键 | 行为 |
|---|---|---|
| `fyserver`（C#） | `Slot` | 先移除所有同 `Slot` 的装备，再追加新的 |
| `kardsservergo`（Go） | `Slot` + `faction` | 先移除同 `Slot` **且**同 `faction` 的，再追加 |

两者都要求请求体至少带 `item_id`（Go 版还强制 `slot`、`faction` 非空），响应都是 `{player_id, equipped_items}` 形态。

::: details 为什么要按 (Slot, faction) 去重
卡背、桌布这类外观是**按国别各装备一件**的（`faction` 是 `EFactionEnum`）。只按 `Slot` 去重会导致"换日本卡背时把德国卡背一起卸掉"——这正是[第 10 章](/private-server/10-deploy) 排障表里"切换国家时卡背被清"那一条的成因。
:::

### 最小实现（对齐官服形态）

::: code-group

```csharp [C#]
// 目录可硬编码，也可从 JSON 载入；关键是三个字段名与 date 格式
app.MapGet("/items/{id}", (string id) => Results.Ok(new
{
    date = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss"),   // ← 空格分隔，无小数
    equipped_items = Array.Empty<object>(),
    items = Catalog.Select(i => new { i.item_id, cnt = 0, details = "{}" })
}));
```

```go [Go]
type playerItem struct {
    ItemID  string `json:"item_id"`
    Cnt     int    `json:"cnt"`
    Details string `json:"details"`
}

func GetItems(c *gin.Context) {
    items := make([]playerItem, 0, len(catalog))
    for _, id := range catalog {
        items = append(items, playerItem{ItemID: id, Cnt: 0, Details: "{}"})
    }
    c.JSON(http.StatusOK, gin.H{
        "date":           time.Now().UTC().Format("2006-01-02 15:04:05"), // ← 同一格式
        "items":          items,
        "equipped_items": []any{},
    })
}
```

:::

### 两套实现对官服的偏离

| 项 | 官服 | `kardsservergo` | `fyserver` |
|---|---|---|---|
| 外层字段 | `date` + `items` + `equipped_items` | **`player_id`** + `items` + `equipped_items`（**无 `date`**） | `Date` + `EquippedItems` + `Items`（一致） |
| 装备字段大小写 | 结构体为 `Slot` | 响应结构体用 `Slot`，但 POST 绑定用小写 `slot` | `Slot` |

结论：`date` 不是必需字段（Go 版不发也能进游戏），但**发一个格式正确的 `date` 更贴近官服**，而且成本极低。

## 三、顺带发现：两个不在端点表里的接口

打端点表时撞见的，两个参考实现的覆盖情况还不一样：

| 路径 | 官服实测 | `kardsservergo` | `fyserver` |
|---|---|---|---|
| `GET /entitlements/{id}` | **200** → `[{"entitlementType":"emote","name":"emote_well_played"}, …]` | ❌ 未实现 | ✅ 有 |
| `GET /fp/` | **200** → `{"changed":true,"elements":[{"content":{"banner_text":{…}}}]}`（首页内容配置） | ⚠️ 桩：`{"custom":"your_value"}` | ✅ 有 |

`/entitlements/{id}` 返回的是"我拥有哪些外观权益"的扁平清单（`entitlementType` + `name`），与 `/items/{id}` 的全量目录互补。注意：**它并不出现在 `GET /` 的 `endpoints` 表里**——说明端点表不是完整清单，抓包/试路径仍然必要（这正是[附录 G](/private-server/appendix/endpoint-matrix) 之外还要靠 `405`/`404` 区分的原因）。
