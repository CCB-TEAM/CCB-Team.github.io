---
title: 06 · 卡组与卡组码
---

# 06 · 卡组与卡组码

卡组在协议里有两个表示：**卡组头**（元数据 + 一整串卡组码）和**卡组码**（真正描述内容）。理解了卡组码，第 7 章的开局发牌就是纯机械操作。

## 卡组头

```jsonc
// decks.headers[i]，也是 POST /players/{id}/decks 的响应
{
  "name": "FK",
  "main_faction": "Germany",     // ← 注意是 PascalCase 字符串
  "ally_faction": "Finland",
  "card_back": "cardback_starter_germany",
  "deck_code": "%%21|4v32…;;;|0N",
  "favorite": false,
  "id": 428173,
  "player_id": 1,
  "last_played": "2025-07-06T04:06:03.123456Z",
  "create_date": "2025-07-06T04:06:03.123456Z",
  "modify_date": "2025-07-06T04:06:03.123456Z"
}
```

| 字段 | 要点 |
|---|---|
| `main_faction` / `ally_faction` | `Germany` `Britain` `Japan` `Soviet` `USA`；盟友还可用 `France` `Italy` `Poland` `Finland`。**大小写敏感**，和卡组码里的数字是两套表示 |
| `card_back` | 默认 `cardback_starter_{main_faction 小写}` |
| `id` | 服务端生成（参考实现是 6 位随机数），必须唯一且稳定——对局里用它索引卡组 |
| 三个时间 | ISO 8601 带 6 位小数 + `Z` |

## 卡组码解剖

形如：

```
%%21|4v3232…sU;;;~;;;|0N1b
││ │└┬┘└┬┘└┬┘└┬┘    │
││ │ │  │  │  └──────┴─ 第 3 段：HQ（前 2 字符是 HQ 卡的 deck_code_id）
││ │ │  │  └───────── 第 2 段：4 组卡，用 ; 分隔，组的序号即"张数倍数 - 1"
││ │ └──┴────────────   组 0：每张出现 1 次
││ └─────────────────── 主国代码 + 盟国代码（各 1 位）
│└───────────────────── 固定前缀
└────────────────────── 固定前缀
```

**国家代码表**：`1` Germany、`2` Britain、`3` Japan、`4` Soviet、`5` USA、`6` France、`7` Italy、`8` Poland、`9` Finland。

**倍数规则**：卡的 ID 是**两位字符**（不是十六进制，是卡牌表里的 `deck_code_id`），按 2 字符切分。第 `i` 组里的每张卡算 `i+1` 张：

| 组 | 每张算几张 |
|---|---|
| `g0` | 1 |
| `g1` | 2 |
| `g2` | 3 |
| `g3` | 4 |

同一张卡可以出现在多个组里，张数累加，**总数不能超过 4**。

### 完整例子

```
%%21|4v32323232sTgv0z0C0C0C0CoBoBoBoB0Y0Y101010hShShShS1902020202030303ououpRpRpRsU;;;~;;;|0N1b
```

| 段 | 值 | 结论 |
|---|---|---|
| 主国 / 盟国 | `2` `1` | Britain + Germany |
| 组 0 | `4v 32 32 32 32 sT gv 0z 0C 0C 0C 0C …` | 每张 ×1；`32` 出现 4 次 = 4 张 `32` |
| 组 1 / 2 / 3 | 空 | 没有 2/3/4 张的卡 |
| `~` 之后 | `;;;` | **丢掉**：`~` 到段尾是客户端附加信息（例如卡组备注/版本），服务端解析时截断 |
| HQ 段 | `0N1b` | 前 2 字符 `0N` = 英国 HQ |

## 解析器

::: code-group

