---
title: 附录 A · UHT 结构体与枚举注解
---

# 附录 A · UHT 结构体与枚举注解

本页把散落在各章的"客户端到底要什么字段"集中到一处。所有片段来自游戏包内的 UE4SS 头文件转储：

```
H:\sbk\KARDS\default\game\kards\Binaries\Win64\ue4ss\UHTHeaderDump\
├── kards\Public\          ← 协议层：会话、端点、对局、卡牌
└── KardsCore\Public\      ← 基础枚举：阵营、稀有度、卡集
```

::: tip 为什么这些头文件是权威
UHT 转储是**客户端自己的结构体定义**，客户端的 JSON 反序列化目标就是这些类型。实践中有两条推论：

1. **字段名大小写不敏感**：头文件里是 `Status` / `Location` / `Cards`（大写），线上 JSON 是 `status` / `location` / `cards`，都能过——说明客户端用的是宽容的字段匹配。所以**不要自创语义，但不必纠结大小写**。
2. **服务端只需提供子集**：结构体字段远多于实现下发的字段，缺失走类型默认值。`FCardData` 是最典型的例子（47 个字段，实际只需 5 个）。
:::

## 1. 引导与会话

### `FKardsEndpoints2` —— `GET /` 的 `endpoints`

```cpp
// kards\Public\KardsEndpoints2.h
USTRUCT(BlueprintType)
struct FKardsEndpoints2 {
    FString auth;            // 鉴权入口（私服可与 session 同一地址）
    FString leaderboards;    // 排行榜
    FString lobbyplayers;    // 匹配队列        ← 进队列用
    FString my_player;       // 「我的」玩家信息
    FString players;         // 玩家列表/详情
    FString matches;         // 旧版对局接口
    FString store;           // 商店
    FString transactions;    // 交易
    FString draft;           // 竞技场
    FString my_draft;        // 我的竞技场
    FString tourneys;        // 锦标赛
};
```

**对私服的含义**：客户端不硬编码业务路径，而是把这个 JSON 反序列化成上面的结构体再调用。所以：

- 服务端必须**给出全部键**（缺失会留空字符串，客户端去请求空 URL → 一堆莫名失败）；
- 想接管单个功能（比如自建商店），只要把对应字段指向自己的地址，**不必改客户端**。

### `FSessionEndpoints` —— 会话级端点

```cpp
// kards\Public\SessionEndpoints.h
USTRUCT(BlueprintType)
struct FSessionEndpoints {
    FString clients;         FString draft;    FString Email;      // ← 大写 E
    FString lobbyplayers;    FString matches;  FString matches2;   // ← 新版对局走 matches2
    FString my_draft;        FString my_items; FString my_player;
    FString players;         FString Root;     // ← 大写 R
    FString session;         FString store;    FString transactions;
    FString users;           FString tourneys;
};
```

实现里下发的是小写 `email` / `root`，同样能解析——再次印证大小写不敏感。

### `UServerConfig` —— 为什么 `server_options` 是字符串

```cpp
// kards\Public\ServerConfig.h
UCLASS(Blueprintable)
class UServerConfig : public UObject {
    FString JsonString;                                   // ← 一整坨 JSON 存在字符串里
    UFUNCTION(BlueprintCallable) void GetStringFromS3(const FString& Key, bool& KeyExists, FString& Value);
    UFUNCTION(BlueprintCallable) void GetIntFromS3(const FString& Key, bool& KeyExists, int32& Value);
    UFUNCTION(BlueprintCallable) void GetBoolFromS3(const FString& Key, bool& KeyExists, bool& Value);
    UFUNCTION(BlueprintCallable) void FetchConfig();
};
```

这就是为什么在头文件里 grep `websocketurl` 一无所获：**它不是结构体字段，而是 `JsonString` 里的 JSON 键**。客户端解析后放进 `ConfigSubsystem`，业务代码按**键名**读取——完整键清单见[附录 B](/private-server/appendix/decompile-notes)。

### `FJwtPayload` —— `current_user` 的真身

