---
title: UE5 蓝图逆向 · 总览
---

# UE5 蓝图逆向

蓝图在打包之后，**编辑器里的节点图就没了**，留下来的是 Kismet 字节码——一串带结构化跳转的表达式树，
躺在 `.uasset` 里。这个专题整理公开资料与本站实践里关于「怎么把它读出来、读懂、改回去」的方法。

## 为什么这块内容罕见

三个原因，每个都有实证：

1. **没有公开的字节码规范。** 官方唯一给出的「可读化」手段是引擎自带的
   `FKismetBytecodeDisassembler`，而它自己在头文件里写的定位是
   「Kismet bytecode disassembler; Can be used to create a human readable version of Kismet bytecode
   for a specified structure or class」——**是给人看的反汇编视图，不是格式规范**
   （[`ScriptDisassembler.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Editor/UnrealEd/Public/ScriptDisassembler.h)）。
2. **工具生态碎片化。** 每个工具覆盖的范围都有限：有的只反编译不编译，有的只画 CFG，
   有的明确写着「主要用 UE 4.23 的资产测过」。
3. **游戏厂商会往操作码表的空档里塞自己的指令。** 这是最要命的一条——见
   [05 · 罕见之处](/ue5-bp/05-pitfalls)里 WuWa 与 Borderlands 4 的实例。

## 一句话结论

| 你想做的事 | 该走的路 | 关键前提 | 最大的坑 |
|---|---|---|---|
| **看某个蓝图逻辑长什么样** | 反编译成伪代码 | 拿到 AST（不是文本） | 反编译是有损的，边界情况会静默出错 |
| **批量分析 / 直译成别的语言** | 直接消费 `KismetExpression[]` AST | 同上，且**源 AST 边界必须是对的** | 用伪代码文本去解析 → 必然失败 |
| **改蓝图逻辑** | 编译回 `.uasset`，或运行时 hook | 需要编译器的完整实现 | 往返不保真；改完要验证 |
| **只是想调数值** | 运行时改属性，别碰字节码 | 有 Live View 类工具即可 | 没必要为改个数字去反编译 |

## 四条路线

```
                        .uasset / .uexp  (+ .usmap)
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   [反编译]                [直译 AST]               [往返编译]
   AST → 伪代码            AST → 目标语言           AST → 文本 → AST → .uasset
        │                       │                       │
   给人看，有损            给机器跑，无损            能改逻辑，最难
        │                       │                       │
   KismetDecompiler        KardsSim（本站）         KismetKompiler
   kismet-analyzer                                  bp-decompiler-poc
        │
        └── 另有一条不碰资产的路：[运行时 hook](/ue5-bp/06-practice)（UE4SS 蓝图 mod）
```

## 章节

| 章节 | 内容 |
|---|---|
| [01 · 蓝图资产里存了什么](/ue5-bp/01-anatomy) | `UBlueprint` 与 `UBlueprintGeneratedClass`、字节码挂在哪、`.usmap` 为什么必需 |
| [02 · Kismet 字节码](/ue5-bp/02-bytecode) | `EExprToken` 操作码表、序列化格式、执行流栈四件套 |
| [03 · 反编译](/ue5-bp/03-decompile) | 从 AST 到伪代码：结构化控制流、支配树、以及**有损性**的实测证据 |
| [04 · 工具全景](/ue5-bp/04-tooling) | 反编译 / AST / 往返编译 / 运行时 四类工具，各自的边界 |
| [05 · 罕见之处](/ue5-bp/05-pitfalls) | 逐游戏操作码扩展、UE4→UE5 的结构变化、坑清单 |
| [06 · 上手路径](/ue5-bp/06-practice) | 从拿到一个 `.uasset` 到读懂一个函数，以及本站是怎么做的 |
| [07 · 反射对象的字段级定义](/ue5-bp/07-structures) | `FPackageIndex` 的 Import/Export 语义、`UStruct`/`UClass`/`UFunction`/`UProperty` 的字段表，以及**哪些字段根本不在文件里** |
| [08 · 属性系统：FField 与 FProperty](/ue5-bp/08-property-system) | `FField` / `FProperty` 的定义、UE4→UE5 迁移、`EPropertyFlags` 全表与 `ParmFlags` |
| [09 · FKismetPropertyPointer](/ue5-bp/09-property-pointer) | 字节码里指向属性的指针：两种形态、版本门、为什么固定占 8 字节 |
| [10 · LoadedProperties 与签名还原](/ue5-bp/10-loaded-properties) | 函数签名（参数名/类型/in-out）从哪来，以及它和 `.usmap` 的分工 |
| [附录 · 出处清单](/ue5-bp/appendix/sources) | 全部来源与它们支撑的结论 |

::: tip 07–10 是「参考手册」那一半
前六章按**流程**走（资产 → 字节码 → 反编译 → 工具 → 坑 → 上手）；07–10 按**结构**走，是查定义用的：
想知道 `LoadedProperties` 是什么、`ParmsSize` 为什么不在文件里、`FFieldPath` 和 `FPackageIndex` 差在哪，直接跳过去看。
:::```

## 与本站已有内容的分工

本站关于 Kismet 的内容不少，这里说清各自的位置，免得重复读：

| 内容 | 视角 |
|---|---|
| **本专题** | **通用方法论**：蓝图逆向有哪些路线、字节码长什么样、坑在哪 |
| [KismetDecompiler](/projects/kismetdecompiler) | 一个具体工具的**用法与实现细节**（可读性手段、CFG 还原、已知限制） |
| [Kismet 直译模拟器](/kismet-sim/) | **走「直译 AST」这条路的完整实战**：为什么不用伪代码、调用约定、触发点、审计方法论 |
| [KismetReactor](/projects/kismetreactor) | 图形化查看与就地编辑（WPF） |

::: tip 如果你只读一篇
想理解「为什么不能拿反编译产物当数据源」，直接看
[直译模拟器的 01 · 为什么是 AST，不是伪代码](/kismet-sim/01-why-ast)——
里面有本站踩过的真实边界 bug 与前后实测数字。
:::

## 边界

- 本专题面向**单机 mod、私服研究、自己项目的调试与安全研究**；
- **不涉及**反作弊绕过、检测规避；
- 蓝图资产受游戏 EULA 与著作权约束，改完的资产能不能分发、能不能用于联机，请自行确认；
- 各工具许可以对应仓库为准。

::: warning 关于「有损」这件事的严重性
反编译产物**看起来永远合理**——它不会报错，只会安静地少一个分支、多一次调用、把
`do { X(); } while (X());` 渲染成调用两次。本站实测过最严重的一次：
`EX_ComputedJump` 没被当作基本块边界，导致 ubergraph 分发体大量缺失，
效果调用点从 7632 变成 10102（**+32%**）。
详见 [03 · 反编译](/ue5-bp/03-decompile)。
:::