```csharp [C#]
public static class DeckCode
{
    // 1=Germany 2=Britain 3=Japan 4=Soviet 5=USA 6=France 7=Italy 8=Poland 9=Finland
    public static readonly Dictionary<char, string> Countries = new()
    {
        ['1'] = "Germany", ['2'] = "Britain", ['3'] = "Japan", ['4'] = "Soviet", ['5'] = "USA",
        ['6'] = "France",  ['7'] = "Italy",   ['8'] = "Poland", ['9'] = "Finland",
    };

    public static readonly Dictionary<string, string> DefaultHq = new()
    {
        ["soviet"] = "8v", ["usa"] = "ce", ["britain"] = "0N", ["japan"] = "6l", ["germany"] = "3v",
    };

    public record Parsed(string MainCountry, string AllyCountry, Dictionary<string, int> Cards, string Hq);

    public static Parsed Parse(string code)
    {
        if (!code.StartsWith("%%")) throw new FormatException("missing %% prefix");
        var parts = code[2..].Split('|');
        if (parts.Length is < 2 or > 3) throw new FormatException("bad segment count");

        var countries = parts[0];
        if (countries.Length != 2) throw new FormatException("bad country code");

        // ~ 到段尾全部丢弃
        var cardsPart = parts[1];
        var tilde = cardsPart.IndexOf('~');
        if (tilde >= 0) cardsPart = cardsPart[..tilde];

        var hq = parts.Length == 3 ? parts[2] : "";
        var groups = cardsPart.Split(';');

        // HQ 缺失时从第 0 组开头"借"回来（老卡组码的写法）
        if (hq.Length == 0 && DefaultHq.TryGetValue(Countries[countries[0]].ToLowerInvariant(), out var def)
            && groups[0].StartsWith(def))
        {
            hq = def;
            groups[0] = groups[0][def.Length..];
        }
        if (hq.Length == 0 && DefaultHq.TryGetValue(Countries[countries[0]].ToLowerInvariant(), out var def2))
            hq = def2;

        var cards = new Dictionary<string, int>();
        for (int i = 0; i < groups.Length; i++)
        {
            for (int j = 0; j + 1 < groups[i].Length; j += 2)
            {
                var id = groups[i].Substring(j, 2);
                cards[id] = cards.GetValueOrDefault(id) + (i + 1);   // 组序号 + 1 = 张数
            }
        }

        return new Parsed(Countries[countries[0]], Countries[countries[1]], cards, hq);
    }

    /// <summary>合法性：每张卡总数 ≤ 4。</summary>
    public static bool IsValid(string code)
    {
        try { return Parse(code).Cards.Values.All(v => v <= 4); }
        catch { return false; }
    }
}
```

```typescript [TypeScript]
export const COUNTRIES: Record<string, string> = {
  '1': 'Germany', '2': 'Britain', '3': 'Japan', '4': 'Soviet', '5': 'USA',
  '6': 'France',  '7': 'Italy',   '8': 'Poland', '9': 'Finland',
};
const DEFAULT_HQ: Record<string, string> = {
  soviet: '8v', usa: 'ce', britain: '0N', japan: '6l', germany: '3v',
};

export interface ParsedDeck { mainCountry: string; allyCountry: string; cards: Record<string, number>; hq: string; }

export function parseDeckCode(code: string): ParsedDeck {
  if (!code.startsWith('%%')) throw new Error('missing %% prefix');
  const parts = code.slice(2).split('|');
  if (parts.length < 2 || parts.length > 3) throw new Error('bad segment count');

  const [countries, rawCards, hqPart = ''] = parts;
  if (countries.length !== 2) throw new Error('bad country code');

  // ~ 到段尾全部丢弃
  const cardsPart = rawCards.includes('~') ? rawCards.slice(0, rawCards.indexOf('~')) : rawCards;
  const groups = cardsPart.split(';');

  let hq = hqPart;
  const def = DEFAULT_HQ[COUNTRIES[countries[0]].toLowerCase()];
  if (!hq && def && groups[0].startsWith(def)) {          // 老格式：HQ 藏在第 0 组开头
    hq = def;
    groups[0] = groups[0].slice(def.length);
  }
  if (!hq && def) hq = def;

  const cards: Record<string, number> = {};
  groups.forEach((group, i) => {
    for (let j = 0; j + 1 < group.length; j += 2) {
      const id = group.slice(j, j + 2);
      cards[id] = (cards[id] ?? 0) + (i + 1);             // 组序号 + 1 = 张数
    }
  });

  return { mainCountry: COUNTRIES[countries[0]], allyCountry: COUNTRIES[countries[1]], cards, hq };
}

/** 合法性：每张卡总数 ≤ 4 */
export const isValidDeckCode = (code: string): boolean => {
  try { return Object.values(parseDeckCode(code).cards).every((v) => v <= 4); }
  catch { return false; }
};
```

:::

## 卡组 CRUD

四个操作、三个端点。**注意第二个 URL 带尾斜杠、第三个是新版无 `v2`**——这些差异都是为了避免客户端版本不兼容。