```cpp
// kards\Public\JwtPayload.h
USTRUCT(BlueprintType)
struct FJwtPayload {
    int32   exp;          // ← 全是 int32，不是字符串
    int32   iat;
    int32   identity_id;
    FString iss;
    FString jti;
    int32   player_id;
    FString player_name;
    TArray<FString> roles;
    FString tenant;
    FString tier;
    int32   user_id;
    FString user_name;
};
```

::: warning 这张表解释了 `current_user` 的所有怪癖

| 现象 | 原因 |
|---|---|
| `exp` 填的是用户 ID 而非时间戳 | 它是 `int32`；Go 实现直接把 ID 塞进去，客户端不做 JWT 语义校验 |
| `player_id` / `user_id` / `identity_id` **同时存在** | 结构体要求三个都在，只填一个其余为 0 |
| `iss` = `"cometkards"` | 就是 `iss` 字段的字面值 |
| `tenant` / `tier` 看起来多余 | 与 `GET /` 的 `tenant_name` / `tier_name` 同义 |
:::

## 2. 客户端会话对象 `AKardsSession`

`KardsSession.h` 是客户端的主会话 Actor（622 行）。挑出对写服务端有直接影响的字段：

```cpp
// kards\Public\KardsSession.h（节选 + 注解）
class KARDS_API AKardsSession : public AActor {
    FString            product_name;
    FSessionEndpoints  backend_endpoints;      // ← 就是上面的 FSessionEndpoints
    FString            jti;                    // ← POST /session 的 jti
    FString            JWT;                    // ← POST /session 的 jwt，之后放 Authorization
    int32              client_id;              // ← client_id
    int32              player_id;              // ← player_id
    FString            root_url;               // ← endpoints.root！见下面的坑
    FString            changelist;             // ← 版本信息
    FString            IsBeta;
    bool               Unstable;
    FDeckHeaders       kards_player_decks;     // ← decks.headers
    TArray<FLibraryCard> deck_cards;           // ← /players/{id}/library 的 cards
    FTimespan          server_time_diff;       // ← 由 server_time 推算的时钟差
    FDateTime          server_time_on_logon;
    FJwtPayload        jwt_payload;            // ← current_user
    float              kards_poll_interval;    // ← 轮询间隔
    int32              maxSecondsBetweenHeartbeats;  // ← 心跳超时
    FMatch2            match;                  // ← 对局数据，见下
    TArray<FCardsBlacklist> cards_blacklist;
    TMap<FName, FDateTime>  locked_cards;

    // 登录：credential_type 就是请求体里的 provider
    void Connect(ECredentialTypeEnum credential_type, const FString& Username,
                 const FString& Password, const bool bRememberMe, const bool bAllowAccountCreation);
    void CheckMaintenanceMode();               // ← 读关服公告
    void EquipItem(EFactionEnum faction, const FString& Slot, const FString& ItemName);  // ← 装备按阵营分槽
    void ClaimNationalReward(EFactionEnum faction, int32 LevelToClaim);                  // ← 国家级奖励
};
```

::: warning `root_url` 决定客户端认为你是 dev 还是 live
客户端从一个**很不显眼的地方**推导服务器身份：把 `root_url`（即 `endpoints.root`）按 `.` 拆开取第二段。

| `endpoints.root` | 拆出的第二段 | 判定 |
|---|---|---|
| `https://kards.live.1939api.com/` | `live` | 官方服 |
| `https://kards.dev.1939api.com/` | `dev` | dev 服（放行更新的客户端） |
| `http://192.168.1.16:5231` | `168` | 都不是 |
| `http://127.0.0.1:5231` | `0` | 都不是 |

它只影响一件事：**版本闸门**（dev 会放行比服务端列表更新的客户端）。详见[附录 B](/private-server/appendix/decompile-notes)。
:::

## 3. 对局

### `FMatch2` —— 开局数据 / 轮询响应里的 `match`

