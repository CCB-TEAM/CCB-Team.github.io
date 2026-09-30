---
title: 附录 · 出处清单
---

# 附录 · 出处清单

本专题所有结论的来源。**正文里凡给出一手来源的地方，都能在这张表里找到对应条目**；
标注为「经验做法」的，说明我们没有找到可引用的一手出处。

## 来源分级

| 级别 | 含义 | 本专题的用法 |
|---|---|---|
| **A · 引擎源码** | Epic 官方源码（含公开镜像） | 字节码格式与操作码定义的最终依据 |
| **B · 开源项目源码/文档** | 工具作者自己写的代码与文档 | 实现事实（「某个工具确实这么做」） |
| **C · 工具官方文档** | 工具自己的手册 | 能力与用法 |
| **D · 本站实测** | 我们自己的仓库与实测记录 | 有具体数字的结论 |
| **E · 经验做法** | 无一手出处 | 明确标注，仅供参考 |

## A · 引擎源码

| # | 来源 | 支撑内容 |
|---|---|---|
| A1 | **UE 5.8 源码** `CoreUObject/Public/UObject/Script.h`（CCB-TEAM 私有镜像） | **`EExprToken` 完整操作码表**（0x00–0x6D 与 0x70–0x73、`EX_Max = 0xFF`），含全部注释原文；执行流栈四件套 `EX_PushExecutionFlow` / `EX_PopExecutionFlow` / `EX_ComputedJump` / `EX_PopExecutionFlowIfNot` 的语义；UE4 公开镜像的对照见 [A9](#a-引擎源码) |
| A2 | UE4 公开镜像 `Editor/UnrealEd/Public/ScriptDisassembler.h` | 引擎自带 `FKismetBytecodeDisassembler` 的定位（「create a human readable version」）与它属于 **UnrealEd** 模块（仅编辑器构建）。⚠️ **在 UE 5.8 的源码树里这个路径已不存在**（多个候选路径均 404，可能被移动或移除），需要时请在自己有权限的副本里检索 `FKismetBytecodeDisassembler` |
| A3 | **UE 5.8 源码** `CoreUObject/Private/UObject/ScriptCore.cpp`（4256 行）与 `Public/UObject/Stack.h` | 字节码在引擎侧挂在 `UStruct::Script` 上（`FFrame` 构造函数里 `Code(InNode->Script.GetData())`）；[第 13 章](/ue5-bp/13-vm)的全部运行时依据 |
| A4 | [Epic 官方引擎仓库（需关联 Epic 账号）](https://github.com/EpicGames/UnrealEngine) | UE5 侧同名头文件（`Script.h` / `Class.h` / `Object.h`）的对照位置 |
| A5 | **UE 5.8 源码** `CoreUObject/Public/UObject/Class.h` | `UStruct` 的 `ChildProperties`（`FField*`）/ `Children`（`UField*`）/ `PropertiesSize` / `MinAlignment` / `Script` 与四条内存链表（`PropertyLink` / `RefLink` / `DestructorLink` / `PostConstructLink`）；`UClass : public UStruct`（`Within=Package`）；`UFunction` 的**持久字段 vs 内存字段**分组（`NumParms` / `ParmsSize` / `ReturnValueOffset` 属于后者，`FunctionFlags` 属于前者） |
| A6 | **UE 5.8 源码** `CoreUObject/Public/UObject/ObjectResource.h` | `FPackageIndex` 的定义原文：正值指向 ExportMap（下标 = 值−1），负值指向 ImportMap（下标 = −值−1）（与 UE4 注释一致） |
| A7 | **UE 5.8 源码** `CoreUObject/Public/UObject/UnrealType.h` 与 `Public/UObject/Field.h` | `FProperty` 的字段分组（`ArrayDim` / `ElementSize`（**5.5 起废弃**）/ `PropertyFlags` / `RepIndex` 为持久；`IndexInOwner` 与 `Offset_Internal` 注明 *Generated during Link()*）；`FFieldClass` 的完整字段与其类注释 *Mimics a subset of UObject reflection functions*；`FFieldVariant` 的迁移说明 |
| A8 | **`CCB-Team/UnrealEngine`（私有仓库，Epic 官方 UE5 源码镜像，`release` 分支，`ENGINE 5.8.0`）**：`CoreUObject/Public/UObject/Script.h`、`Class.h`、`Field.h`、`UnrealType.h`、`ObjectMacros.h`、`ObjectResource.h`、`Stack.h`、`ScriptMacros.h`、`CoreUObject/Private/UObject/ScriptCore.cpp`（4256 行）、`Runtime/Launch/Resources/Version.h` | **本系列引擎侧结论的总依据**：[13 章](/ue5-bp/13-vm)全部（`GNatives` 分派表与 `IMPLEMENT_VM_FUNCTION` 注册宏、**92 条 opcode→处理函数映射**、`FFrame` 字段与操作数读取、`ProcessEvent` / `ProcessInternal` / `ProcessLocalScriptFunction` / `CallFunction`、`execJump` 等处理函数、`P_GET_*` 宏、`UFunction::Bind` 里的 `Func = &UObject::ProcessInternal`）；[02 章](/ue5-bp/02-bytecode)的操作码全表；[07 章](/ue5-bp/07-structures)的字段分组；[08 章](/ue5-bp/08-property-system)的 `FFieldClass` / `FFieldVariant` / `FProperty` / `EPropertyFlags` |

::: warning 版本政策：以 UE 5.8 为准
**本系列涉及引擎行为的地方，一手来源都是 UE 5.8**（见 A8）。A1 / A3 / A5 / A6 / A7 指向的就是
UE 5.8 源码里的文件路径。

`EpicGames/UnrealTournament` 是**公开可读的 UE4 源码镜像**，本专题只在两种情况下引用它：

1. **做 UE4 → UE5 的对照**（[02 章](/ue5-bp/02-bytecode) / [05 章](/ue5-bp/05-pitfalls) /
   [13 章](/ue5-bp/13-vm) 的差异表）；
2. **某个结论本身是 UE4 的事**（例如 A2 的 `FKismetBytecodeDisassembler`——UE 5.8 里已找不到该路径）。

**不要**拿 UE4 的具体取值当成「UE5 的表」：操作码表、属性体系、字段布局都改过。
:::

## B · 开源项目源码与文档

| # | 来源 | 支撑内容 |
|---|---|---|
| B1 | [`UAssetAPI/Kismet/Bytecode/EExprToken.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/EExprToken.cs) | UE5 侧操作码枚举；`EX_NothingInt32 = 0x0C`、`EX_BitFieldConst = 0x11` 等新增取值 |
| B2 | [`UAssetAPI/Kismet/Bytecode/Expressions/`](https://github.com/atenfyr/UAssetAPI/tree/master/UAssetAPI/Kismet/Bytecode/Expressions) | **100 个 `EX_*.cs`**（GitHub API 列目录实测计数）——「一个操作码一个类」的 AST 工程基础 |
| B3 | [`CUE4Parse/UE4/Kismet/KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Kismet/KismetExpression.cs) | `KismetExpression<T>` 基类与 `FKismetPropertyPointer` 的 **4.25 分界**（`FFieldPath` vs `FPackageIndex`），以及 `GAME_AssaultFireFuture` 这类按游戏的特例 |
| B4 | [`CUE4Parse/GameTypes/WuWa/Kismet/WuWaKismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/WuWa/Kismet/WuWaKismetExpression.cs) | 鸣潮的自定义操作码 `EX_6E` / `EX_6F`（`EX_WuWaInstr1/2`） |
| B5 | [`CUE4Parse/GameTypes/Borderlands4/Kismet/Borderlands4KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/Borderlands4/Kismet/Borderlands4KismetExpression.cs) | Borderlands 4 的自定义操作码 `EX_FD` / `EX_FE`（`EX_GbxDefPtr` / `EX_GameDataHandle`） |
| B6 | [CUE4Parse README](https://github.com/FabianFG/CUE4Parse) | 库的定位（由 FModel 团队维护、解析 `UObject` / `UTexture2D` / `UAnimSequence` / `UStaticMesh` 等）与 `LoadAllObjects` 示例 |
| B7 | [UAssetAPI](https://github.com/atenfyr/UAssetAPI) | 低层 .NET 资产读写库（本站两个 Kismet 工具的依赖） |
| B8 | [kismet-analyzer README](https://github.com/trumank/kismet-analyzer) | CFG 生成（`gen-cfg-tree` / `cfg`）、graphviz 与 SVG 查看器、类层次结构 |
| B9 | [KismetKompiler README](https://github.com/tge-was-taken/KismetKompiler) | 反编译 + **编译**（`.kms` / KisMetScript）、**自动等价性校验**、编辑能力边界、`--usmap` / `--global`、主要用 UE 4.23 资产测试 |
| B10 | [`bp-decompiler-poc`](https://github.com/kt-gibson/bp-decompiler-poc) / [`uasset-decompiler`](https://github.com/gpostolskiy-work3/uasset-decompiler) | 更早期的往返尝试（蓝图 → 受 Verse 启发的文本 → 回编译） |
| B11 | [UE4SS · Blueprint Modloading](https://docs.ue4ss.com/feature-overview/blueprint-modloader.html) | 运行时加载蓝图 mod 的官方说明（内容较薄，注明基于 RussellJ 的方案） |
| B12 | [`UAssetAPI/ExportTypes/StructExport.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/ExportTypes/StructExport.cs) | **`LoadedProperties` 的定义原文**（"Properties serialized with this struct definition"）；`StructExport` 的字段与读取顺序；两个版本门（`FFrameworkObjectVersion.RemoveUField_Next`、`FCoreObjectVersion.FProperties`）；`ScriptBytecodeSize` / `ScriptBytecodeRaw` 的兜底语义 |
| B13 | [`UAssetAPI/Kismet/Bytecode/KismetPropertyPointer.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/KismetPropertyPointer.cs) | **`KismetPropertyPointer` 的定义原文**（"Represents a Kismet bytecode pointer to an FProperty or FField"）与 `Old` / `New` 两种形态及各自适用的版本门 |
| B14 | [`UAssetAPI/FieldTypes/FField.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs) | `FField` 的类注释（"Base class of reflection data objects"）与序列化字段；`MetaDataMap` 仅在非 editor-only 且未 cook 时读取 |
| B15 | [`CUE4Parse/UE4/Objects/UObject/FField.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FField.cs) | `FField` 的另一套实现；**UE 5.8 起 editor-only 包里不再序列化 `Flags`** |
| B16 | [`CUE4Parse/UE4/Objects/UObject/FFieldPath.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FFieldPath.cs) | `FFieldPath` 的 `Path`（`FName[]`）与 `ResolvedOwner`；`None` 路径归一化；`Ar.Index = index + 8`（**指针固定占 8 字节**） |
| B17 | [`CUE4Parse/UE4/Objects/UObject/UnrealTypeLegacy.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealTypeLegacy.cs) | UE4 侧 `UProperty` 的实际读取字段（`ArrayDim` / `PropertyFlags` / `RepNotifyFunc` / `BlueprintReplicationCondition`），**不含 `ElementSize` 与 `Offset_Internal`**——印证偏移不在文件里 |
| B18 | [`CUE4Parse/UE4/Objects/UObject/UnrealType.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealType.cs) | `EPropertyFlags` 枚举全表（含 `Parm` / `OutParm` / `ReturnParm` / `ReferenceParm` 的注释原文）与 `ParmFlags` 组合掩码；标志位到 `EAccessMode` 的映射 |
| B19 | UAssetAPI 的表达式实现：[`EX_VariableBase.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_VariableBase.cs)、[`EX_PropertyConst.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_PropertyConst.cs)、[`EX_StructMemberContext.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_StructMemberContext.cs)、[`EX_FieldPathConst.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_FieldPathConst.cs) | 哪些操作码持有 `KismetPropertyPointer`；`offset += 8` 的偏移计算；`EX_VariableBase` 基类暴露的 `EX_ClassSparseDataVariable` 这一新增操作码 |
| B20 | [`UAssetAPI/Kismet/Bytecode/Expressions/`](https://github.com/atenfyr/UAssetAPI/tree/master/UAssetAPI/Kismet/Bytecode/Expressions) 全目录 | [第 11](/ue5-bp/11-opcodes-a) / [12 章](/ue5-bp/12-opcodes-b)里每个操作码的**操作数与类型**（含 `KismetExpression<T>` 泛型基类与 `EX_LetBase` / `EX_CastBase` / `EX_VariableBase` 三条继承链）——由 GitHub API 逐文件读取 `public` 字段声明得到，非转述 |
| B21 | [KismetDecompiler `ExprRenderer.cs`](https://github.com/CCB-TEAM/KismetDecompiler/blob/main/ExprRenderer.cs)（本站） | 两章里「渲染」一列的来源：每个 `EX_*` 分支实际输出的伪代码形式（`goto L_XXXX`、`Cast<T>(...)`、`{a} = {b}` 等） |

## C · 工具官方文档

| # | 来源 | 支撑内容 |
|---|---|---|
| C1 | [UE4SS 文档首页](https://docs.ue4ss.com/) | 蓝图 mod 加载、**Live Property Viewer and Editor**（搜索/查看/编辑/监视任意已加载对象属性）、各类 dumper |

## D · 本站实测与自有项目

| # | 来源 | 支撑内容 |
|---|---|---|
| D1 | [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler) | 完整流水线（`FlowStackResolver` → CFG → 支配树 → `EmitRegion` → 可读性改写 → 语义优化）；17/19 函数零 goto；`GetSize` 与 `CodeOffset`/`EntryPoint` 对齐；`ForEach` 空壳出口块导致**渲染出死循环**的成因与修法；`do{X()}while(X())` 重复调用 531 处 |
| D2 | [直译模拟器 01 · 为什么是 AST，不是伪代码](/kismet-sim/01-why-ast) | `EX_ComputedJump` 未当块边界的事故与前后实测（效果调用点 7632 → 10102，+32%；空壳处理函数 1028 → 826）；「能拿到 AST 就别看文本」 |
| D3 | [直译模拟器 · 总览](/kismet-sim/) | 规模数字（1671 资产 / 6434 函数 / 45.6 万行 / 172 原语 / 153 断言 / 100 局自对弈 0 异常）；直译路线的三条先决条件 |
| D4 | [KismetDecompiler 项目页](/projects/kismetdecompiler) / [KismetReactor 项目页](/projects/kismetreactor) | 工具能力与已知限制的对照 |

## 数据来源

- 仓库星标数、许可、描述、目录清单：GitHub REST API（`repos/{owner}/{repo}`、`search/repositories`、
  `git/trees`），**2026-09 实测**；
- 各源码文件的字段、枚举与注释：通过 GitHub API 读取**文件原文**，非二手转述。

## 关于未收录的来源

与[运行时逆向专题](/ue5-re/appendix/sources)同样的原因：本次整理环境下 `web_search` 不可用
（后端返回余额错误），部分社区站点被 Cloudflare 拦截（`guidedhacking.com`、`wiki.cheatengine.org` 返回 403）。
**既然无法核对原文，就不列出处、不写内容。**

因此本专题的来源集中在：Epic 引擎源码、UAssetAPI / CUE4Parse 的实现、工具作者自己的 README，
以及本站的实测记录。如果你发现某条结论其实早有更好的公开出处，欢迎在
[本站仓库](https://github.com/CCB-Team/CCB-Team.github.io) 提 Issue 或 PR 补上。

## 相关

- [总览](/ue5-bp/)
- [01 · 蓝图资产里存了什么](/ue5-bp/01-anatomy) · [02 · Kismet 字节码](/ue5-bp/02-bytecode) ·
  [03 · 反编译](/ue5-bp/03-decompile) · [04 · 工具全景](/ue5-bp/04-tooling) ·
  [05 · 罕见之处](/ue5-bp/05-pitfalls) · [06 · 上手路径](/ue5-bp/06-practice)
