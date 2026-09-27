---
title: 01 · 对象模型
---

# 01 · 对象模型

不先搞清 UE 的对象模型，后面所有「找偏移」的动作都会变成背数字。这一章只讲三件事：**一个 `UObject` 里有什么**、
**类型之间怎么套**、**UE5 相比 UE4 变了什么**。

## 一个 UObject 里有什么

UE 把所有可反射的东西都建成 `UObject` 的派生类。它的基类 `UObjectBase` 里挂着这几个关键字段：

```cpp
friend class FUObjectArray; // for access to InternalIndex without revealing it to anyone else

// ...
ClassPrivate    // 这个对象是哪个类的实例
NamePrivate     // 这个对象的名字（FName，不是字符串）
OuterPrivate    // 它属于谁（层级关系的上一层）
InternalIndex   // 它在对象数组里的下标
ObjectFlags     // 对象标志位
```

（字段与那句 `friend` 注释出自 Epic 公开的 UE4 源码
[`UObjectBase.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectBase.h)）

逐个说清楚用途，这张表是后面几章的地基：

| 字段 | 类型 | 用途 |
|---|---|---|
| `ClassPrivate` | `UClass*` | 「这是什么」——按类名筛选对象靠它 |
| `NamePrivate` | `FName` | 「它叫什么」——注意是**索引**，要配名称池才能解出字符串（[第 03 章](/ue5-re/03-gnames)） |
| `OuterPrivate` | `UObject*` | 层级：`UWorld` 里的 `ULevel`、`ULevel` 里的 `AActor`，靠它串起来 |
| `InternalIndex` | `int32` | 它在 `GUObjectArray` 里的下标。**源码特意用 `friend` 保护它**，说明这个下标与对象数组的对应关系是引擎的内部约定 |
| `ObjectFlags` | `EObjectFlags` | `RF_*` 标志位（是否待销毁、是否公共等） |

::: tip 那句 `friend class FUObjectArray` 值得多看一眼
它写在 `UObjectBase` 里，注释是「为了访问 `InternalIndex` 而不把它暴露给别人」。这直接告诉你两件事：
1. `InternalIndex` 就是对象在 `FUObjectArray` 中的位置，**遍历数组拿到的顺序与它一致**；
2. 这个字段是内部实现细节，**不同版本的位置不保证**——所以要靠[第 02 章](/ue5-re/02-gobjects)那套探测方法，而不是背偏移。
:::

### 字段顺序不保证

`UObjectBase` 有这些字段，但**它们在内存里的排列顺序、以及每个字段的偏移，是要在运行时探测的**。证据是
Dumper-7 找 `UObject::Flags` 偏移的方式——它不是查表，而是统计：

```cpp
constexpr auto EnumFlagValueToSearch = 0x43;
constexpr auto MinNumFlagValuesRequiredAtOffset = 0xA0;
// 在前 0x20 个对象的 0x40 字节范围内找 0x43，
// 再统计前 0x100 个对象里有多少个在该偏移处也是 0x43，超过 0xA0 就认定是 Flags
```

（出自 [`OffsetFinder.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp)）

同一个文件里还有 `FindUObjectIndexOffset()`、`FindUObjectNameOffset()` 等等。**一个工具需要为每个字段写一个探测函数，
这件事本身就说明「偏移是变化的」。**

### vtable 在对象头部

`UObject` 有一批虚函数——最典型的就是 [`ProcessEvent`](/ue5-re/05-process-event)。所以对象头部会有一个 vtable 指针，
调用虚函数靠「vtable 基址 + 槽位索引」。

::: warning 关于具体偏移
本专题**不给**「`ClassPrivate` 在 0x??」这类数字。理由见上：它随 UE 版本和游戏变化，任何写死的数字都会在下一个
目标上失效。请用工具探测，或用两个独立证据交叉确认。
:::

## 类型体系：谁套着谁

UE 的反射类型是分层的，逆向时最常打交道的几个：

```
UObject
├── UField
│   └── UStruct
│       ├── UClass          // 类：描述「有哪些属性和函数」
│       ├── UFunction       // 函数：描述参数、返回值、调用约定
│       └── UScriptStruct   // 结构体
└── AActor                  // 场景里的实体（是 UObject，不是 UStruct）
```

