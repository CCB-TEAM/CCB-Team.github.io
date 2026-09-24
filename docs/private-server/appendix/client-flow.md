---
title: 附录 C · 客户端如何解析端点与配置
---

# 附录 C · 客户端如何解析端点与配置

前面各章都在讲"服务端要返回什么"。这一页反过来讲**客户端拿到这些数据后是怎么用的**——理解这条链路，排障时就能判断"问题出在服务端字段、地址下发，还是配置读取"。

## 全流程时序

```
① 启动：exe 里硬编码基址
   https://kards.live.1939api.com/           ← 可被 IPRedirection 等长替换
        │
        ▼
② GET /                                      ← 会话建立（"Drift" 层）
   ← endpoints{…} / current_user{…} / build_info / host_info / tenant_name / tier_name
        │
        ├─► 反序列化 → FSessionEndpoints backend_endpoints   （附录 A）
        ├─► root_url ← endpoints.root
        │        └─► GetServerInfo() 拆 "."
        │                 └─► ServerName → IsDevServer / IsLiveServer
        │                          └─► 只影响【版本闸门】的行为
        └─► current_user → FJwtPayload → AKardsSession.jwt_payload
        │
        ▼
③ 读配置：server_options（是【字符串】）
   "{\"versions\":[…],\"websocketurl\":\"ws://…\",\"appscale_*\":…}"
        │
        ├─► 解 JSON → ConfigSubsystem（键/值仓库）
        │        ├─ GetJSONArray("versions")      → 版本闸门（附录 B）
        │        ├─ GetXxx("appscale_…")          → UI 缩放，缺失走调用处默认值
        │        └─ (C++ 层) websocketurl         → 建 WebSocket
        └─► 维护模式：xserver_closed 非空 → 弹公告 / 拒绝进入
        │
        ▼
④ POST /session 登录
   ← SessionResponse（几十个字段）
        ├─► jwt / jti          → Authorization: JWT <jwt>
        ├─► client_id/player_id → AKardsSession.client_id / player_id
        ├─► decks.headers      → kards_player_decks
        ├─► *_url              → 后续接口地址（完整 URL）
        └─► server_options     → 同 ③
        │
        ▼
⑤ 进入游戏：轮询与开局
   GET /lobbyplayers → POST /lobbyplayers → GET /matches/v2/
        ← MatchStartingInfo
             ├─ match.actions_url  ←【每局由服务端指定】动作轮询地址
             ├─ match.match_url
             └─ starting_data      ← FCardData 手牌/牌库
        │
        ▼
⑥ 对局中：PUT/POST {match.actions_url}（动作走 HTTP 轮询）
   WS ws://…（来自 server_options.websocketurl）只做 ping / 通知 / 踢人
```

## ① 起点：硬编码基址

客户端二进制里直接写死了官方地址，没有配置文件可改。改指向只有两条路（详见[第 10 章](/private-server/10-deploy)）：

```cpp
// IPRedirection.cpp：两个字符串槽，等长替换
constexpr std::streamoff kPrimaryOffset   = 0x7D304A1;   // "https://kards.live.1939api.com/"
constexpr std::streamoff kSecondaryOffset = 0x7D86238;   // "https://kards.live.1939api.com/config"
```

注意第二个槽是 `/config`——说明客户端**启动时会先拉一个配置端点**（对应实现的 `/.com/config` 或 `/config`）。这也是关服公告的载体。

## ② `GET /`：会话建立与端点装填

响应被反序列化成 `FSessionEndpoints` 存在 `AKardsSession.backend_endpoints` 上（[附录 A](/private-server/appendix/uht-structs)）。同时 `endpoints.root` 落到 `root_url`。

::: warning 服务端必须下发**完整 URL**，不能只给路径
这是最容易踩的一条。客户端把 endpoint 字段**当作可直接请求的地址**，不会自己拼 base：

```jsonc
// ✅ 正确：绝对地址
"matches2": "http://192.168.1.16:5231/matches/v2/"
// ❌ 错误：相对路径，客户端会请求失败或拼到官方域名上
"matches2": "/matches/v2/"
```

推理依据：三个实现的 `endpoints` 值全是 `{Base}/path` 形式的绝对地址，且登录响应里的 `decks_url` / `library_url` / `heartbeat_url` 同样如此。
:::

### `root_url` 的副作用：dev / live 判定

`GetServerInfo()` 会把 `root_url` 按 `.` 拆开取第二段作为"服务器名"，再与 `"dev"` / `"live"` 比较（[附录 B](/private-server/appendix/decompile-notes)）。这个值唯一的作用是**版本闸门**：

| `endpoints.root` | 第二段 | 版本行为 |
|---|---|---|
| `https://kards.live.1939api.com/` | `live` | 只接受与 `versions` 前缀匹配的客户端 |
| `https://kards.dev.1939api.com/` | `dev` | 额外允许"比列表更新"的客户端 |
| `http://127.0.0.1:5231` | `0` | 非 dev 非 live → 依赖前缀匹配 / fail-open |

**实践建议**：本地开发时要么给 `versions` 一个足够短的前缀（`["Kards 1.5"]` 能放行 `Kards 1.54`），要么用第二段为 `dev` 的域名。

## ③ `server_options`：一个"字符串里的配置中心"

这是整套协议里最特殊的设计：**响应字段是字符串，内容是 JSON**（原因是 `UServerConfig.JsonString`，见[附录 A](/private-server/appendix/uht-structs)）。