```cpp
// kards\Public\Match2.h
USTRUCT(BlueprintType)
struct FMatch2 {
    int32   current_action_id;     // ← 动作序号基准
    int32   action_player_id;      // ← 轮到谁
    FString action_side;           // ← "left" / "right"
    FString match_url;
    FString match_type;
    int32   current_turn;
    int32   match_id;
    FString Status;                // ← 大写 S（线上键 status）
    FString start_side;
    FString actions_url;           // ← 动作轮询地址（每局可由服务端指定）
    int32   player_id_left,  player_id_right;
    int32   deck_id_left,    deck_id_right;
    bool    left_is_online,  right_is_online;
    FString player_status_left, player_status_right;   // not_done / mulligan_done / end_match
    TArray<FCardData> Cards;       // ← 大写 C
    int32   winner_id;
    FString winner_side;
    TArray<FAction2> actions;      // ← 结构体数组，不是字符串数组
    TArray<FPlayerNotification> notifications;
    FString modify_date;
};
```

::: tip `actions` 是 `FAction2` 数组，线上却是 codec 字符串
这正是 codec 存在的理由：客户端在反序列化时**先解 codec 再填结构体**（自研 HTTP 层，会话里叫 `OnDriftResponse`）。所以服务端发 `"actions": ["<codec>", …]` 是对的，但**不能**自己造未编码的 JSON 对象塞进去。
:::

### `FCardData` —— 手牌 / 牌库里的每张牌

结构体有 47 个字段，参考实现只发 5 个：

```cpp
struct FCardData {
    FName   Name;             // ← 卡牌资产名，服务端必填（线上键 name）
    FString title;            // ┐
    FString Text;             // │
    FName   Type;             // │
    int32   kredits;          // │
    int32   attack, defense, range;   // │ 这些全部由客户端
    FName   faction;          // │ 按 Name 从自己的卡牌
    FName   Image;            // │ 数据库补齐，
    FName   rarity;           // │ 服务端不必下发
    int32   operationCost;    // │
    bool    is_gold;          // ← 但位置 / 身份类字段必须发
    int32   card_id;          // ← 本局唯一 ID
    int32   player_id;        // ←
    FName   side;             // ←
    FName   Location;         // ← "hand_left" 等
    int32   location_number;  // ← 同一区域内的序号
    int32   movement_left, attack_left, enter_play_on_turn;
    bool    has_ever_attacked, hasBlitz, hasAmbush, hasSmokescreen, hasFury, hasGuard;
    int32   heavyArmor, pinnedTurns, maxAttack, maxDefense, gotchaActivated;
    FName   customName1, customName2;
};
```

**结论**：开局数据里每张牌只需要

```jsonc
{ "name": "card_unit_1st_infantry", "card_id": 7, "is_gold": false, "location": "hand_left", "location_number": 0 }
```

剩下 42 个字段由客户端按 `name` 自己查。**反过来说：`name` 写错 = 卡牌空白或崩溃**，这是全套协议里最要命的一个字符串。

### `FAction2` / `FActionValue2` / `FSubAction` —— 动作

```cpp
struct FAction2 {
    int32   action_id;                    // 服务端分配的序号
    FString action_type;                  // XActionStartOfTurn / XActionCheat …
    int32   player_id;
    TArray<FActionValue2> action_data;    // ← 数组
    TArray<FSubAction> sub_actions;
};

struct FActionValue2 { FString Name; int32 Value; FString Text; };
struct FSubAction    { FString Name; TArray<FActionValue2> Values; };
```

::: warning `action_data`：结构体是数组，实现却发对象
按 UHT，`action_data` 应是 `[{Name,Value,Text}, …]`；但实现发的是**键值对象**：

```jsonc
// Go / fyserver（C#）都用命名键
"action_data": { "side": "left", "75": "20" }
```

说明客户端那层自定义 JSON 转换做了宽容处理。**照抄抓包到的形状，别按结构体自行设计**——这是最容易做出"客户端不认"的动作的地方。
:::

## 4. 卡组与卡库

```cpp
struct FDeckHeaders { TArray<FDeckHeader> headers; };   // ← decks.headers

struct FLibraryCard {
    int32   deck_id;                  // ⚠️ 实现里下发的是 "id"，不是 "deck_id"
    FString card_type;
    int32   count;
    int32   gold_card_count;
    int32   wanted_card_count;        // ⚠️ 实现里没发
    int32   recently_crafted_count;
};
```

