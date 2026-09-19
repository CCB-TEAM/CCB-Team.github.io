---
title: FyClient —— 私服端到端测试客户端
---

# FyClient

配合 [fyserver](/projects/fyserver) 使用的**虚拟测试客户端**：用纯 C# 模拟游戏客户端协议，
把登录 → 卡组 → 匹配 → 对局动作 → 调度换牌 → 轮询 → 胜负判定 → WebSocket 心跳整条链路跑通，
用来对服务端做端到端验证，而不必每次开真实游戏客户端。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 |
| 依赖 | 无原生 DLL；请求体序列化走源生成上下文（`FyClientJsonContext`），NativeAOT 友好 |
| 仓库 | <https://github.com/CCB-TEAM/FyClient> |

## 特性

- **纯 C# 协议实现**：编解码（Base64 + XOR、查表密钥、3 字节 actionId）为托管实现，与服务器 `CodecService` 同源。
- **零反射**：请求体通过 System.Text.Json 源生成序列化，可在 AOT 下运行。
- **五个命令**：`login` / `solo` / `duel` / `ws` / `decode`。

## 快速开始

```bash
# 先启动服务器（fyserver）
dotnet build

# 登录 / 注册（自动创建卡组），打印 player_id 与 jwt
dotnet run -- login 用户名

# 单人对局全流程：匹配 → 调度 → 出牌 → 结束对局 → 胜负判定
dotnet run -- solo 用户名

# 双人对局：两个玩家经 battle_code 匹配后自动对打
dotnet run -- duel 用户A 用户B

# WebSocket 心跳（验证 codec 认证头解析）
dotnet run -- ws 用户名

# 解码协议串（调试用）
dotnet run -- decode "编码串"
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `--server` | `http://127.0.0.1:1145` | 服务器 HTTP 地址 |
| `--ws` | `9178` | 服务器 WebSocket 端口 |

## 双人对局输出示例

```
[玩家甲] 登录成功 player_id=566870 name=XDLG#6865
[玩家甲] 已加入匹配（extraData=battle_code:fyduel_374945）
[玩家乙] 对局 848112 status=pending match_type=code
双方就绪，对局 848112 开始
[玩家乙] 轮询到动作: 4 条
[玩家甲] 对局结束 faction=Germany winner=True
[玩家乙] 对局结束 faction=Germany winner=False
双人演练完成 ✔
```

## 结构

```
FyClient/
├── Program.cs    # 命令分发与场景编排（login/solo/duel/ws/decode）
├── Player.cs     # 单玩家客户端：HTTP + WebSocket 全部协议调用
├── Protocol.cs   # 协议 DTO 与源生成上下文（FyClientJsonContext）
└── Codec.cs      # 编解码纯 C# 实现（与服务器 CodecService 同源）
```

## 协议要点

- 请求体 JSON 使用 `snake_case` 命名，与服务器 `FyJsonContext` 对齐。
- 对局动作经编解码后以 JSON 字段 `a` 承载编码串，提交到 `/matches/v2/{id}/actions`。
- WebSocket 认证头为 `codec.Encode(用户名)`（**不带** `JWT ` 前缀）。
