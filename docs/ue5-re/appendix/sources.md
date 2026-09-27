---
title: 附录 · 出处清单
---

# 附录 · 出处清单

本专题所有结论的来源。**正文里凡是给出一手来源的地方，都能在这张表里找到对应条目**；凡是标注为「经验做法」的，
说明我们没有找到可引用的一手出处，请当作线索而非事实。

## 来源分级

| 级别 | 含义 | 本专题的用法 |
|---|---|---|
| **A · 引擎源码** | Epic 官方源码（含需要关联 Epic 账号的私有仓库，以及公开镜像） | 结构定义的最终依据 |
| **B · 开源项目文档/源码** | 工具与库的作者自己写的文档与代码 | 实现事实的依据（「某个工具确实这么做」） |
| **C · 工具官方文档** | 工具自己的手册 | 工具能力与用法 |
| **D · 经验做法** | 无一手出处 | 明确标注，仅供参考 |

## A · 引擎源码

| # | 来源 | 支撑内容 |
|---|---|---|
| A1 | [`UObjectArray.h`（EpicGames/UnrealTournament 公开镜像）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectArray.h) | `FUObjectItem` 的字段构成（`Object` / `Flags` / `ClusterIndex` / `SerialNumber`） |
| A2 | [`NameTypes.h`（同上）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Core/Public/UObject/NameTypes.h) | `FName` 的三个字段：`ComparisonIndex` / `DisplayIndex` / `Number`，以及 `Number` 内部存「实际值 + 1」的原因 |
| A3 | [`UObjectBase.h`（同上）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectBase.h) | `UObjectBase` 持有 `ClassPrivate` / `NamePrivate` / `OuterPrivate` / `InternalIndex` / `ObjectFlags`；且 `FUObjectArray` 是它的 friend（说明 `InternalIndex` 与对象数组的对应关系） |
| A4 | [`Class.h`（同上）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h) | `UFunction` 的持久字段：`FunctionFlags` / `RepOffset` / `ParmsSize` / `ReturnValueOffset` / `EventGraphFunction` |
| A5 | [`World.h`（同上）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/World.h) | `UWorld` 的 `PersistentLevel`、`Levels`（`TSet<ULevel*>`）、`NetDriver`，以及 `GetPersistentLevel()` / `GetLevels()` 访问器 |
| A6 | [`Level.h`（同上）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/Level.h) | `ULevel::Actors`：`TArray<AActor*>`，注释说明它「被 `FActorIteratorBase` 及其派生类使用」 |
| A7 | [`GameInstance.h`（同上）](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/GameInstance.h) | `UGameInstance` 与 `LocalPlayers` 的关系 |
| A8 | [`LocalPlayer.h` / `PlayerController.h`（同上）](https://github.com/EpicGames/UnrealTournament/tree/master/Engine/Source/Runtime/Engine/Classes) | `ULocalPlayer` → `PlayerController` → `Pawn` 这一段的字段依据 |
| A9 | Epic 官方引擎仓库中的 [`Object.h`](https://github.com/search?q=repo%3AEpicGames%2FUnrealEngine+ProcessEvent+filename%3AObject.h&type=code) / [`UnrealEngine.h`](https://github.com/search?q=repo%3AEpicGames%2FUnrealEngine+GWorld+path%3AEngine%2FSource%2FRuntime%2FEngine%2FPublic&type=code) / [`NameTypes.h`](https://github.com/search?q=repo%3AEpicGames%2FUnrealEngine+FNamePool+filename%3ANameTypes.h&type=code) / [`UObjectArray.h`](https://github.com/search?q=repo%3AEpicGames%2FUnrealEngine+FUObjectItem+filename%3AUObjectArray.h&type=code) | 在 UE5 侧的符号落点：`ProcessEvent`、`GWorld`、`FNamePool`、`FUObjectItem`（该仓库需关联 Epic 账号才能浏览，故这里给出的是代码搜索链接） |

::: warning 关于 A 级的版本差异
`EpicGames/UnrealTournament` 是**公开可读的 UE4 源码镜像**，对应较早的 UE4 版本，因此字段名可能与新版不同
（例如 `FName` 的索引字段在新版是 `FNameEntryId` 类型）。用它来理解**结构与关系**是可靠的，但**不要**把其中的具体
偏移或字段顺序套到 UE5 游戏上。
:::

## B · 开源项目文档与源码

| # | 来源 | 支撑内容 |
|---|---|---|
| B1 | [UE4SS 文档首页](https://docs.ue4ss.com/) | 功能清单（Lua API / C++ Mod API / Live View / 各类 dumper）、支持版本 **4.7–5.8**、「不是即插即用方案，你可能需要自己更新 AOB」、Credits 中「UFunction hook method」的演进 |
| B2 | [UE4SS · Fixing missing AOBs](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html) | AOB 的字节/通配写法、六步制作流程、六个签名的语义要求、`Register` / `OnMatchFound` / `DerefToInt32`、SwissArmyKnife |
| B3 | [UE4SS 安装指南](https://docs.ue4ss.com/installation-guide.html) | 代理 DLL（默认 `dwmapi.dll`）、root / working directory 的区别、三种安装方式 |
| B4 | [UE4SS · dumpers 文档](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/docs/feature-overview/dumpers.md) | C++ Header Generator（生成**带偏移**的头文件）、UHT Dumper、usmap Dumper、UMAP Recreation Dumper |
| B5 | [UE4SS 各游戏签名目录](https://github.com/UE4SS-RE/RE-UE4SS/tree/main/assets/CustomGameConfigs) | 多版本签名库的组织形态；不同游戏需要补的签名不同 |
| B6 | [`Avowed/UE4SS_Signatures/GUObjectArray.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Avowed/UE4SS_Signatures/GUObjectArray.lua) | 真实 AOB 实例：`lea rcx, [rip+disp]` 的 RIP 相对解析 |
| B7 | [`Final Fantasy 7 Rebirth/.../GUObjectArray.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Final%20Fantasy%207%20Rebirth/UE4SS_Signatures/GUObjectArray.lua) | 真实 AOB 实例：先算下一条指令、再解一次偏移 |
| B8 | [`DeadAsDisco/.../FName_Constructor.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/DeadAsDisco/UE4SS_Signatures/FName_Constructor.lua) | 真实 AOB 实例：直接命中、无需解引用 |
| B9 | [`Far Far West/.../GNatives.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Far%20Far%20West/UE4SS_Signatures/GNatives.lua) | 真实 AOB 实例：带完整注释的 RIP 推导（UE 5.8） |
| B10 | [Dumper-7 README](https://github.com/Encryqed/Dumper-7) | 用法、`ObjectArray::Init` / `InitObjectArrayDecryption` / `FName::Init` / `Off::InSDK::InitPE` 四个覆盖入口、默认布局表、`Dumper-7.ini` 配置项 |
| B11 | [`Dumper/Engine/Private/Unreal/ObjectArray.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/Unreal/ObjectArray.cpp) | 多套分块数组布局（UE5.8 dev / Back4Blood / Multiversus 字段顺序被改）——「不能写死偏移」的硬证据 |
| B12 | [`Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp) | 不靠特征码的统计启发式（`0x43` flags、`0xA0` 阈值、前 `0x100` 个对象）；`CmpIdx > 0x10 && < 0xF0000000` 的范围校验；`UObject::Name` 与 `UObject::Class` 不同偏移的互斥约束 |
| B13 | [`Dumper/Engine/Public/OffsetFinder/Offsets.h`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Public/OffsetFinder/Offsets.h) | `FName::bIsUsingAppendStringOverToString` / `FNameSize` / `FNamePoolBlockOffsetBits` / `FNameEntryStride`；`FName::NameArray` 与 `FName::NamePool` 两套命名空间；`FField::Vft` / `FFieldClass::Name`；case preserving 与 outline number 导致的结构修正 |
| B14 | [CUE4Parse README](https://github.com/FabianFG/CUE4Parse) | 资产/包解析库的定位与示例（`LoadAllObjects`） |
| B15 | [UAssetAPI](https://github.com/atenfyr/UAssetAPI) | 低层 .NET 资产读写库 |
| B16 | [UnrealMappingsDumper](https://github.com/TheNaeem/UnrealMappingsDumper) / [Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive) | `.usmap` 的生成工具与社区归档 |
| B17 | [kismet-analyzer](https://github.com/trumank/kismet-analyzer) | 蓝图 / Kismet 字节码逆向工具 |
| B18 | [UE5Dumper](https://github.com/Jiang-Night/UE5Dumper) | UE5 SDK dump 的同类实现 |
| B19 | [Unreal-Finder-Tool README](https://github.com/corrm/Unreal-Finder-Tool) | 「找 GNames / 找 GObjects / 实例日志 / 生成 C++ SDK」的功能划分；项目已废弃并转向 CheatGear |

## C · 工具官方文档

| # | 来源 | 支撑内容 |
|---|---|---|
| C1 | [x64dbg 文档](https://help.x64dbg.com/en/latest/) | 读内存、断点、表达式与命令体系（UE4SS 流程中的第 2、5 步） |
| C2 | [Ghidra](https://github.com/NationalSecurityAgency/ghidra) | 静态逆向框架 |
| C3 | [MinHook](https://github.com/TsudaKageyu/minhook) | Windows x86/x64 inline hook 库 |
| C4 | [frida](https://github.com/frida/frida) | 动态插桩框架 |

## 数据来源

- 仓库星标数、许可、描述：GitHub REST API（`repos/{owner}/{repo}`、`search/repositories`），**2026-09 实测**；
- 各源码文件的字段与注释：通过 GitHub API 读取对应文件原文（非二手转述）。

## 关于未收录的社区来源

本专题**刻意没有引用**若干常见的社区来源，原因是它们在本次整理环境下不可访问（返回 403 / Cloudflare 拦截），
既然无法核对原文，就不列出处、不写内容：

| 来源 | 状态 |
|---|---|
| `guidedhacking.com` | 返回 403（Cloudflare 拦截） |
| `wiki.cheatengine.org` | 返回 403（Cloudflare 拦截） |
| `unknowncheats.me` | 未收录（同类社区论坛，未取得可核对内容） |
| 各类中文博客（知乎 / CSDN / 博客园等） | 未收录（本次未能检索到可核对的原文） |

::: tip 这意味着什么
上表里的来源在社区里流传很广，但**它们不是本专题的依据**。如果你要引用本专题的某条结论，请顺着正文里的链接
回到 A/B/C 级来源去核对；如果你发现某条结论其实早有更好的公开出处，欢迎在
[本站仓库](https://github.com/CCB-Team/CCB-Team.github.io) 提 Issue 或 PR 补上。
:::

## 相关

- [总览](/ue5-re/)
- [01 · 对象模型](/ue5-re/01-object-model) · [02 · GObjects](/ue5-re/02-gobjects) · [03 · GNames](/ue5-re/03-gnames) ·
  [04 · GWorld](/ue5-re/04-gworld) · [05 · ProcessEvent](/ue5-re/05-process-event) · [06 · AOB](/ue5-re/06-aob) ·
  [07 · 工具链](/ue5-re/07-toolchain)
