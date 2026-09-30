---
title: 07 · 反射对象的字段级定义
---

# 07 · 反射对象的字段级定义

这一章把「资产文件里的字段」和「引擎源码里的字段」逐一对上，并标出**哪些字段根本不在文件里**。
这是整块蓝图逆向里最实用的一张对照表。

## 三层映射

同一个东西，在三个层面有三个名字：

| 层面 | 例子 | 谁在用 |
|---|---|---|
| **资产文件** | `StructExport` / `FunctionExport` / `FieldExport` | UAssetAPI、CUE4Parse 的解析模型 |
| **引擎反射对象** | `UStruct` / `UFunction` / `UProperty` | 引擎源码里的类 |
| **运行时内存** | `Link()` 之后补齐偏移的对象 | 内存里的游戏进程 |

**关键认知：这三层的字段集合不一样。** 下面逐层拆。

## FPackageIndex：资产里的引用方式

几乎每个「引用别的对象」的地方都是 `FPackageIndex`。它的定义原文（注释照抄）：

```cpp
/**
 * Wrapper for index into a ULnker's ImportMap or ExportMap.
 * Values greater than zero indicate that this is an index into the ExportMap.  The
 * actual array index will be (FPackageIndex - 1).
 *
 * Values less than zero indicate that this is an index into the ImportMap. The actual
 * array index will be (-FPackageIndex - 1)
 */
```

（出自 [UE4 公开源码 `ObjectResource.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/ObjectResource.h)）

| 值 | 含义 | 数组下标 |
|---|---|---|
| `> 0` | 指向 **ExportMap**（本包内定义的对象） | `值 - 1` |
| `< 0` | 指向 **ImportMap**（外部引用：别的包的类、函数、属性） | `-值 - 1` |
| `0` | null | — |

::: tip 为什么要先讲这个
因为「这个蓝图调用了哪个函数」这类问题的答案，在文件里就是一个 `FPackageIndex`：

- 指向 **Export** → 目标在本资产内（比如同一个蓝图里的另一个函数）；
- 指向 **Import** → 目标在别的地方（引擎函数、别的蓝图、别的包）。

**同一个「函数调用」，因为目标位置不同，在文件里的表示方式就不同**——这是读字节码时必须先建立的概念。
:::

## UStruct：字段与「链表 vs 数组」

引擎源码里的 `UStruct` 关键成员：

```cpp
private:
    UStruct* SuperStruct;
public:
    UField* Children;
    int32 PropertiesSize;
    int32 MinAlignment;

    TArray<uint8> Script;        // ← 字节码本体

    void LinkChild(UField* Child)
    {
        Child->Next = Children;
        Children = Child;
    }
```

（出自 [UE4 公开源码 `Class.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h)）

两个要点：

1. **`Script` 就是字节码。** 它是 `TArray<uint8>`——一串裸字节。反编译器要做的事，就是把这串字节解析成
   `KismetExpression[]`（见[第 02 章](/ue5-bp/02-bytecode)）。
2. **`Children` 在内存里是链表**（`LinkChild` 是头插法：新子节点插到表头）。
   而资产文件里它是**数组**（`StructExport.Children` 是 `FPackageIndex[]`）。
   这个「内存链表 ↔ 文件数组」的转换，正是 `FFrameworkObjectVersion.RemoveUField_Next`
   这个版本门在管的事——老版本文件里只存一个 `firstChild`，靠 `Next` 链走下去。

## UFunction：哪些字段在文件里

完整字段表（出自 `Class.h`，注释为原文分组）：

| 字段 | 类型 | 在文件里？ | 用途 |
|---|---|---|---|
| `FunctionFlags` | `uint32` | ✅ 持久 | 函数性质（是否网络函数、是否蓝图可调用……） |
| `RepOffset` | `uint16` | ✅ 持久 | 网络复制相关 |
| `NumParms` | `uint8` | ❌ 内存 | 参数个数 |
| `ParmsSize` | `uint16` | ❌ 内存 | **参数缓冲区大小** |
| `ReturnValueOffset` | `uint16` | ❌ 内存 | 返回值在缓冲区中的偏移 |
| `RPCId` / `RPCResponseId` | `uint16` | ❌ 内存 | RPC 编号 |
| `FirstPropertyToInit` | `UProperty*` | ❌ 内存 | 第一个含默认值的局部结构属性 |
| `EventGraphFunction` | `UFunction*` | 条件 | 事件图对应的函数（仅 `UE_BLUEPRINT_EVENTGRAPH_FASTCALLS` 构建） |
| `EventGraphCallOffset` | `int32` | 条件 | 事件图内的状态偏移（同上） |
| `Func` | `Native`（函数指针） | ❌ 内存 | 原生实现入口，蓝图函数为空 |