配套的两套「描述信息」：

| 描述什么 | UE4 | UE5 |
|---|---|---|
| **属性**（字段） | `UProperty` 体系（是 `UObject`） | `FField` / `FProperty` 体系（**不是** `UObject`） |
| **类型** | `UClass` | `UClass` |
| **函数** | `UFunction` | `UFunction` |

（`FField` / `FFieldClass` 的存在与结构，见 Dumper-7 的
[`Offsets.h`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Public/OffsetFinder/Offsets.h)：
它把 `FField` 和 `FFieldClass` 各自作为独立命名空间，前者有 `Vft`（自己的 vtable），后者有 `Name`——
说明它们是一套**独立于 `UObject` 的类型层次**）

这个变化很实际：在 UE4 里你可以在对象数组里找到 `UProperty`；在 UE5 里属性变成了 `FField`，**不在对象数组里**，
要从 `UClass` / `UStruct` 顺着 `ChildProperties` / `Children` 链去走。写工具时这是两套完全不同的代码路径。

## 反射是怎么来的

UE 用 `UCLASS` / `UFUNCTION` / `UPROPERTY` / `USTRUCT` 这些宏标注 C++ 代码，由 **UHT（Unreal Header Tool）**
在编译期生成反射元数据。所以**打包后的游戏里带着完整的类型信息**——这是 UE 逆向比逆向自研引擎轻松得多的根本原因。

一个能说明这套元数据有多完整的旁证：UE4SS 的 **UHT Dumper** 可以「生成与 Unreal Header Tool 兼容的 C++ 头文件，
用来给游戏建一个镜像 `.uproject`」，而它的配置项里有一条 `MakeAllFunctionsBlueprintCallable`
（默认 `1`，作用是「强制所有 `UFUNCTION` 宏都带上 `BlueprintCallable`」）。

（出自 [UE4SS · dumpers 文档](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/docs/feature-overview/dumpers.md)）

能反过来重建头文件，说明反射数据里**函数、参数、属性、继承关系都在**。所以：

- **能用反射解决的，不要用内存扫描。** 找类、找函数、读属性名，走对象数组 + 名称池；
- 内存扫描留给**反射覆盖不到的东西**：全局变量（`GWorld`）、非反射的运行时状态、引擎内部函数。

## 与前面几章的关系

```
         ┌──────────────────── 你想要的 ────────────────────┐
         │                                                  │
   [02 GObjects]  ──遍历──▶  UObject 实例 ──ClassPrivate──▶ UClass
         │                        │                          │
         │                        │                    GetName()
         │                        ▼                          │
   [03 GNames]  ◀──NamePrivate── FName ──索引──▶ 名称池 ◀────┘
         │
         ├──枚举出 UWorld ────────────────────────▶ [04 GWorld]
         │
         └──枚举出 UFunction ──ProcessEvent──────▶ [05 ProcessEvent]
```

## 常见坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 把 `NamePrivate` 当字符串读 | 读出一堆乱码或极小的整数 | 它是 `FName` 索引，必须配名称池 |
| 在 UE5 里找 `UProperty` 对象 | 对象数组里找不到 | 属性体系已改成 `FField`，要从 `UClass` 往下走 |
| 假设字段顺序固定 | 换个游戏全错位 | 用探测/交叉验证，别背偏移 |
| 忽略 `OuterPrivate` | 找得到对象、串不起层级 | 层级关系（World→Level→Actor）靠它 |
| 忘了 `ObjectFlags` | 读到已标记销毁的对象，随机崩 | 取到对象先查标志位（经验做法，无一手出处） |

（前四行的依据为上述源码字段；最后一行为经验做法。）

## 相关

- [02 · 定位 GObjects](/ue5-re/02-gobjects) —— 这些对象都住在哪个数组里
- [03 · 定位 GNames](/ue5-re/03-gnames) —— `NamePrivate` 怎么解成字符串
- [05 · ProcessEvent](/ue5-re/05-process-event) —— `UFunction` 怎么用
- [附录 · 出处清单](/ue5-re/appendix/sources)
