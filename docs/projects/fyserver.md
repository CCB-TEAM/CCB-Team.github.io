---
title: fyserver —— KARDS 私服服务端
---

# fyserver

用 C# / .NET 10 写的 KARDS 私服服务端：**单进程、单端口**同时承载 HTTP API 与 WebSocket，用户数据落盘为 FASTER KV，
发布产物为 NativeAOT 原生可执行文件，无需安装 .NET 运行时。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 · ASP.NET Core Minimal API |
| 数据持久化 | FASTER（`Microsoft.FASTER.Core`，`user:username:*` / `user:id:*` 双索引） |
| 序列化 | System.Text.Json **全量源生成**（零反射，AOT 兼容） |
| 协议编解码 | 纯 C# 实现（Base64 + XOR、查表密钥），无原生 DLL 依赖 |
| 仓库 | <https://github.com/CCB-TEAM/fyserver> |

## 这是什么

fyserver 复刻 KARDS 官方客户端的服务端接口：登录、卡组、商店、匹配、对局动作、调度换牌、断线重连与结算。
目标是让**未修改的官方客户端**能连上自建服务端跑完整流程——因此所有响应体字段、路径与编解码方式都按客户端实际请求对齐。

## 已实现的能力

| 模块 | 状态 |
|---|---|
| 基础框架、登录（自动建号、封禁拦截） | ✅ |
| 名字、卡组（增删改、重命名、卡背、收藏） | ✅ |
| 卡牌库、全牌、FP、商店、自定义 Setting | ✅ |
| 匹配（单人 / 多人 / battle code）、调度换牌 | ✅ |
| 对局动作、对局状态、结算与胜负判定、断线重连 | ✅ |
| WebSocket（`ping` / `touchcard` / `emoji` / `notification`，服务端主动 `disconnect`） | ✅ |
| 部分物件（头像、桌饰等） | 🟡 部分实现 |
| 排行榜、成就、好友、军需箱、抽卡、乱斗、人机、JJC | ❌ 未实现 |

完整接口清单（会话与配置 / 玩家与商店 / 卡组 / 匹配与对局 / 管理接口）见仓库 README。

## 快速开始

```bash
dotnet build FYServer.sln
dotnet run --project fyserver.csproj
```

- HTTP 与 WebSocket **共用同一端口**（默认 `5231`，即 `setting.json` 的 `portHttp`），WebSocket 直接向 HTTP 根路径发起升级请求。
- `setting.json` 不存在时自动生成，可配置 `portHttp` / `ip` / `bancheat` / `adminApiKey`。
- 启动后控制台按 `C` 进入命令模式：`savedbss`（全量保存）、`savedbfo`（增量保存）、`reloadstore`、`clearusers`、`cm`（清空对局）、`exitall`。
- 后台 / 无控制台环境下自动进入非交互模式，保持进程存活。

### NativeAOT 发布

```bash
dotnet publish fyserver.csproj -c Release -r win-x64 --self-contained true
```

产物在 `bin/Release/net10.0/win-x64/publish/`：约 20 MB 的 `fyserver.exe` + `setting.json` + `config/` + `library/` + `wwwroot/`，
拷到目标机直接运行。后台是纯静态 HTML/JS + JSON 接口，不含 Razor/MVC 反射，所以 **AOT 产物同样带完整后台**。

## 后台管理

入口 `/admin-ui/`，纯静态页面 + `/admin/api/*`，自包含 Material 主题、零 CDN 依赖。

| 页面 | 用途 |
|---|---|
| `/admin-ui/` | 概览：端口与地址、在线连接数、用户与封禁数、匹配队列明细、热重载商店配置 |
| `/admin-ui/users.html` | 用户搜索（ID / 用户名 / 昵称）、封禁 / 解封 / 踢下线 / 删除、用户详情与卡组 |
| `/admin-ui/matches.html` | 进行中的真人对局、各队列等待玩家、移除对局 / 清空队列 |
| `/admin-ui/content.html` | 首页公告、乱斗、淘汰赛配置（**带游戏内 SVG 实时预览**），JSON 编辑 + 校验 + `.bak` 备份 |
| `/admin-ui/login` | 首次创建管理员 / 管理员登录 |

鉴权要点：**首次启动必须从服务器本机**创建管理员账户；密码以 PBKDF2-SHA256 派生哈希存于 `data/admin-auth.json`，不存明文；
会话使用 HttpOnly、SameSite=Strict 的 7 天签名 Cookie。`adminApiKey` 仅用于脚本以 `X-Admin-Key` 调用 `/admin/api/*`，
留空时管理接口只允许 loopback 访问。

封禁 / 踢出 / 删除都会先向目标玩家的 WebSocket 发送 `channel: "disconnect"`，再以 `PolicyViolation` 关闭连接。

## 项目结构

```
fyserver/
├── Program.cs                  # Host 引导：配置 → DI 注册 → 单 host（HTTP + WS 同端口）启动
├── Endpoints/                  # minimal API 分组（User/Player/Deck/Lobby/Match/AdminApi…）
├── Services/                   # 服务层（UserStore/FasterKv/MatchManager/WebSocketHub/Codec/Auth…）
├── Models/                     # DTO 与实体
├── wwwroot/admin-ui/           # 静态后台页面（/admin-ui，纯 HTML/JS，Material 主题）
├── Middleware/                 # 路径归一化、Content-Type 清理
└── Serialization/              # System.Text.Json 源生成上下文
```

## 声明

仓库 README 明确载明：项目**非盈利**，仅供个人学习、技术研究与娱乐交流；一切著作权归 **1939 Games** 所有；
严禁用于私服搭建、部署、运营，严禁任何形式的商业化。请在使用前自行确认所在地法律法规与平台政策。

## 相关项目

- [FyClient](/projects/fyclient) —— 配套虚拟测试客户端，覆盖登录 / 卡组 / 匹配 / 对局 / 封禁全流程的端到端验证
- [kards-server-go](/projects/kards-server-go) —— 同一目标的 Go 实现（Gin + GORM）
