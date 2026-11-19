---
title: kards-client-headless
---

# kards-client-headless

一个无需运行 Unreal Engine 或 GPU 的 KARDS 小卡池规则与 AI 原型。Rust 核心负责规则、合法行动、AI 和随机数，C# / .NET 10 程序负责网络协议、HTTP 和命令行。

## 能做什么

- 使用 C# 或 Lua 编写卡牌定义，导出数据后由 Rust 核心解释执行。
- 运行自对弈、逐步回放和规则测试；网络层可连接隔离的 fyserver 测试环境。
- 仓库包含独立 Rust CLI、C# 网络程序、卡牌示例和测试工具。

## 当前边界

项目只覆盖已实现的卡包及规则，不是完整 KARDS 客户端。仓库报告隔离环境下的双机器人测试通过；**与原版客户端的完整对战尚未验证**，不应将测试结果等同于完整兼容。

## 资料

- [GitHub 仓库](https://github.com/CCB-TEAM/kards-client-headless)
- [HeadlessKards 说明与运行方法](https://github.com/CCB-TEAM/kards-client-headless/blob/main/Tools/HeadlessKards/README.md)
- [Rust 核心与卡牌脚本说明](https://github.com/CCB-TEAM/kards-client-headless/blob/main/Tools/HeadlessCore/README.md)
