---
title: 07 · 工具链
---

# 07 · 工具链

手动逆向不等于「什么都自己写」。这一章把公开生态里的工具按用途摊开，说明各自解决什么问题、边界在哪。
**星标数与许可信息取自 GitHub API 实测（2026-09）**，会随时间变化。

## 一览

| 工具 | 用途 | 语言 | 许可 | Stars |
|---|---|---|---|---|
| [RE-UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) | 注入式 Lua 脚本系统、C++ Mod API、SDK 生成器、实时属性查看/编辑、蓝图 mod 加载 | C++ | MIT | 2.9k |
| [Dumper-7](https://github.com/Encryqed/Dumper-7) | UE4/UE5 全版本 SDK 生成器（运行时 dump） | C | 未标注 | 2.3k |
| [Unreal-Finder-Tool](https://github.com/corrm/Unreal-Finder-Tool) | 找 `GNames` / `GObjects`、实例日志、生成 C++ SDK。**已废弃**，作者转向 [CheatGear](https://github.com/CorrM/cg) | C++ | GPL-3.0 | 464 |
| [CUE4Parse](https://github.com/FabianFG/CUE4Parse) | 解析 UE4/UE5 的归档与包（`UObject`、`UTexture2D`、`UAnimSequence`、`UStaticMesh`…），FModel 的底层库 | C# | Apache-2.0 | 647 |
| [UAssetAPI](https://github.com/atenfyr/UAssetAPI) | 低层 .NET 资产读写库 | C# | MIT | 499 |
| [UnrealMappingsDumper](https://github.com/TheNaeem/UnrealMappingsDumper) | 生成 `.usmap` 映射文件（用于数据挖掘） | — | — | 435 |
| [Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive) | 社区维护的 `.usmap` 归档 | — | — | 354 |
| [kismet-analyzer](https://github.com/trumank/kismet-analyzer) | 蓝图 / Kismet 字节码的逆向与 mod 工具 | C# | MIT | 120 |
| [UE5Dumper](https://github.com/Jiang-Night/UE5Dumper) | UE5 SDK dump（中文社区的同类实现） | C++ | MIT | 98 |
| [Ghidra](https://github.com/NationalSecurityAgency/ghidra) | 静态逆向框架（NSA 开源） | Java | Apache-2.0 | 79.8k |
| [frida](https://github.com/frida/frida) | 动态插桩 / 运行时 hook | — | — | 22.1k |
| [MinHook](https://github.com/TsudaKageyu/minhook) | Windows x86/x64 最小化 API hook 库 | C | BSD-2 | 6.0k |

（数据来自 GitHub API `repos/{owner}/{repo}`，2026-09 实测）

::: warning 关于「驱动级读写」
部分工具（例如 Unreal-Finder-Tool）宣传过「内核读写进程内存」这类能力。本专题只把它作为**事实**列在表里，
不展开实现方式——这类技术直接落在反作弊对抗的范畴里，本文按开头声明的边界不涉及。
:::

## UE4SS：目前最完整的「手动 + 自动」混合方案

UE4SS 的定位是「UE4/5 游戏的注入式 Lua 脚本系统」，但它的能力远超脚本：

| 功能 | 说明 |
|---|---|
| [Lua Scripting API](https://docs.ue4ss.com/lua-api.html) | 基于 UE 对象系统写 Lua mod |
| [蓝图 mod 加载](https://docs.ue4ss.com/feature-overview/blueprint-modloader.html) | 不修改/替换游戏文件就能加载蓝图 mod |
| [C++ Modding API](https://docs.ue4ss.com/guides/creating-a-c%2B%2B-mod.html) | 用 C++ 写基于对象系统的 mod |
| [实时属性查看与编辑](https://docs.ue4ss.com/feature-overview/live-view.html) | 搜索、查看、编辑、监视任意已加载对象的属性——调 mod 或搞清「运行时值怎么变的」时最有用 |
| [UHT Dumper](https://docs.ue4ss.com/feature-overview/dumpers.html#unreal-header-tool-uht-dumper) | 生成 Unreal Header Tool 兼容的 C++ 头文件，用来给游戏建一个镜像 `.uproject` |
| [C++ Header Generator](https://docs.ue4ss.com/feature-overview/dumpers.html#c-header-generator) | 从反射类与蓝图生成**带偏移**的 C++ 头文件 |
| [usmap Dumper](https://docs.ue4ss.com/feature-overview/dumpers.html#usmap-dumper) | 生成 unversioned properties 所需的 `.usmap` |
| [UMAP Recreation Dumper](https://docs.ue4ss.com/feature-overview/dumpers.html#umap-recreation-dumper) | 把已加载的 actor dump 成文件，在编辑器里重建 `.umap` |
| [Universal UE Mods](https://docs.ue4ss.com/feature-overview/universal-mods.html) | 解锁控制台等通用 mod |

（功能清单出自 [UE4SS 文档首页](https://docs.ue4ss.com/)）

### 安装形态（对理解「它怎么进去的」有用）

UE4SS 用**代理 DLL** 的方式被游戏加载：默认基于 `C:\Windows\System32\dwmapi.dll` 生成一个同名代理
（CMake 里可用 `UE4SS_PROXY_PATH` 换掉）。安装时把文件丢进**游戏可执行文件所在目录**（例如
`...\FactoryGame\Binaries\Win64\`）即可自动注入；也可以删掉 `dwmapi.dll`、自己用注入器注入 `UE4SS.dll`。

它区分两个目录概念：

- **root directory**：放着 `UE4SS.dll` 的目录；
- **working directory**：放着配置与 `Mods/` 的目录，位于 root 内（也可以是 `<root>/<游戏名>`）。

（出自 [UE4SS 安装指南](https://docs.ue4ss.com/installation-guide.html)）

这个区分直接决定了[第 06 章](/ue5-re/06-aob)里自定义 AOB 该放在哪：`<working directory>/UE4SS_Signatures/`。

### 目标版本范围

UE4SS 文档明确写了「**Targeting UE Versions: From 4.7 To 5.8**」，并且反复强调它**不是**即插即用方案，
「你可能需要自己更新 AOB」。

（出自 [UE4SS 文档首页](https://docs.ue4ss.com/)）

## Dumper-7：一键 dump 的代表

用法极简：编译 x64-Release 的 dll → 注入目标游戏 → SDK 生成到 `Settings::SDKGenerationPath`（默认 `C:\Dumper-7`）。

真正值得学的是它的**可覆盖设计**——所有「自动找不准」的地方都留了手动入口：

```cpp
// GObjects：偏移 / 块大小 / 是否分块
ObjectArray::Init(/*GObjectsOffset*/, /*ChunkSize*/, /*bIsChunked*/);

// 对象数组解密
InitObjectArrayDecryption([](void* ObjPtr) -> uint8* { ... });

// FName：强制用 GNames，或覆盖偏移
FName::Init(/*bForceGNames*/);
FName::Init(/*OverrideOffset, OverrideType=[AppendString, ToString, GNames], bIsNamePool*/);

// ProcessEvent 的 vtable 索引
Off::InSDK::InitPE(/*PEIndex*/);
```

（出自 [Dumper-7 README](https://github.com/Encryqed/Dumper-7#overriding-offsets)）

配置也可以外置成 `Dumper-7.ini`（放在游戏 exe 同目录＝该游戏专用，放 `C:\Dumper-7`＝全局默认），
可配 `SleepTimeout`（延时 dump）、`DumpKey`（按键触发 dump）、`SDKGenerationPath`、`SDKNamespaceName`。

## 静态资产侧：为什么手动逆向也要懂它

运行时（内存）与静态资产（文件）是两条腿。找对象、调函数用前者；要看某个类到底有哪些属性、蓝图逻辑是什么，
往往回到后者更快：

- **CUE4Parse**：`provider.LoadAllObjects(PACKAGE_PATH)` 就能把一个包里的对象全读出来
  （[README 示例](https://github.com/FabianFG/CUE4Parse)）；
- **UAssetAPI**：更底层的读写，本站的 [UAssetRegistry](/projects/uassetregistry)、[ULocres](/projects/ulocres)、
  [KismetDecompiler](/projects/kismetdecompiler) 都建立在它之上；
- **`.usmap` 映射**：UE5 打包后属性不带类型信息，没有映射文件就解析不了 unversioned properties。所以生态里同时存在
  「生成 usmap 的工具」（[UnrealMappingsDumper](https://github.com/TheNaeem/UnrealMappingsDumper)、UE4SS 的 usmap dumper）
  和「usmap 归档」（[Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive)）。

## 动态分析工具

| 工具 | 角色 |
|---|---|
| [x64dbg](https://help.x64dbg.com/en/latest/) | 读内存、下断点、看反汇编。UE4SS 的 AOB 制作流程里第 2、5 步靠它 |
| [Ghidra](https://github.com/NationalSecurityAgency/ghidra) | 免费静态逆向框架，看 xref / 反编译 |
| IDA Pro / Binary Ninja | 商业静态逆向工具（未取得可抓取的官方文档页，故不给具体链接） |
| Cheat Engine | 内存搜索与指针扫描（其 wiki 在本环境下不可访问，故不给具体链接） |
| [MinHook](https://github.com/TsudaKageyu/minhook) / [frida](https://github.com/frida/frida) | 写 hook 时的两类选择：编译进 DLL 的 inline hook，或外部注入的插桩 |

## 一条可执行的路径

按依赖顺序排，每一步都能独立验证：

1. **打基础**：x64 汇编、PE 结构、调用约定、RIP 相对寻址。
2. **跑通现成工具**：用 Dumper-7 或 UE4SS 在一个游戏上把 SDK dump 出来，读生成的类与偏移。
3. **理解对象模型**：对着 dump 出来的结果看[第 01 章](/ue5-re/01-object-model)，确认 `UClass` / `UFunction` / `FProperty` 的关系。
4. **自己定位一个锚点**：挑 `GObjects`（收益最大），照[第 06 章](/ue5-re/06-aob)的流程写一条 AOB，并用遍历验证。
5. **用锚点找别的**：有了对象数组，`UWorld`、`UGameInstance`、`APlayerController` 都可以枚举出来，不必逐个扫特征码。
6. **再动 `ProcessEvent`**：这是从「读」跨到「调用」的一步，风险也最高（[第 05 章](/ue5-re/05-process-event)）。

## 与本站项目的关系

| 本站已有 | 与运行时逆向的关系 |
|---|---|
| [Prism](/projects/prism) | .pak 侧：浏览、预览、导出、替换纹理，合并 pak |
| [UAssetRegistry](/projects/uassetregistry) / [ULocres](/projects/ulocres) | 解析 `AssetRegistry.bin` 与 `.locres`，把「资产里有什么」问清楚 |
| [KismetDecompiler](/projects/kismetdecompiler) / [KismetReactor](/projects/kismetreactor) | 把蓝图字节码还原成可读伪代码——运行时 hook 之前，先用它搞清逻辑 |
| [B64XorDecryption](/projects/b64xordecryption) | 协议层的 XOR + Base64 编解码逆向（含 IDA 伪代码存档） |

## 相关

- [06 · AOB 特征码](/ue5-re/06-aob)
- [附录 · 出处清单](/ue5-re/appendix/sources)
