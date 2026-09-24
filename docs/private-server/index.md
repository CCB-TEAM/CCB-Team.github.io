---
title: 自己写私服 · 总览
---

# 自己写私服

一套**从零实现 Kards 服务端**的系列教程。协议不是猜的，而是从三个可运行的服务端实现里读出来的：

| 参考实现 | 语言 / 栈 | 在本系列里的角色 |
|---|---|---|
| [`fyserver`](/projects/fyserver) | C# / .NET 10 + ASP.NET Core minimal API | C# 侧范例；单端口 HTTP+WS；自研 codec token |
| [`kards-server-go`](/projects/kards-server-go) | Go / Gin + GORM + gorilla/websocket | 协议最完整的一版（JWT、卡组码、对局、WS） |
| `word-server`（NestJS） | TypeScript / NestJS + `ws` + `level` | TS 侧范例；最小的可用骨架 |

编解码算法本身的独立逆向成果见 [B64XorDecryption](/projects/b64xordecryption)（C 动态库 + C# API + IDA 伪代码存档），本系列第 4 章是它的教程化版本。

教程里每一段样例代码都给 **TypeScript** 和 **C#** 两个版本（少数只与某一种语言相关的细节会单独标注）。Go 实现只作为**协议依据**引用，不作为教学语言。

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
| `POST` | `DELE` `/lobbyplayers` | 退出队列 | [07](/private-server/07-matchmaking) |
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
