---
title: 术语表
---

# 术语表

本站与各仓库里反复出现的词，按「在哪一层」分组。定义写得短，够看懂上下文就行；
真正的细节都在对应专题里。

## UE 运行时与对象模型

| 词 | 含义 |
|---|---|
| `UObject` | UE 里所有反射对象的基类。`UClass` / `UFunction` / `UProperty` 自己也是 `UObject` |
| `UClass` | 类的元数据对象，含父类、属性表、函数表 |
| CDO（Class Default Object） | 每个 `UClass` 在启动时创建的默认实例；蓝图里改「类默认值」改的就是它的字段 |
| `UFunction` | 函数的元数据对象，带参数与返回值描述；蓝图函数、原生函数都走它 |
| `FProperty` / `FField` | 属性系统。UE4 是 `UProperty`，UE5 的 `FField` 体系换了布局但语义相近 |
| `FName` | 全局字符串池里的索引；`FName` 可能带编号（如 `Text_1`），带编号时序列化为 8 字节 |
| `FString` | 长度前缀的字符串，**长度包含结尾的 `\0`**——写二进制时最容易忘的一条 |
| `FPackageIndex` | 包内引用，有符号整数、1 基：正数指向 Export，负数指向 Import |
| Cooked | 打包后（序列化后）的资产，没有编辑器信息；`.uasset`（头）+ `.uexp`（数据）+ `.ubulk`（大块数据） |
| Unversioned | 关闭了版本号的资产，属性布局必须靠外部映射文件（usmap / jmap）才能解析 |

## 定位与调用（逆向侧）

| 词 | 含义 |
|---|---|
| `GObjects` / `GUObjectArray` | 全局对象数组：遍历它就能枚举进程里所有 `UObject` |
| `GNames` / 名字池 | 全局 `FName` 池，`FName` 的比较与解码都靠它 |
| `GWorld` | 当前世界的指针，拿引擎状态通常从它开始 |
| `ProcessEvent` | `UObject` 上调用 `UFunction` 的统一入口；hook 它就能观察/拦截蓝图与原生函数调用 |
| `GNatives` | 解释器里每个 `EX_*` 操作码对应的处理函数表；找解释器循环时常常顺带找到它 |
| AOB / 特征码 | 用一段机器码字节模式定位函数，避免写死偏移 |
| 锚点路径 | 从「稳定入口」到「目标地址」的定位路线（如 字符串 → 引用它的函数 → 结构体字段） |

## 蓝图与 Kismet

| 词 | 含义 |
|---|---|
| Kismet | UE 蓝图的字节码与其虚拟机；资产里存成 `KismetExpression[]` |
| Ubergraph | 一张蓝图的事件图编译成**一个大函数** `ExecuteUbergraph_<Class>`；事件函数只是存根 |
| `ScriptBytecode` | `UStruct` 上存字节码的字段，`EX_*` 表达式数组 |
| `EX_*` | 操作码，如 `EX_Let`、`EX_Context`、`EX_JumpIfNot`、`EX_ComputedJump` |
| 执行流栈 | 蓝图跳转用的栈：`EX_PushExecutionFlow` 压目标地址，`EX_PopExecutionFlow` 跳过去，`EX_PopExecutionFlowIfNot` 条件跳 |
| 跳转操作数 | 是**字节偏移**，不是表达式下标；改字节码长度时必须重排 |
| `KismetPropertyPointer` | 指向属性的解析结果；UE5.6 必须用 `New`（`FFieldPath`）形态 |
| 结构还原（反编译） | 从字节码恢复 `if` / `while` / `switch` 等结构；做不到的地方才落 `goto` |
| 直译 | 不做结构还原，直接把字节码逐条翻成目标语言（KardsSim 走这条路） |

## 资产容器与格式

| 词 | 含义 |
|---|---|
| `.pak` | UE 的归档容器：条目 + 索引 + footer。v3（magic `0x5A6F12E1`）是常见旧变体 |
| 内嵌 `FPakEntry` | 每个条目前面还有一份条目头（v3 里是 53 字节），**数据在 `offset + 53`** |
| Mount point | pak 的挂载前缀，如 `../../../Game/Content/`；决定 pak 里路径怎么映射回资产路径 |
| IoStore | UE4.25+ 的 `.utoc` / `.ucas` 容器，和 pak 不是一回事；本站的库都不支持 |
| `AssetRegistry.bin` | 资产注册表：列出所有资产的路径、类、tags 与包数据，是「市场/背包里有什么」的数据源 |
| `FAssetData` | 注册表里的一条资产记录（对象路径、类、tags、chunk id、package flags） |
| Name batch | 注册表开头的名字表，带 CityHash64 哈希，必须与 UE 逐位一致才读得进去 |
| `FStore` | 注册表里存 tag 名/值/键值对的段，用 `BeginMagic(0x12345679)` / `EndMagic(0x87654321)` 包住 |
| `.locres` | 本地化资源：命名空间 + key + 文本；v2/v3 对 key 预哈希以加速查找 |
| usmap | 外部映射文件，描述 unversioned 资产的类型布局 |
| jmap | 运行期对象转储（JSON）；[solstice-jmap](/projects/solstice-jmap) 把它与注册表合成对象表与签名表 |

## 工程与验证

| 词 | 含义 |
|---|---|
| 语义级回写 | 重建容器结构后写回：读回来字段全对，但字节与原文件不同 |
| 逐字节一致 | 未修改的内容写回后与原文件完全相同；对「只读一下再保存」的工具这是硬要求 |
| 读回验证 | 写完之后再读一遍（甚至再反编译一遍），确认没把文件写坏 |
| NativeAOT | .NET 的提前编译，产出不依赖运行时的原生可执行文件；代价是不能用运行时反射 |
| 源生成（source generator） | 编译期生成序列化代码，替代反射；AOT 的前提条件 |
| 冷路径 / 热路径 | 一次性操作（建索引、出包）与每帧操作（hook、解释器）的区别，决定能不能容忍慢 |

## 容易混的几个

- **usmap ≠ jmap。** usmap 是类型布局映射，离线可得；jmap 是运行期对象转储，需要跑起来才能拿到。
- **`exact byte-for-byte` ≠ `语义等价`。** 前者防「写坏文件」，后者防「写对文件但改错逻辑」。
- **cooked ≠ encrypted。** cooked 只是序列化，加密是另一层（pak AES、索引加密），两者常同时出现。
- **`UAssetRegistry` 与 `solstice-assetregistry` 不是重复造轮子。** 前者是通用库、语义级回写；
  后者在上游基础上打了两个 v21 的补丁并加上「末尾追加」，路线是先保全字节、再改语义。

::: tip 想补词条
缺什么词、哪个定义不准，直接在[本站仓库](https://github.com/CCB-TEAM/CCB-Team.github.io)提 Issue。
:::
