---
title: 上游衍生项目
---

# 上游衍生项目（Fork）

CCB-TEAM 下有一批**在上游仓库基础上 Fork** 的项目：团队在这些项目上做过本地修改、扩展或仅作研究用途的留存。
它们不是团队从零开发的成果，**著作权与主要贡献属于上游作者**；下面的介绍侧重「这是做什么的」以及「相对上游的差异」。

| 项目 | 上游 | 语言 | 类型 |
|---|---|---|---|
| [Ruri.ShaderDecompiler](#ruri-shaderdecompiler) | ShiyumeMeguri/Ruri.ShaderDecompiler | C# | Shader 反编译库 |
| [iced](#iced) | icedland/iced | Rust | x86/x64 反汇编器 |
| [FractalMiner](#fractalminer) | ShiyumeMeguri/FractalMiner | ShaderLab | 分形渲染 |
| [VapeV4.21](#vapev4-21) | xiaoyu777-coder/VapeV4.21 | Java | 恢复工程 |
| [OpenVape](#openvape) | OpenVapeCN/OpenVape | Batchfile | 恢复工程 |
| [gerouke-bot](#gerouke-bot) | xianyu110/grok-bot-0.18-reconstructed | TypeScript | Bot 重建 |
| [UEBlueprintGraphViewer](#ueblueprintgraphviewer) | glgen/UEBlueprintGraphViewer | C# | 蓝图查看器 |

::: tip 关于 Fork
Fork 仓库的提交历史包含上游全部提交，因此仓库页面上显示的「最近推送」可能早于团队实际改动的时间。
引用或二次分发前，请以**上游仓库的 LICENSE**为准。
:::

## Ruri.ShaderDecompiler

通用的 **Shader 反编译库**，把编译后的 Shader 二进制还原为**高可读性的 HLSL 代码**。
核心目标是解决 Shader 反编译中**变量名丢失**的问题：通过跨引擎的通用方案，重建**符号信息（Symbols）**与**字节码逻辑（Bytecode）**之间的关联。

- **Unity**：操作体验与 AssetRipper 一致，在工具中开启 `ShaderDecompilerHook` 即可完成导出与反编译。
- **Unreal Engine**：同样接入符号注入流程。
- **项目状态**（上游自述）：基本中间层与符号注入已完成，只需在引擎端构建 metadata 传入，即可实现**带符号反编译**。

仓库：<https://github.com/CCB-TEAM/Ruri.ShaderDecompiler>

## iced

[x86/x64 反汇编器、汇编器、解码器与编码器](https://github.com/icedland/iced)库，覆盖 Rust / .NET / Java / Python / Lua 五种语言绑定，
以「快且正确」著称，可用于反汇编、指令分析、JIT 调试与二进制工具链。

保留在组织下的用途：为逆向分析、指令级协议还原与二进制工具开发提供可编程的反汇编能力。
仓库：<https://github.com/CCB-TEAM/iced>

## FractalMiner

基于 Unity ShaderLab 的分形渲染项目（上游自述「砕形内化宇宙」）：以着色器为核心做实时分形/噪声类视觉实验，
是团队在图形与 Shader 方向的技术储备。

仓库：<https://github.com/CCB-TEAM/FractalMiner>

## VapeV4.21

**Vape 4.21 的 Java 层与 Windows x64 原生桥接层研究性恢复工程**——不是官方源码、原始发布包或厂商签名产物，也不保证与原产品行为完全一致。

上游 README 列出的 Minecraft 兼容矩阵（Vanilla / Forge / Fabric）：1.7.10 ✓、1.8.9 ✓、1.12.2 ✓、1.21.11 ✓（Forge/Fabric 视版本而定）。

::: warning 使用前提
上游明确说明：本项目用于软件恢复、兼容性分析和自有环境测试，**仅应在你拥有并获准测试的隔离实例中使用**，
并自行确认当地法律、软件许可和服务器规则。
:::

仓库：<https://github.com/CCB-TEAM/VapeV4.21>

## OpenVape

同一方向上的另一条路线：对 **Vape 4.21 客户端、启动器与本地服务**的研究性恢复工程。
上游声明其为**教育研究性质的逆向工程恢复项目**，用于软件兼容性分析与技术研究；不接受外部资助、不代表任何组织或团体。

上游明确的使用边界：仅限教育、研究与自有授权环境测试；**使用前必须已拥有 Vape 的合法授权**；使用者自行确保遵守当地法律、软件许可协议及服务器规则。

仓库：<https://github.com/CCB-TEAM/OpenVape>

## gerouke-bot

上游 `grok-bot-0.18-reconstructed` 的 Fork：面向 **macOS** 的「割肉可 Bot 0.18.0」**面向源码的重建与扩展**工程
（TypeScript）。原项目是对某一 Bot 程序的源码级重建，本 Fork 保留并跟进 macOS 侧适配。

仓库：<https://github.com/CCB-TEAM/gerouke-bot>

## UEBlueprintGraphViewer

查看 **UE4 / UE5 游戏编译后蓝图代码**的工具（支持 4.25 及以上版本）。上游 README 给出的功能路线图：

| 能力 | 进度（上游自述） |
|---|---|
| 基础反编译 | 完成 |
| 循环 / 时间轴 / 委托 | 完成 |
| 宏 | 大部分完成（缺少部分内置宏） |
| 输入事件 | 部分完成 |
| 多 exec pin 的函数 | 未完成 |
| 动画蓝图 | 未完成 |
| 蓝图调试器 | 规划中 |
| 资产引用搜索 | 基础搜索完成；未引用资产搜索完成但可能不精确 |
| 变量 / 函数使用搜索、图内搜索 | 未完成 |

与团队自研的 [KismetDecompiler](/projects/kismetdecompiler) / [KismetReactor](/projects/kismetreactor) 属于同一问题域的三种不同方案：
本工具偏「浏览与调试」，自研工具偏「结构化文本输出」与「字节码编辑」。

仓库：<https://github.com/CCB-TEAM/UEBlueprintGraphViewer>