::: warning 库字段名存在实测差异，以抓包为准
实现用的键是 `id`（`fyserver` 的 `LibraryItem(..., int Id, ...)`），UHT 里叫 `deck_id`。两者都能进游戏，说明这层同样是宽容匹配；但**如果你想用某个字段驱动逻辑，请自己抓包确认键名**，不要只看头文件。
:::

## 5. 枚举对照表（最有用的一节）

### `EFactionEnum` —— 阵营，**同时就是卡组码的国家位**

```cpp
// KardsCore\Public\EFactionEnum.h
enum class EFactionEnum : uint8 {
    NotAvailable,   //  0
    Germany,        //  1  ┐
    Britain,        //  2  │
    Japan,          //  3  ├─ 卡组码 %%<主国><盟国>… 用的就是这几个数字
    Soviet,         //  4  │
    USA,            //  5  ┘
    France,         //  6
    Italy,          //  7
    Poland,         //  8
    Finland,        //  9
    Anzac,          // 10
    Allies,         // 11
    Neutral,        // 12
};
```

**这是全系列最有价值的一张表**：卡组码里的 `1`–`9` 不是另一套编号，就是这个枚举。所以"卡组码国家位"与"阵营 ID"永远是同一件事——[第 6 章](/private-server/06-decks)的 `Countries` 字典可以直接由它生成。

### `ECardLocationEnum` —— `location` 字符串的来源

```cpp
// kards\Public\ECardLocationEnum.h
enum class ECardLocationEnum : uint8 {
    NotAvailable,       // 0
    Deck_Left,          // 1  → "deck_left"
    Deck_Right,         // 2  → "deck_right"
    Hand_Left,          // 3  → "hand_left"
    Hand_Right,         // 4  → "hand_right"
    Board_HQLeft,       // 5  → "board_hqleft"
    Board_HQRight,      // 6  → "board_hqright"
    Board_Frontline,    // 7  → "board_frontline"   ← 开局不发，整局都会用到
    Discard,            // 8  → "discard"
    Deck,               // 9  → "deck"
};
```

`location` 的取值就是这里**枚举名的小写形式**。开局只要前 6 个（双方各 `deck_*` / `hand_*` / `board_hq*`）。

### 其它

| 枚举 | 值 | 用途 |
|---|---|---|
| `ESideEnum` | `NotAvailable=0, left=1, right=2` | `start_side` / `winner_side` / `action_side` |
| `EPVPMatchType` | `Battle=1, Draft=2, Challenge=3, Tournament=4, MiniSitNGo=5` | `match_type`（`"battle"`/`"draft"` 有对应项） |
| `EAIMatchType` | `Training=1, Tutorial=2, Battle=3, Draft=4, Campaign=5, Unlocking=6` | 人机对局类型（`"training"`） |
| `ECredentialTypeEnum` | `CT_Device, CT_UserPass, CT_GameCenter, CT_Steam, CT_Kards, CT_MSSDK` | 请求体 `provider`（`"device"` ↔ `CT_Device`） |
| `EItemSource` | `StarterItem, PurchasableItem, RewardedItem, SpecialItem` | 物件来源；也解释装备槽为何按阵营分 |
| `ERarityEnum` | `Common, Uncommon, Rare, Unique, Legendary` | 稀有度（`card_wildcard_elite` 走 Legendary） |
| `ECardSetEnum` | `Basic … Homefront, OceaniaStorm` | 卡集；末尾 `CurrentExpansion = CovertOps` |

::: tip `ECardSetEnum` 解释了 `server_options` 里那堆日期
`server_options` 的 `brothers_in_arms_date` / `covert_ops_date` / `naval_warfare_date` / `homefront_date` / `oceania_storm_date` 与这个枚举的卡集名**一一对应**——就是各资料片的开放时间。私服把它们设成过去时间，等于"所有资料片已解锁"。
:::

---

完整配置键清单与蓝图读取逻辑见[附录 B](/private-server/appendix/decompile-notes)；客户端从硬编码地址走到各业务接口的全过程见[附录 C](/private-server/appendix/client-flow)。
