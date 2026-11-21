---
title: kards-server-go —— Gin 重写的 KARDS 私服
---

# kards-server-go

用 Go + Gin 框架重写的 KARDS 私服，是 [fyserver](/projects/fyserver) 之外的**第二套独立实现**：
同样的客户端协议面，换到 Go 生态（Gin 路由 + GORM 数据层 + JWT 鉴权 + MySQL），并内置后台界面与对局引擎。

| 项 | 值 |
|---|---|
| 语言 | Go（Gin · GORM · JWT · WebSocket · MySQL） |
| 仓库 | <https://github.com/CCB-TEAM/kards-server-go> |
| 发布产物 | `release/kards-server-go-windows-amd64-*.exe`（附 `.sha256` 校验） |
| 状态 | 项目状态及最近推送请查看仓库 |

## 架构

单个 Go 二进制：入口在根目录的 `main.go`，业务全部落在 `internal/`，可对外复用的只有 `pkg/`。

| 层 | 位置 | 目录结构能看出的事 |
|---|---|---|
| 入口 | `main.go` | 根目录唯一 `.go` 文件，即唯一入口 |
| 中间件 | `internal/middleware/`（`auth.go`、`header_fix.go`） | 鉴权与请求头修正各自成文件，位于路由之前 |
| 协议层 | `internal/handlers/` | 按端点分组：`session` / `players` / `decks` / `items` / `lobby` / `match_v2` / `mulligan` / `actions` / `config` / `root` / `stubs` |
| 对局引擎 | `internal/game/` | `manager` / `match` / `match_end` / `deal` / `action_store` / `bot` / `websocket` / `online` / `cards` / `deck_data` / `random` |
| 存储 | `internal/database/db.go` + `internal/models/` | 只有一个 `db.go`，模型独立成目录 |
| 后台 | `internal/adminui/` | `handlers.go` 配 `static/` 下的 HTML 模板页 |
| 公共包 | `pkg/deckcode`、`pkg/security`、`pkg/utils` | 三个独立包，分别管卡组编码、安全与卡组/时间工具 |

```text
客户端 HTTP ──► middleware（auth / header_fix）──► handlers/*（按端点分组）──► internal/game
                                                                         └─► internal/database + internal/models
internal/game/websocket.go ──► 客户端（推送）
后台浏览器 ──► internal/adminui/handlers.go ──► static/*.html
```

`internal/` 与 `pkg/` 分家不是风格问题：Go 的 internal 规则使 `internal/` 下的一切（含对局引擎与后台）无法被仓库外导入，因此这套实现实际上只对外暴露 `deckcode` / `security` / `utils` 三个包。各层的职责判断由目录与文件名推出，未读源码，属**推测**。

## 布局

```
kards-server-go/
├── main.go                 # 启动：初始配置 → 建库 → 启动匹配器与 WS 服务 → Gin 路由
├── internal/
│   ├── adminui/            # 后台界面
│   ├── config/             # 配置与首次运行初始化（PromptInitialSetup）
│   ├── database/           # GORM 数据层
│   ├── game/               # 对局引擎：匹配、发牌、动作、结算、机器人、WS
│   ├── handlers/           # 协议端点：session / players / decks / items / lobby / match_v2 / mulligan / actions
│   ├── middleware/         # 鉴权与中间件
│   └── models/             # 数据模型
├── pkg/
│   ├── deckcode/           # 卡组编码解析（parser + 单测）
│   ├── security/           # 安全相关工具
│   └── utils/              # 卡组与时间工具
├── IPRedirection.cpp/.exe  # 附带的重定向小工具
└── release/                # 预编译 Windows amd64 二进制
```

`internal/game/` 是对局核心：`manager.go`（全局匹配与生命周期）、`match.go` / `match_end.go`（对局推进与结算）、
`deal.go`（发牌）、`action_store.go`（动作存储）、`bot.go`（人机）、`websocket.go`（推送通道），
并带 `deal_test.go` / `match_end_test.go` 单测。`handlers/` 侧内嵌了 `library.json`、`items_library.json` 等卡牌与物品数据。

## 实现细节

以下每条只陈述文件与目录结构能直接证明的内容；涉及行为的判断标注为推测。

- **「内嵌」有对应的文件证据。** 上节说的内嵌，在文件层面就是 `library.json` / `items_library.json` 与 `library_embed.go` / `json_resource.go` 并存：资源与读取代码同置，指向「JSON 被打进二进制、运行时经一层资源函数访问」的做法（推测为 Go `embed`）。这也解释了发布产物只有 exe 与 `.sha256`，没有配套数据目录。
- **后台是服务端渲染的少量页面。** `adminui/static/` 只有 `base` / `login` / `dashboard` / `matches` / `system` / `users` / `users_manage` 七个 HTML，配 `adminui/handlers.go` 一个处理器文件，没有前端构建目录与包管理文件。
- **鉴权与协议兼容各占一个中间件。** `auth.go` 与 `header_fix.go` 分文件存在，说明除鉴权外还有一层针对请求头的修正（推测：对齐官方客户端的头字段）。
- **存在明确的占位端点。** `internal/handlers/stubs.go` 表明部分端点尚未实现或仅返回占位；具体范围需读源码确认，本页不作断言。
- **类型按客户端 SDK 对齐。** `internal/models/sdk_types.go` 的文件名指向按客户端数据形状定义的类型，而非随手建的 DTO（推测）。
- **测试是有选择的。** 树里的单测只有 `internal/game/deal_test.go`、`internal/game/match_end_test.go`、`pkg/deckcode/parser_test.go` 三处，即发牌、结算与卡组编码解析。
- **发布物即单个可执行文件加校验。** `release/kards-server-go-windows-amd64-8ba6ea4.exe` 与同名 `.sha256` 并存，文件名带 7 位提交短哈希（推测：按提交出包，而非按语义化版本号）。
- **附带一个与 Go 代码无关的小工具。** `IPRedirection.cpp` 与其预编译 `.exe` 直接放在仓库根目录，源码与产物同置，不带构建脚本。

## 与 fyserver 的关系

两者面向同一套客户端协议，取舍不同：

| | fyserver | kards-server-go |
|---|---|---|
| 语言 / 栈 | C# · .NET 10 · Minimal API | Go · Gin |
| 存储 | FASTER、MySQL 或 PostgreSQL | MySQL（GORM） |
| 分发 | NativeAOT 原生可执行文件及配套资源 | Windows amd64 可执行文件 |
| 定位 | 协议面覆盖最全、后台完善 | 轻量、Go 生态、便于二次开发 |

## 说明

仓库目前**没有 README 与 LICENSE 文件**，使用前请先阅读源码确认行为与许可状态；
私服相关项目请遵守游戏厂商的服务条款与所在地法律。