| 操作 | 请求 |
|---|---|
| 新建 | `POST /players/{id}/decks`，body = 卡组头（`name`/`main_faction`/`ally_faction`/`deck_code`）→ 返回完整卡组头 |
| 编辑器保存 | `PUT /players/{player_id}/decks/{deck_id}`，body `{ "action": "fill", "deck_code": "%%…" }` |
| 改名 / 换卡背 / 设常用 | `PUT /players/{player_id}/decks/`，body `{ "id": 428173, "action": "rename", "name": "新名字" }` |
| 删除 | `DELETE /players/{player_id}/decks/{deck_id}` |

三个 `action` 的语义：

| action | 作用的字段 |
|---|---|
| `rename` | `deck.name = body.name` |
| `change_card_back` | `deck.card_back = body.name`（**名字也走 `name` 字段**） |
| `make_favorite` | `deck.favorite = true` |

::: code-group

```csharp [C#]
app.MapPost("/players/{id}/decks", async (string id, CreateDeck dto, UserStoreService users) => {
    var user = await users.GetByIdAsync(int.Parse(id));
    if (user is null) return Results.NotFound();
    var deck = new Deck(dto, user.Id);          // 生成 id、时间戳、默认卡背
    user.Decks[deck.Id] = deck;
    await users.SaveUserAsync(user);
    return Results.Ok(deck.ToHeader());
});

app.MapPut("/players/{player_id}/decks/{deck_id}",
    async (string player_id, int deck_id, DeckAction action, UserStoreService users) => {
    var user = await users.GetByIdAsync(int.Parse(player_id));
    if (user is null) return Results.NotFound();
    if (user.Decks.TryGetValue(deck_id, out var deck) && action.Action == "fill") {
        deck.DeckCode = action.DeckCode;
        deck.ModifyDate = DateTime.Now;
        await users.SaveUserAsync(user);
    }
    return Results.Ok(new EmptyResponseDto());
});

app.MapPut("/players/{player_id}/decks/", async (string player_id, ChangeDeck body, UserStoreService users) => {
    var user = await users.GetByIdAsync(int.Parse(player_id));
    if (user is null) return Results.NotFound();
    if (user.Decks.TryGetValue(body.Id, out var deck)) {
        switch (body.Action) {
            case "rename":           deck.Name = body.Name; break;
            case "change_card_back": deck.CardBack = body.Name; break;
            case "make_favorite":    deck.Favorite = true; break;
        }
        deck.ModifyDate = DateTime.Now;
        await users.SaveUserAsync(user);
    }
    return Results.Ok(new EmptyResponseDto());
});
```

```typescript [TypeScript]
@Post('players/:id/decks')
async create(@Param('id') id: string, @Body() dto: CreateDeckDto) {
  const user = await loadUser(+id);
  const deck = new Deck(dto, user.id);
  user.decks[deck.id] = deck;
  await saveUser(user);
  return deck;                                   // 直接返回卡组头
}

@Put('players/:player_id/decks/:deck_id')
async fill(@Param('player_id') pid: string, @Param('deck_id') did: string, @Body() body: { action: string; deck_code: string }) {
  const user = await loadUser(+pid);
  const deck = user.decks[+did];
  if (deck && body.action === 'fill') { deck.deck_code = body.deck_code; deck.modify_date = new Date(); await saveUser(user); }
  return {};
}

@Put('players/:player_id/decks')                 // 注意：带尾斜杠的写法在 Express 里等价
async modify(@Param('player_id') pid: string, @Body() body: { id: number; action: string; name: string }) {
  const user = await loadUser(+pid);
  const deck = user.decks[body.id];
  if (deck) {
    if (body.action === 'rename')           deck.name = body.name;
    if (body.action === 'change_card_back') deck.card_back = body.name;
    if (body.action === 'make_favorite')    deck.favorite = true;
    deck.modify_date = new Date();
    await saveUser(user);
  }
  return {};
}

@Delete('players/:player_id/decks/:deck_id')
async remove(@Param('player_id') pid: string, @Param('deck_id') did: string) {
  const user = await loadUser(+pid);
  delete user.decks[+did];
  await saveUser(user);
  return {};
}
```

:::

::: tip 服务端要不要校验卡组码
参考实现的 `fill` 分支**直接落库**，不做合法性校验。建议至少做两件事：

1. `parseDeckCode` 能解析成功、每张卡 ≤ 4；
2. 每张卡的 `deck_code_id` 都在你的卡表里（避免对战阶段才炸）。

但**不要**因为校验失败就 500——客户端会卡在编辑器。返回 `{}` + 日志，让玩家自己发现问题。
:::

---

卡组有了，下一章：排队、开局、把卡组码变成真正的牌堆。
