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
| 状态 | 功能可用；提交节奏较慢（最近一次推送 2026-05） |

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

## 与 fyserver 的关系

两者面向同一套客户端协议，取舍不同：

| | fyserver | kards-server-go |
|---|---|---|
| 语言 / 栈 | C# · .NET 10 · Minimal API | Go · Gin |
| 存储 | FASTER KV（文件） | MySQL（GORM） |
| 分发 | NativeAOT 单文件约 20 MB | Windows amd64 可执行文件 |
| 定位 | 协议面覆盖最全、后台完善 | 轻量、Go 生态、便于二次开发 |

## 说明

仓库目前**没有 README 与 LICENSE 文件**，使用前请先阅读源码确认行为与许可状态；
私服相关项目请遵守游戏厂商的服务条款与所在地法律。