```jsonc
// 注意：值被转义成了一整行字符串
"server_options": "{\"nui_mobile\":1,\"versions\":[\"Kards 1.54\"],\"websocketurl\":\"ws://192.168.1.16:5232/ws\"}"
```

客户端把它解成 `ConfigSubsystem` 的**键值仓库**，之后所有配置读取都是"按 key 取值"：

```cpp
// 业务蓝图的读法（示例见附录 B 的 ServerUtilityFunctions）
ConfigSubsystem.GetString("brothers_in_arms_date", out Value);
ConfigSubsystem.GetJSONArray("versions", out Exists, out Values);
ConfigSubsystem.GetFloat(LocalKey, out Value);     // ← 键名可能是变量
```

::: tip 三个直接可用的结论

1. **键缺失不会崩**：要么 fail-open（`versions`），要么用调用点传入的默认值（`appscale_*`）。
2. **发错类型会静默失效**：`versions` 要 JSON **数组**；`nui_mobile` 这类要数字。发成字符串不会报错，只会让功能不生效。
3. **`websocketurl` 在 C++ 层被读**（蓝图产物里零命中）——所以它虽然不出现在任何蓝图里，却是**必需**的：没有它客户端不知道 WS 连哪。
:::

### 维护模式

| 端点 | 字段 |
|---|---|
| `/.com/config`（Go）、`/config`（fyserver） | `xserver_closed`、`xserver_closed_header`、`forgot_password_url` |

`xserver_closed` 非空 → 客户端弹公告。**这是最省事的"关服维护"开关**，不需要改任何业务逻辑。

## ④ `POST /session`：数据落到哪些会话字段

登录响应是整个协议里最大的一个结构。[附录 A](/private-server/appendix/uht-structs) 的 `AKardsSession` 就是它的落点：

| 响应字段 | 会话字段 | 后续影响 |
|---|---|---|
| `jwt` / `jti` | `JWT` / `jti` | 之后所有请求的 `Authorization: JWT <token>` |
| `client_id` / `player_id` | `client_id` / `player_id` | 请求路径里的玩家 ID |
| `decks.headers` | `kards_player_decks`（`FDeckHeaders`） | 卡组列表 UI、进队列用的 `deck_id` |
| `library_url` | —（C++ 层） | 拉卡牌库 → `deck_cards` |
| `server_time` | `server_time_diff` / `server_time_on_logon` | 客户端算时钟差；**格式是 `2025.07.06-04.06.03`** |
| `*_level` / `*_xp` | `kardsPlayerInfo.*` | 只有五国（[附录 B](/private-server/appendix/decompile-notes)） |
| `server_options` | `ConfigSubsystem` | 同 ③ |
| `current_user`（在 `GET /` 里） | `jwt_payload`（`FJwtPayload`，全 int32） | 身份信息 |

## ⑤ 地址在运行期还会变

进对局后，**动作接口地址来自对局数据本身**：

```jsonc
// GET /matches/v2/ 的 MatchStartingInfo
"match": { "match_url": "http://…/matches/v2/482913",
           "actions_url": "http://…/matches/v2/482913/actions", … }
```

也就是说客户端**不把 `/matches/v2/{id}/actions` 拼死**，而是读服务端给的 `actions_url`。推论：

- 可以把对局请求路由到**另一台机器**（多实例分片）；
- 排查"动作发不出去"时，第一件事是看 `actions_url` 是否可达、是否与 `player_id` 对得上。

轮询节奏同样来自会话/配置：`kards_poll_interval`、`matchPollTime`、`maxSecondsBetweenHeartbeats`。**服务端要配合**：轮询接口必须轻、无锁、不做 IO（[第 8 章](/private-server/08-match-actions)）；心跳超时过短会把移动端玩家判离线。

## ⑥ 写私服时的五条推论

| # | 推论 | 依据 |
|---|---|---|
| 1 | `endpoints` 与各 `*_url` **必须是绝对地址** | 客户端不拼 base |
| 2 | `endpoints` 的键要**给全** | 缺失 = 空 URL 请求 |
| 3 | `server_options` 必须是**字符串**，内容才是 JSON | `UServerConfig.JsonString` |
| 4 | `versions` 决定客户端版本准入，**不给该键就全放行** | `Is Client Version OK` |
| 5 | `endpoints.root` 的域名会影响版本策略（dev 更宽松） | `GetServerInfo` + `IsDevServer` |

::: warning 本页哪些是实测、哪些是推断
- **实测**（UHT 头文件 + 反编译产物）：`FSessionEndpoints` 字段、`root_url` 的 dev/live 推导、`versions` 的前缀匹配与 fail-open、`appscale_*` 默认值、五国等级、`FCardData` 只需 5 个字段。
- **推断**（依据：三个实现下发的都是绝对地址 + 蓝图产物中 `backend_endpoints`/`matches2` 零命中）：URL 拼装在 C++ 层、客户端直接使用下发的完整地址。

第 2 条推断建议自己验一次：把某个 endpoint 改成相对路径，看客户端请求落到哪里——这是十分钟就能确认的事，比信文档可靠。
:::

---

配套阅读：[附录 A · UHT 结构体与枚举](/private-server/appendix/uht-structs)｜[附录 B · 蓝图反编译注解](/private-server/appendix/decompile-notes)｜[第 2 章 · 引导接口](/private-server/02-bootstrap)
