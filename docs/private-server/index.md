---
title: 自己写私服 · 总览
---

# 自己写私服

一套**从零实现 Kards 服务端**的系列教程。协议不是猜的，而是从可运行的服务端实现与客户端产物里读出来的。

**协议依据以 Go 与 C# 两套实现为准**：

| 参考实现 | 语言 / 栈 | 在本系列里的角色 |
|---|---|---|
| [`fyserver`](/projects/fyserver) | C# / .NET 10 + ASP.NET Core minimal API | **主参考**：C# 侧范例；单端口 HTTP+WS；codec、对局、调度、结算最完整 |
| [`kards-server-go`](/projects/kards-server-go) | Go / Gin + GORM + gorilla/websocket | **主参考**：JWT 鉴权、卡组码、对局状态机、WS 与独立端口方案 |
| 客户端 UHT + 蓝图反编译 | C++ 头文件 + Kismet 字节码 | **字段与行为的权威来源**：见[附录 A](/private-server/appendix/uht-structs) / [附录 B](/private-server/appendix/decompile-notes) |
| `word-server`（NestJS） | TypeScript / NestJS + `ws` + `level` | ⚠️ **已过时，仅作历史参考**：个别行为（如结算补刀动作）是早期版本的适配，不代表协议要求 |

编解码算法本身的独立逆向成果见 [B64XorDecryption](/projects/b64xordecryption)（C 动态库 + C# API + IDA 伪代码存档），本系列第 4 章是它的教程化版本。

教程里每一段样例代码都给 **TypeScript** 和 **C#** 两个版本——**TypeScript 只是教学语言，不作为协议依据**；凡与 Go / C# 实现冲突之处，一律以后者为准。

::: warning 用途与免责
本系列仅用于**协议研究与学习**。文中所有接口、字段、常量均来自对第三方实现的阅读与抓包验证，与 1939 Games 无关，也不是官方协议文档。请勿用于商业用途或任何侵权场景；相关参考实现本身即声明为非盈利、禁止商用。生产环境请勿复用文中的默认密钥与口令。
:::

## 整体拓扑

客户端只认两个东西：**一个 HTTP 基址** 和 **一个 WebSocket 地址**。两者都可以由服务端在登录响应里下发，所以整套协议的第一跳是"引导"。

```
┌──────────────┐  1. GET /            (拿 endpoints 表 + current_user)
│              │ ────────────────────────────────────────────────►
│   游戏客户端  │  2. POST /session    (登录/自动建号) → SessionResponse
│              │ ────────────────────────────────────────────────►
│              │  3. GET /lobbyplayers → 排队 → GET /matches/v2  (开局数据)
│              │ ────────────────────────────────────────────────►
│              │  4. POST /matches/v2/{id}/actions  (提交动作，codec 加密)
│              │  ◄──────────────────────────────────────────────►
│              │  5. ws://host:5232/ws  (ping / touchcard / notification)
└──────────────┘
```

要点：

- **HTTP 端口 5231、WebSocket 端口 5232** 是三个实现共同的默认值（`fyserver` 把 WS 合并进 HTTP 同端口，走根路径升级，这一点在[第 9 章](/private-server/09-websocket)展开）。
- 客户端**不会**硬编码业务路径，它先读 `GET /` 返回的 `endpoints` 字典，再去调用。想加接口不必改客户端。
- 玩家的长期身份是**服务端签发的 token**，之后所有请求都带 `Authorization: JWT <token>`。

## 协议速查

粗体为三个实现都实现的"主干"，其余为某一个实现的扩展。

| 方法 | 路径 | 用途 | 章节 |
|---|---|---|---|
| `GET` | **`/`** | 引导：`endpoints` 表 + `current_user` | [02](/private-server/02-bootstrap) |
| `GET` | `/.com/config` | 客户端静态配置（Go 版） | [02](/private-server/02-bootstrap) |
| `POST` | **`/session`** | 登录 / 自动建号 → 巨型 `SessionResponse` | [03](/private-server/03-session) |
| `GET` | **`/players/{id}/library`** | 卡牌库（全牌/收藏） | [05](/private-server/05-player-data) |
| `GET` | **`/items/{id}`** / `POST` | 桌饰、头像、卡背等物件 | [05](/private-server/05-player-data) |
| `PUT` | `/{id}/heartbeat` | 心跳与在线状态 | [05](/private-server/05-player-data) |
| `POST` | **`/players/{id}/decks`** | 新建卡组 | [06](/private-server/06-decks) |
| `PUT` | **`/players/{id}/decks/{deckId}`** | 改卡组（`fill` / `rename` / `change_card_back` / `make_favorite`） | [06](/private-server/06-decks) |
| `POST` | **`/lobbyplayers`** | 进匹配队列 | [07](/private-server/07-matchmaking) |
| `DELETE` | **`/lobbyplayers`** | 退出队列 | [07](/private-server/07-matchmaking) |
| `POST` | `/singleplayerlobby` | 单人/人机队列 | [07](/private-server/07-matchmaking) |
| `GET` | **`/matches/v2/`** | 轮询：是否匹配到对手 → 开局数据 | [07](/private-server/07-matchmaking) |
| `GET` | `/matches/v2/reconnect` | 断线重连，回放全部动作 | [08](/private-server/08-match-actions) |
| `POST` | **`/matches/v2/{id}/actions`** | 提交动作（codec 加密） | [08](/private-server/08-match-actions) |
| `PUT` | **`/matches/v2/{id}/actions`** | 轮询对手动作 | [08](/private-server/08-match-actions) |
| `POST`/`PUT` | **`/matches/v2/{id}/mulligan`** | 调度（换牌） | [08](/private-server/08-match-actions) |
| `PUT` | **`/matches/v2/{id}`** | 结束对局 | [08](/private-server/08-match-actions) |
| `WS` | **`ws://host:5232/ws`** | 实时通道 | [09](/private-server/09-websocket) |