（出自 [UE4 公开源码 `Class.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h)；
「在文件里？」一列依据的是源码里 `// Persistent variables.` 与 `// Variables in memory only.` 的分组注释）

::: warning 这张表最该记住的是「❌」那一列
`ParmsSize`、`ReturnValueOffset`、`NumParms` **都不在资产文件里**。它们是引擎加载时算出来的。

所以「这个函数要传多大的参数缓冲区」这个问题，**在静态文件里没有直接答案**——
必须从 `LoadedProperties` 重建，详见[第 10 章](/ue5-bp/10-loaded-properties)。
:::

## UProperty：偏移不在文件里

`UProperty` 同样分两组（见[第 08 章](/ue5-bp/08-property-system)的完整代码）：

| 字段 | 在文件里？ | 说明 |
|---|---|---|
| `ArrayDim` | ✅ | 数组维度 |
| `PropertyFlags` | ✅ | 64 位标志（判定参数 / in-out 靠它） |
| `RepIndex` / `RepNotifyFunc` | ✅ | 网络复制 |
| `ElementSize` | ❌ | **`Link()` 时生成** |
| `Offset_Internal` | ❌ | **`Link()` 时生成**——属性在对象内存里的偏移 |
| `PropertyLinkNext` / `NextRef` / `DestructorLinkNext` / `PostConstructLinkNext` | ❌ | 内存链表，仅运行时 |

**这一条解释了运行时逆向里那个看似奇怪的做法**：为什么要用 Dumper-7 的 `FindUObjectNameOffset()`
这类函数去「探测」偏移？因为**偏移在静态文件里根本不存在**，只能等引擎 `Link()` 之后去内存里找。

（运行时侧的对应内容见 [运行时逆向 · 对象模型](/ue5-re/01-object-model)）

## UClass：多出来的是类级信息

`UClass` 是 `UStruct` 的子类，并且 `DECLARE_WITHIN(UPackage)`：

```cpp
class COREUOBJECT_API UClass : public UStruct
{
    DECLARE_CASTED_CLASS_INTRINSIC_NO_CTOR(UClass, UStruct, 0, TEXT("/Script/CoreUObject"), CASTCLASS_UClass, NO_API)
    DECLARE_WITHIN(UPackage)

    typedef void (*ClassConstructorType)(const FObjectInitializer&);
    typedef UClass* (*StaticClassFunctionType)();
    // ...
```

（出自 [UE4 公开源码 `Class.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h)）

它在 `UStruct` 的基础上加了**类级别的东西**：构造函数的调用入口、静态类函数指针、类标志、CDO（类默认对象）等。
对反编译来说，`UClass` 的意义是「`UFunction` 的宿主」——你要先找到类，才能顺着 `Children` 找到它的函数。

## StructExport：文件侧字段一览

UAssetAPI 的 `StructExport` 就是 `UStruct` 在文件里的样子（出自
[`StructExport.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/ExportTypes/StructExport.cs)）：

| 文件字段 | 对应引擎侧 | 备注 |
|---|---|---|
| `SuperStruct`（`FPackageIndex`） | `UStruct::SuperStruct` | 父结构，可为 null |
| `Children`（`FPackageIndex[]`） | `UStruct::Children`（链表） | **链表 → 数组**，门是 `FFrameworkObjectVersion.RemoveUField_Next` |
| `LoadedProperties`（`FProperty[]`） | 无直接对应（运行时由 `Link()` 消费） | 门是 `FCoreObjectVersion.FProperties` |
| `ScriptBytecode`（`KismetExpression[]`） | `UStruct::Script`（`TArray<uint8>`） | 解析产物 |
| `ScriptBytecodeSize` / `ScriptBytecodeRaw` | 同上 | **解析失败时的兜底** |

另外 `StructExport` 的类注释是「Base export for all UObject types that contain fields」——
`FunctionExport`、`ClassExport` 都继承它，所以**函数也走同一套读取逻辑**。

## 一张总表：文件里有什么，没什么

| 你想要的 | 静态文件里有吗 | 从哪拿 |
|---|---|---|
| 类名 / 函数名 / 属性名 | ✅ | `FPackageIndex` → Import/Export → `FName` → 名称池 |
| 函数有哪些参数、类型、in/out | ✅ | `LoadedProperties` + `PropertyFlags` |
| 函数体逻辑 | ✅ | `ScriptBytecode` |
| 父类、子类 | ✅ | `SuperStruct` / `Children` |
| **参数缓冲区大小** | ❌ | 运行时算（`ParmsSize`），或从 `LoadedProperties` 重建 |
| **属性在对象里的偏移** | ❌ | 运行时 `Link()` 之后才有 |
| **属性的元数据（显示名等）** | ⚠️ | cooked 包里被剥掉 |
| **原始节点图** | ❌ | 编译期就没了，只能反推 |

（依据：上文的字段分组、`FField` 的 metadata 读取条件、以及[第 01 章](/ue5-bp/01-anatomy)的编译期展开说明）

## 相关

- [08 · 属性系统：FField 与 FProperty](/ue5-bp/08-property-system)
- [09 · FKismetPropertyPointer](/ue5-bp/09-property-pointer)
- [10 · LoadedProperties 与签名还原](/ue5-bp/10-loaded-properties)
- [附录 · 出处清单](/ue5-bp/appendix/sources)
