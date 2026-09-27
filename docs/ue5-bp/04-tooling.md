---
title: 04 · 工具全景
---

# 04 · 工具全景

蓝图逆向的工具生态分四类，**它们解决的不是同一个问题**，混用会踩坑。星标数与许可取自 GitHub API 实测（2026-09）。

## 一、AST 解析库（地基）

这一类不做「反编译」，只负责**把字节码正确解析成结构化对象**。所有上层工具都建在它们之上。

| 项目 | 语言 | 许可 | Stars | 说明 |
|---|---|---|---|---|
| [UAssetAPI](https://github.com/atenfyr/UAssetAPI) | C# | MIT | 499 | 低层 .NET 资产读写库；`Kismet/Bytecode/` 下有 **100 个 `EX_*.cs`**、`EExprToken.cs`、`ExpressionSerializer.cs` |
| [CUE4Parse](https://github.com/FabianFG/CUE4Parse) | C# | Apache-2.0 | 647 | 解析 UE4/UE5 归档与包；Kismet 部分在 `UE4/Kismet/`，并**为多个游戏提供专用表达式类** |

（`EX_*.cs` 数量由 GitHub API 列目录实测；CUE4Parse 的定位与用途出自其
[README](https://github.com/FabianFG/CUE4Parse)：由 FModel 团队维护，用于解析
`UObject`、`UTexture2D`、`UAnimSequence`、`UStaticMesh` 等原生数据类）

::: tip 选哪个
**看你的下游工具用什么。** 本站的 [KismetDecompiler](/projects/kismetdecompiler) 与
[KismetReactor](/projects/kismetreactor) 都基于 UAssetAPI；[kismet-analyzer](https://github.com/trumank/kismet-analyzer)
则是把 UAssetAPI 作为 submodule 一起编译。而 CUE4Parse 的优势在于**已经内置了大量逐游戏的适配**——
如果你要处理的游戏正好在它的 `GameTypes/` 列表里，能省掉很多逆向工作。
:::

## 二、反编译器（给人读）

| 项目 | 语言 | 许可 | Stars | 能力 | 已知边界 |
|---|---|---|---|---|---|
| [KismetDecompiler](https://github.com/CCB-TEAM/KismetDecompiler)（本站） | C# | — | 1 | AST → C++ 风格伪代码；CFG 结构化（17/19 函数零 goto）；反 Dispatch；`--disasm` 反汇编视图；`--cfg` 流程调试 | dispatch case 内个别跨段 goto 保留；行级优化只处理「赋值一次 + 相邻使用」的临时量 |
| [kismet-analyzer](https://github.com/trumank/kismet-analyzer) | C# | MIT | 120 | 生成 **CFG**（graphviz / SVG 查看器）、类层次结构、单资产 CFG 直接开浏览器 | 偏「分析与可视化」，不是可读伪代码生成器 |
| [KismetKompiler](https://github.com/tge-was-taken/KismetKompiler) | C# | — | 39 | 反编译成 **C# 风格语法**；并能**编译回去** | 作者自述「不是所有蓝图构造都支持」；**主要用 UE 4.23 资产测试**（Shin Megami Tensei V） |

（能力与边界均出自各自 README / 本站 README）

`kismet-analyzer` 的用法很直观，适合快速看一个资产的控制流：

```console
kismet-analyzer cfg unpacked/path/to/YourAsset.uasset
kismet-analyzer gen-cfg-tree unpacked-fsd/ output/ FSD --render --progress
```

（出自 [kismet-analyzer README](https://github.com/trumank/kismet-analyzer)）

## 三、往返编译（能改）

这是最稀缺的一类——**能把改过的逻辑编译回 `.uasset`**。

[KismetKompiler](https://github.com/tge-was-taken/KismetKompiler) 是目前公开资料里最完整的实现，它的设计里有两点值得单独说：

1. **自带校验**：「The tool automatically verifies the equality of the decompiled code to ensure accuracy during
   the decompilation process.」——反编译完会**验证等价性**，可以关掉。这个设计本身就说明
   「反编译可能不保真」是作者预期内的问题。
2. **自定义脚本格式**：编译走 `.kms`（KisMetScript）格式，而不是让你直接改伪代码。

```console
KismetKompiler compile -i script.kms --asset existing.uasset --usmap mapping.usmap
```

（用法出自 [KismetKompiler README](https://github.com/tge-was-taken/KismetKompiler)）

它的编辑能力是**有限的**，README 说得很明确：可以改已有逻辑、加新逻辑、加变量与函数、导入新的库函数，
但**不能从零创建类，也不能修改已有的变量/函数定义**。

还有几个更早期的尝试，可以作为思路参考（都还很不成熟，star 数为个位数）：
[`bp-decompiler-poc`](https://github.com/kt-gibson/bp-decompiler-poc)（把蓝图转成受 Verse 启发的纯文本格式，
便于手工或 LLM 编辑后再导回编译）、[`uasset-decompiler`](https://github.com/gpostolskiy-work3/uasset-decompiler)。

## 四、图形化与运行时

| 项目 | 类型 | 说明 |
|---|---|---|
| [KismetReactor](/projects/kismetreactor)（本站） | 图形化查看 / 就地编辑 | WPF；导入查看、自动导入、插入字节码/属性 |
| [UEBlueprintGraphViewer](/projects/upstream#ueblueprintgraphviewer) | 上游衍生 | 蓝图反编译 + 调试器 + 引用搜索（fork 自上游） |
| [kismet-analyzer](https://github.com/trumank/kismet-analyzer) | 可视化 | CFG 渲染成 SVG，可在浏览器里看 |
| [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) | **运行时** | 蓝图 mod 加载 + Live Property Viewer/Editor |

### 运行时这条路的定位

UE4SS 的**蓝图 mod 加载**走的是完全不同的思路：**不反编译、不修改游戏文件**，而是在运行时把蓝图 mod 加载进去。

> As our BP system is based on RussellJ's, this tutorial video is applicable for creating a blueprint mod for UE4SS

（出自 [UE4SS · Blueprint Modloading](https://docs.ue4ss.com/feature-overview/blueprint-modloader.html)；
注意该页内容很薄，实际细节在视频与源码里）

配合它的 **Live Property Viewer and Editor**（「搜索、查看、编辑与监视任意已加载对象的属性」），
可以做到「不改一个字节的资产文件，改掉运行时的行为」。

（功能描述出自 [UE4SS 文档首页](https://docs.ue4ss.com/)）

**什么时候该用运行时而不是静态反编译：**

| 场景 | 选哪条 |
|---|---|
| 只想知道逻辑、做分析 | 静态反编译（可批量、可离线） |
| 想改数值 / 临时试效果 | 运行时（Live View），改完即生效 |
| 想把改动做成可分发的 mod | 运行时（蓝图 mod 加载器），不动游戏文件 |
| 想把逻辑搬去别处跑（模拟器 / 服务端） | 直译 AST（[本站做法](/kismet-sim/)） |

## 选型速查

| 你的目标 | 建议起点 |
|---|---|
| 第一次接触蓝图字节码 | 先用 [kismet-analyzer](https://github.com/trumank/kismet-analyzer) 看 CFG，建立「控制流长什么样」的直觉 |
| 要读某个函数的具体逻辑 | [KismetDecompiler](/projects/kismetdecompiler)（记得配 `--usmap`；可疑处用 `--disasm` 回查操作码） |
| 要批量处理 / 写自己的分析 | 直接用 UAssetAPI 或 CUE4Parse 的 AST，别碰伪代码 |
| 要改蓝图逻辑并回写 | [KismetKompiler](https://github.com/tge-was-taken/KismetKompiler)，并准备好接受「不是所有构造都支持」 |
| 只想改运行时行为 | [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) 的蓝图 mod / Live View |

::: warning 一个共同的坑
上表所有工具**都依赖正确的资产解析**。如果 `.usmap` 缺失或版本对不上，
工具不会告诉你「映射文件不对」，而是**给你一份解析错位的产物**——
在蓝图层面上，这种错误往往表现为「函数体看起来很短」或「调用点莫名缺失」，
非常像反编译器的 bug。遇到疑似 bug，先排除 usmap。
:::

## 相关

- [03 · 反编译](/ue5-bp/03-decompile)
- [05 · 罕见之处](/ue5-bp/05-pitfalls)
- [06 · 上手路径](/ue5-bp/06-practice)
- [附录 · 出处清单](/ue5-bp/appendix/sources)
