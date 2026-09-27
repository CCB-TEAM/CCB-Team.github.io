---
title: UE5 游戏手动逆向 · 总览
---

# UE5 游戏手动逆向

这个专题整理**公开资料**里关于「手动」逆向 Unreal Engine 4/5 游戏的方法：不依赖现成的一键 dumper，而是自己找到
`GObjects`、`GNames`、`GWorld`、`ProcessEvent` 这些锚点，再用它们去读写对象、调用函数。

素材来自可公开访问的一手来源——Epic 的引擎源码路径、UE4SS / Dumper-7 等开源项目的文档与源码、工具官方文档。
**正文逐条标注出处**，全部来源汇总在[附录 · 出处清单](/ue5-re/appendix/sources)。

::: warning 先读这段：适用边界
- 本专题面向**单机 mod、私服研究、自己项目的调试与安全研究**这类场景。
- **不涉及、也不讨论**任何反作弊（EAC / BattlEye / Vanguard 等）的绕过、检测规避或驱动级隐藏。相关话题在公开资料里存在，本文一律不展开。
- 在线多人游戏里注入、改内存通常违反 EULA 与 ToS，也可能触犯法律。动手前先确认你手上的授权与目标——**这属于你自己的判断，不是技术问题**。
- 各工具、各项目的许可与使用条款请以对应仓库为准。
:::

## 一句话结论

| 要找的东西 | 主要锚点 | 最容易踩的坑 |
|---|---|---|
| **GObjects** / `GUObjectArray` | 一个全局变量，指向分块对象数组；用 AOB 特征码扫，或按「对象头部常见 flags 值」做启发式探测 | 数组布局**逐游戏不同**：UE4.11–4.20 是定长数组，UE4.21+ 是分块数组，个别游戏（UE5.8 dev、Back4Blood、Multiversus）字段顺序又被改过 |
| **GNames** / `FNamePool` | `FName::ToString`、`FName::FName` 这两个函数，或直接定位名称池全局量 | UE4 用 `TNameEntryArray`、UE5 用 `FNamePool`，**两套结构完全不通用** |
| **GWorld** | 拿到 GObjects 后**直接遍历找 `UWorld` 实例**最稳；也可以从 `UWorld::Tick`、`GetWorldFromContextObject` 等调用点回溯 | 它是一个全局指针，Shipping 包里不一定留下好用的字符串锚点 |
| **ProcessEvent** | `UFunction` 在 `UObject` vtable 中的槽位；或从 `UFunction::Invoke` 反向找 | vtable 索引随版本和游戏变化，连 Dumper-7 都专门留了覆盖入口 |
| **AOB 特征码** | 用**同 UE 版本的空白工程 + PDB** 做对照，在 x64dbg 里提取字节 | 特征码里混进相对地址/立即数，游戏一重编译就失效 |

## 章节

| 章节 | 内容 |
|---|---|
| [01 · 对象模型](/ue5-re/01-object-model) | `UObject` / `UClass` / `UFunction` / `AActor` / `UWorld` 的关系，以及 UE4 → UE5 的关键变化 |
| [02 · 定位 GObjects](/ue5-re/02-gobjects) | `FUObjectArray` 与分块数组布局、逐游戏差异、对象数组加密、启发式定位 |
| [03 · 定位 GNames](/ue5-re/03-gnames) | `FName` / `FNameEntry` / `FNamePool`，以及 `FName::ToString` 的定位 |
| [04 · 定位 GWorld](/ue5-re/04-gworld) | `GWorld` 与几条常用对象链（World → Level → Actor、World → PlayerController → Pawn） |
| [05 · ProcessEvent](/ue5-re/05-process-event) | `UFunction` 结构、vtable 槽位、Hook 方式、反射调用 |
| [06 · AOB 特征码](/ue5-re/06-aob) | 特征码怎么写、RIP 相对地址怎么解、真实签名实例与多版本维护 |
| [07 · 工具链](/ue5-re/07-toolchain) | UE4SS / Dumper-7 / CUE4Parse / IDA / Ghidra / x64dbg 等，以及学习路径 |
| [附录 · 出处清单](/ue5-re/appendix/sources) | 全部来源、编号与它们各自支撑的结论 |

## 术语表

| 术语 | 含义 |
|---|---|
| **RVA / 模块基址** | 相对虚拟地址；运行时地址 = 模块基址 + RVA。模块基址每次启动都变（ASLR），所以特征码比绝对地址可靠 |
| **AOB**（Array of Bytes） | 一段字节序列模式，用通配符 `?`/`??` 屏蔽会变的字节，在内存或文件里搜索 |
| **RIP 相对寻址** | x64 上 `lea rax, [rip+disp]` 这类指令，目标地址 = 下一条指令地址 + 有符号 32 位 disp。找全局变量基本都要解这一步 |
| **vtable / VMT** | 虚函数表。`UObject` 头部第一个指针就是它，`ProcessEvent` 这类虚函数靠槽位索引调用 |
| **反射（Reflection）** | UE 把类型信息编译进包里（`UClass`/`UFunction`/`FProperty`），运行时能按名字查类型、查函数、读属性 |
| **usmap / unversioned properties** | UE5 打包后属性不带类型信息，需要 `.usmap` 映射文件才能正确解析资产 |

## 怎么用这个专题

三条建议，来自本专题整理过程中的实际取舍：

1. **先跑通现成工具，再谈手动。** 先用 [Dumper-7](https://github.com/Encryqed/Dumper-7) 或
   [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) 把 SDK dump 出来，确认你对对象模型的理解是对的，再去啃偏移。
2. **手动逆向的真正难点不是「找到」，而是「找对」。** 一个地址被扫出来不代表它是你要的那个——所有结论都要用第二个独立证据交叉验证（换一个锚点、看引用它的代码、用已知字符串反查）。
3. **把版本差异当成常态。** 游戏每次更新都可能让特征码失效，工具生态里「维护一份多版本签名库」是常态而不是例外
   （见 [UE4SS 的 `UE4SS_Signatures` 目录](https://github.com/UE4SS-RE/RE-UE4SS/tree/main/assets/CustomGameConfigs)）。

## 与本站其它内容的关系

本专题讲的是**运行时**（内存里的对象与全局量）；本站已有的内容更偏**静态资产**，两者互补：

| 方向 | 本站已有 |
|---|---|
| 静态资产 / 打包格式 | [Prism](/projects/prism)（.pak）、[UAssetRegistry](/projects/uassetregistry)、[ULocres](/projects/ulocres)、[AssetRegistryTool](/projects/assetregistrytool) |
| 蓝图字节码 | [KismetDecompiler](/projects/kismetdecompiler)、[KismetReactor](/projects/kismetreactor)、[Kismet 直译模拟器](/kismet-sim/) |
| 协议与私有实现 | [自己写私服](/private-server/) 系列、[B64XorDecryption](/projects/b64xordecryption) |

::: tip 关于出处的标注方式
正文里凡是给出一手来源的结论，都直接跟在括号里；凡是社区经验、或我们自己的推断而没有一手出处的，会明确写成
「经验做法（无一手出处）」。**请把后者当作线索，不要当作事实。**
:::
