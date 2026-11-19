---
title: fyserver —— KARDS 私服服务端
---

# fyserver

用 C# / .NET 10 写的 KARDS 私服服务端：**单进程、单端口**同时承载 HTTP API 与 WebSocket，支持本地 FASTER、MySQL 或 PostgreSQL 存储，
发布产物为 NativeAOT 原生可执行文件，无需安装 .NET 运行时。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 · ASP.NET Core Minimal API |
| 数据持久化 | FASTER 本地存储，或 MySQL / PostgreSQL |
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
| 基础人机匹配、实时观战与历史对局回放 | ✅ |
| WebSocket（`ping` / `touchcard` / `emoji` / `notification`，服务端主动 `disconnect`） | ✅ |
| 部分物件（头像、桌饰等） | 🟡 部分实现 |
| 排行榜、成就、好友、军需箱、抽卡、乱斗、JJC | ❌ 未实现 |

完整接口清单（会话与配置 / 玩家与商店 / 卡组 / 匹配与对局 / 管理接口）见仓库 README。

## 快速开始

```bash
dotnet build FYServer.slnx
dotnet run --project fyserver.csproj
```

- HTTP 与 WebSocket **共用同一端口**（默认 `5231`，即 `setting.json` 的 `portHttp`），WebSocket 直接向 HTTP 根路径发起升级请求。
- `setting.json` 不存在时自动生成，可配置 `portHttp` / `ip` / `bancheat` / `adminApiKey`。
- 构建会先在 `AdminUi/` 安装依赖并构建 Vue/Vite 后台；首次构建需要 Node.js 与 npm。
- 启动后控制台按 `C` 进入命令模式：`savedbss`（全量保存）、`savedbfo`（增量保存）、`reloadstore`、`clearusers`、`cm`（清空对局）、`exitall`。
- 后台 / 无控制台环境下自动进入非交互模式，保持进程存活。

### NativeAOT 发布

```bash
dotnet publish fyserver.csproj -c Release -r win-x64 --self-contained true
```

产物在 `bin/Release/net10.0/win-x64/publish/`：`fyserver.exe` + `setting.json` + `config/` + `library/` + `wwwroot/`，
拷到目标机直接运行。后台是纯静态 HTML/JS + JSON 接口，不含 Razor/MVC 反射，所以 **AOT 产物同样带完整后台**。

## 后台管理

入口 `/admin-ui/`：Vue/Vite 构建的静态后台由 ASP.NET Core 托管，并调用 `/admin/api/*`。

| 功能 | 用途 |
|---|---|
| 概览与用户管理 | 查看运行状态、搜索用户、管理封禁及资料 |
| 对局管理 | 查看实时对局与队列，查询和管理历史对局及动作 |
| 内容配置 | 编辑首页内容与其他配置，并支持导入、导出及备份 |
| 账号与审计 | 创建后台账号、分配权限并查看操作记录 |

鉴权要点：**首次设置必须在服务器本机**创建 Owner 账户；之后本机和远程访问均需登录，后台操作按账号权限控制。`X-Admin-Key` 不再绕过后台账号权限。请以仓库 README 的管理接口说明为准。

封禁 / 踢出 / 删除都会先向目标玩家的 WebSocket 发送 `channel: "disconnect"`，再以 `PolicyViolation` 关闭连接。

## 项目结构

```
fyserver/
├── Program.cs                  # Host 引导：配置 → DI 注册 → 单 host（HTTP + WS 同端口）启动
├── Endpoints/                  # minimal API 分组（User/Player/Deck/Lobby/Match/AdminApi…）
├── Services/                   # 服务层（UserStore/FasterKv/MatchManager/WebSocketHub/Codec/Auth…）
├── Models/                     # DTO 与实体
├── AdminUi/                    # Vue/Vite 后台源码
├── wwwroot/admin-ui/           # 后台构建生成的静态资源
├── Middleware/                 # 路径归一化、Content-Type 清理
└── Serialization/              # System.Text.Json 源生成上下文
```

## 声明

仓库采用 MIT 许可证，许可仅覆盖 CCB-TEAM 自行编写的源代码；游戏数据、美术、音频等第三方资源不包含在该许可范围内。项目与 1939 Games 没有隶属、授权或合作关系；详情请阅读仓库的 [许可证与声明](https://github.com/CCB-TEAM/fyserver#许可证)。

## 相关项目

- [FyClient](/projects/fyclient) —— 配套虚拟测试客户端，覆盖登录 / 卡组 / 匹配 / 对局 / 封禁全流程的端到端验证
- [kards-server-go](/projects/kards-server-go) —— 同一目标的 Go 实现（Gin + GORM）
