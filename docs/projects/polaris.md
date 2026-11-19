---
title: polaris
---

# polaris

[polaris](https://github.com/CCB-TEAM/polaris) 是面向 KARDS / UE 5.6 的蓝图编译工具，结合 UHT 风格 C# SDK 生成与 Kismet 字节码编译。

## 功能

- 从 jmap 数据生成 C# SDK，用 Roslyn 处理受支持的 C# 语法。
- 将生成的字节码写回现有蓝图资产，并支持修改部分类默认值。
- 提供命令行、示例与 mod pak 导出流程。

## 使用与边界

项目针对特定游戏和 UE 版本，编译器只支持 C# 的子集，并非通用蓝图编辑器。仓库 README 对运行期验证状态存在不同表述，应结合其 [验证记录](https://github.com/CCB-TEAM/polaris/tree/main/docs/verification) 和实际目标版本判断；序列化检查本身不能证明游戏内行为正确。构建与使用步骤见 [项目 README](https://github.com/CCB-TEAM/polaris#readme)。

相关：[solstice-cskismet](/projects/solstice-cskismet) · [项目总览](/projects/)