## 环境准备

::: code-group

```bash [C#]
dotnet new web -o mykards
# 目录结构建议与 fyserver 对齐：Endpoints/ Models/ Services/
```

```bash [TypeScript]
npm i -g @nestjs/cli
nest new mykards      # 或 npm init -y && npm i express ws
```

:::

两个语言的选择标准很简单：

- **C# / ASP.NET Core**：`SessionResponse` 这种几十个字段的 DTO 用 `record` + 源生成 JSON 最省事，单端口 HTTP+WS 也最自然。
- **TypeScript / NestJS**：Controller + DTO 的表达力强，热重载舒服，适合当"协议试验台"快速改字段看客户端反应。

## 章节导航

1. [协议是怎么知道的](/private-server/01-discovery) —— 抓包、蓝图反编译、UHT 三路取证
2. [引导接口与最小服务](/private-server/02-bootstrap) —— `GET /`、`endpoints` 表、`current_user`
3. [登录与会话](/private-server/03-session) —— `POST /session`、巨型响应逐字段说明、token 签发
4. [消息编解码 codec](/private-server/04-codec) —— salt 长度表 + 循环 XOR + Base64
5. [玩家数据、物品与图书馆](/private-server/05-player-data) —— library / items / heartbeat
6. [卡组与卡组码](/private-server/06-decks) —— `%%` 卡组码的位段与倍数规则
7. [大厅、匹配与开局](/private-server/07-matchmaking) —— 队列、`matches/v2`、发牌
8. [对局动作、调度与结算](/private-server/08-match-actions) —— actions 轮询/提交、mulligan、胜负
9. [WebSocket 实时通道](/private-server/09-websocket) —— 四个 channel 与帧格式
10. [部署与兼容性坑](/private-server/10-deploy) —— 反代、IP 重定向、字段顺序陷阱

## 附录（产物注解、自检、复现与官服实测）

正文讲"服务端要返回什么"，附录讲"客户端为什么这么要"——全部来自游戏包的 UHT 头文件与蓝图反编译：

- [附录 A · UHT 结构体与枚举注解](/private-server/appendix/uht-structs) —— `endpoints` / `FMatch2` / `FCardData` / `FJwtPayload` 等客户端结构体逐字段注解；`EFactionEnum` 就是卡组码国家位、`ECardLocationEnum` 就是 `location` 字符串
- [附录 B · 蓝图反编译注解](/private-server/appendix/decompile-notes) —— `server_options` 的 25 个配置键与默认值、**版本闸门** `Is Client Version OK`、dev/live 从 `endpoints.root` 推导、五国等级与阵营颜色表
- [附录 C · 客户端如何解析端点与配置](/private-server/appendix/client-flow) —— 从硬编码基址到进对局的完整链路时序，以及"哪些是实测、哪些是推断"
- [附录 D · 自检脚本与常量速查](/private-server/appendix/smoke-test) —— 常量速查表 + 可复制的 PowerShell 冒烟脚本（10 步逐步 `✓`/`✗` 并指向对应章节）
- [附录 E · 复现指南与待验证清单](/private-server/appendix/open-questions) —— 四条取证路径与复现步骤，以及 **10 项尚未验证的推断**（每项附一分钟验证法）
- [附录 F · 官服实测对照](/private-server/appendix/live-probe) —— 直接调用 `kards.live.1939api.com` 的实测结果：API Key 前置头、真实登录 DTO（`provider: "device_id"`）、`/session` 的 70 个扁平字段、**150 键 `server_options` 全清单**、RS256 令牌 claim、library 与卡组码真实形态，以及**六处对既有说法的纠正**
- [附录 G · 端点矩阵与数据复用](/private-server/appendix/endpoint-matrix) —— 22 个端点的方法/形态/元素字段一张表；**哪些结构被复用**（会话内联的卡组、赛事、`current_user` = JWT claim）；六个"同名不同形"的键；空响应的三种写法（`[]` / `null` / 空体）
