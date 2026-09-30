---
title: 08 · 属性系统：FField 与 FProperty
---

# 08 · 属性系统：FField 与 FProperty

字节码里到处是「某个属性」的引用。搞不清属性系统，`EX_PropertyConst`、`EX_StructMemberContext`、
`EX_InstanceVariable` 这些操作码就只能靠猜。

::: tip 本章以 UE 5.8 为准
定义与字段全部取自 **CCB-TEAM 私有镜像的 Epic 官方 UE5 源码**（`release` 分支，`ENGINE 5.8.0`）：

| 文件 | 提供什么 |
|---|---|
| `CoreUObject/Public/UObject/Field.h` | `FFieldClass`、`FFieldVariant` |
| `CoreUObject/Public/UObject/UnrealType.h` | `FProperty` |
| `CoreUObject/Public/UObject/Class.h` | `UStruct` 的字段链、`UFunction` 的字段分组 |
| `CoreUObject/Public/UObject/ObjectMacros.h` | `EPropertyFlags`（`CPF_*`） |

UE4 的 `UProperty` 体系只在[最后一节](#背景ue4-的-uproperty已废弃)作为背景出现。
:::

## 六个名词，先给定义

| 名词 | 定义 | 出处 |
|---|---|---|
| **`FField`** | 反射数据的基类。**不是 `UObject`**，是一套独立的轻量类型层次 | 类注释原文 *Base class of reflection data objects*（[UAssetAPI](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs)） |
| **`FFieldClass`** | 字段的「类」——描述某个 `FField` 子类型的元信息 | UE 5.8 `Field.h`，见下 |
| **`FProperty`** | 属性的类型描述对象，`FField` 的派生体系；**UE5 里取代了 UE4 的 `UProperty`** | UE 5.8 `UnrealType.h`，见下 |
| **`FFieldVariant`** | 能装 `UObject` 或 `FField` 的容器，为这次迁移而存在 | UE 5.8 `Field.h`，见[下文](#为什么会有-ffieldvariant) |
| **`FFieldPath`** | 一条「按名字逐级定位字段」的路径，附带拥有者 | [CUE4Parse `FFieldPath.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FFieldPath.cs) |
| **`FKismetPropertyPointer`** | 字节码里指向属性/字段的指针 | [UAssetAPI](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/KismetPropertyPointer.cs)；见[第 09 章](/ue5-bp/09-property-pointer) |

## FFieldClass：字段的「类」

UE 5.8 `Field.h` 里的定义（注释为原文）：

```cpp
/**
 * Object representing a type of an FField struct. 
 * Mimics a subset of UObject reflection functions.
 */
class FFieldClass
{
    /** Name of this field class */
    FName Name;
    /** Class flags */
    EClassFlags ClassFlags;
    /** Unique Id of this field class (for casting) */
    uint64 Id;
    /** Cast flags used for casting to other classes */
    EClassCastFlags CastFlags;
    /** Super of this class */
    FFieldClass* SuperClass;
    /** Default instance of this class */
    FField* DefaultObject;
    /** Pointer to a function that can construct an instance of this class */
    FConstructFunction* ConstructFn;
    /** Counter for generating runtime unique names */
    std::atomic<int32> UniqueNameIndexCounter = 0;
};
```

那句类注释值得抄下来：**「Object representing a type of an FField struct. Mimics a subset of UObject
reflection functions.」**——它明确说了这是一套**模仿 `UObject` 反射功能、但更轻**的平行体系。

`FFieldClass` 里有 `Name` / `SuperClass` / `CastFlags` / `Id`，所以**字段类型本身也能被按名字查找和类型转换**。
这解释了为什么 [Dumper-7](/ue5-re/07-toolchain) 需要在运行时去定位 `FFieldClass::Name` 的偏移——
它不是一个编译期常量。

## UStruct 上的两条链：Children 与 ChildProperties

这是 UE5 相对 UE4 最直观的变化。UE 5.8 `Class.h` 里 `UStruct` 同时有两条链：

```cpp
/** Pointer to start of linked list of child fields */
FField* ChildProperties;

/** Total size of all UProperties, the allocated structure may be larger due to alignment */
int32 PropertiesSize;
/** Alignment of structure in memory, structure will be at least this large */
int16 MinAlignment;

/** Script bytecode associated with this object */
TArray<uint8> Script = {};
```

（`Class.h`；构造函数初始化列表里同时能看到 `Children(StructParams.FirstChild)` 与
`ChildProperties(StructParams.ChildProperties)`，说明两条链并存）

| 链 | 类型 | 装什么 |
|---|---|---|
| `Children` | `UField*` | **类型层次**：子类、子函数、子结构（这些是 `UObject`） |
| `ChildProperties` | `FField*` | **属性/字段**（这些**不是** `UObject`） |

UE4 时代只有 `Children` 一条链，属性（`UProperty`）也挂在上面，因为它是 `UObject`。
UE5 把属性挪到了 `ChildProperties`，于是**「遍历一个类的所有属性」这件事换了入口**。

`UStruct` 上还有一组**只在内存里**的链表（UE 5.8 `Class.h`，注释为原文）：

```cpp
/** In memory only: Linked list of properties from most-derived to base */
FProperty* PropertyLink;
/** In memory only: Linked list of object reference properties from most-derived to base */
FProperty* RefLink;
/** In memory only: Linked list of properties requiring destruction. ... */
FProperty* DestructorLink;
/** In memory only: Linked list of properties requiring post constructor initialization */
FProperty* PostConstructLink;
```

::: warning 注意这四条在 UE4 里挂在 `UProperty` 上
UE4 的 `PropertyLinkNext` / `NextRef` / `DestructorLinkNext` / `PostConstructLinkNext` 是 **`UProperty` 的成员**；
UE5 把它们提升到了 `UStruct`（`PropertyLink` / `RefLink` / `DestructorLink` / `PostConstructLink`）。

**「属性链表挂在哪」这件事本身变了**，任何按 UE4 结构写的遍历代码在 UE5 上都不成立。
:::

## FProperty：字段分两类

UE 5.8 `UnrealType.h`（注释为原文）：

```cpp
class FProperty : public FField
{
    DECLARE_FIELD_API(FProperty, FField, CASTCLASS_FProperty, UE_API)

    // Persistent variables.
    int32           ArrayDim;
    UE_DEPRECATED(5.5, "Use GetElementSize/SetElementSize instead.")
    int32           ElementSize;
public:
    EPropertyFlags  PropertyFlags;
    uint16          RepIndex;

private:
    TEnumAsByte<ELifetimeCondition> BlueprintReplicationCondition;

#if WITH_EDITORONLY_DATA || WITH_METADATA
    union
    {
        /** Index of the property within its owner, inclusive of base properties. Generated during Link(). */
        int32 IndexInOwner = -1;
        // ...
    };
#endif

    // In memory variables (generated during Link()).
    int32       Offset_Internal;
```

三个要点：

1. **`ElementSize` 在 5.5 已废弃**（`UE_DEPRECATED(5.5, "Use GetElementSize/SetElementSize instead.")`）——
   现在要通过访问器读，别再直接摸字段；
2. **`Offset_Internal` 与 `IndexInOwner` 都是 `Link()` 时生成的**（注释原文 *Generated during Link()*）——
   **资产文件里没有属性偏移**；
3. **`PropertyFlags` 是 `EPropertyFlags`**（64 位），是判定参数/in-out 的唯一依据（[见下](#ePropertyFlags判定参数与-inout-的唯一依据)）。

### 为什么「偏移不在文件里」这件事很重要

因为它是**静态逆向与运行时逆向的分界线**：

- 你在 `.uasset` 里能拿到「有哪些属性、叫什么、什么类型」；
- 但拿不到「这个属性在对象内存里的偏移」——那要等引擎加载资产、调 `Link()` 之后才算出来。

这也解释了为什么[运行时逆向那一专题](/ue5-re/01-object-model)要用 Dumper-7 的
`FindUObjectNameOffset()` 这类**探测函数**去内存里找偏移：**偏移是运行时才知道的**。

## 资产文件里的 FField 长什么样

上面都是**运行时**的结构。**打包后的资产文件里，`FField` 序列化出来的字段极少**
（[UAssetAPI `FieldTypes/FField.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs)）：

```csharp
public class FField
{
    public FName SerializedType;
    public FName Name;
    public EObjectFlags Flags;
    public TMap<FName, FString> MetaDataMap;

    public virtual void Read(AssetBinaryReader reader)
    {
        Name = reader.ReadFName();
        Flags = (EObjectFlags)reader.ReadUInt32();

        if (!reader.Asset.IsFilterEditorOnly && !reader.Asset.PackageFlags.HasFlag(EPackageFlags.PKG_Cooked))
        {
            bool bHasMetaData = reader.ReadBooleanInt();
            // ... 只有非 editor-only 且未 cook 时才读 MetaDataMap
        }
    }
}
```

两个必须记住的结论：

1. **实际序列化的只有 `Name` + `Flags`**（`SerializedType` 是读取时填的类型标记）；
2. **`MetaDataMap` 在 cooked 包里被剥掉**——`PKG_Cooked` 或 editor-only 过滤一旦成立，元数据就不写了。

所以「打包后的资产里还能不能拿到属性的中文显示名 / tooltip / 分类」这类问题的答案是：
**默认拿不到**，除非该包没有被 cook（比如编辑器构建的资产）。

::: tip UE 5.8 又改了一次
CUE4Parse 的实现里多了一个条件：

```csharp
public virtual void Deserialize(FAssetArchive Ar)
{
    Name = Ar.ReadFName();
    if (Ar.Game < GAME_UE5_8 || !Ar.IsFilterEditorOnly)
        Flags = Ar.Read<EObjectFlags>();
}
```

（出自 [CUE4Parse `FField.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FField.cs)）

UE 5.8 起，editor-only 过滤的包里**连 `Flags` 都不写了**。又一次「按版本分支」。
:::

## 为什么会有 FFieldVariant

UE 5.8 `Field.h` 里这个容器的类注释，就是 Epic 自己对这次迁移的说明（原文照抄）：

```cpp
/**
 * Special container that can hold either UObject or FField.
 * Exposes common interface of FFields and UObjects for easier transition from UProperties to FProperties.
 * DO NOT ABUSE. IDEALLY THIS SHOULD ONLY BE FFIELD INTERNAL STRUCTURE FOR HOLDING A POINTER TO THE OWNER OF AN FFIELD.
 */
```

**「for easier transition from UProperties to FProperties」**——官方明说了这个容器是为迁移服务的。
它的存在本身就证明了：UE5 的属性世界里，「拥有者」既可能是 `UObject`（比如 `UClass`），
也可能是 `FField`（比如 `FStructProperty` 里的内部属性），所以需要一个能装两种东西的联合体。

## 背景：UE4 的 UProperty（已废弃）

UE4 的属性类型描述对象叫 `UProperty`，**它是 `UObject` 的子类**（`UProperty : public UField : public UObject`）。
因此 UE4 时代可以「遍历对象数组找 `UProperty`」——这在 UE5 里**不再可能**，因为 `FProperty` 不在对象数组里。

UE4 里那几个「内存链表」是挂在 `UProperty` 自己身上的（`PropertyLinkNext` / `NextRef` /
`DestructorLinkNext` / `PostConstructLinkNext`），而 UE5 把它们提升到了 `UStruct`（见[上文](#ustruct-上的两条链children-与-childproperties)）。

::: tip 对照着看更清楚
两个库的文件名就是这段历史的化石：CUE4Parse 里
[`UnrealTypeLegacy.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealTypeLegacy.cs)
是 UE4 的 `UProperty`，[`UnrealType.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealType.cs)
是 UE5 的 `FProperty`。
:::

## EPropertyFlags：判定参数与 in/out 的唯一依据

标志位是 **64 位**，定义在 UE 5.8 `ObjectMacros.h`（注释为原文）：

| 标志 | 值 | 含义 |
|---|---|---|
| `CPF_Edit` | `0x1` | Property is user-settable in the editor. |
| `CPF_ConstParm` | `0x2` | This is a constant function parameter |
| `CPF_BlueprintVisible` | `0x4` | This property can be read by blueprint code |
| `CPF_ExportObject` | `0x8` | Object can be exported with actor. |
| `CPF_BlueprintReadOnly` | `0x10` | This property cannot be modified by blueprint code |
| `CPF_Net` | `0x20` | Property is relevant to network replication. |
| `CPF_EditFixedSize` | `0x40` | 数组元素可改，但大小不能变 |
| **`CPF_Parm`** | `0x80` | **Function/When call parameter.** |
| **`CPF_OutParm`** | `0x100` | **Value is copied out after function call.** |
| `CPF_ZeroConstructor` | `0x200` | memset is fine for construction |
| **`CPF_ReturnParm`** | `0x400` | **Return value.** |
| `CPF_NonNullable` | `0x1000` | Object property can never be null |
| `CPF_Transient` | `0x2000` | 不该被保存/加载（蓝图 CDO 除外） |
| `CPF_Config` | `0x4000` | 作为永久 profile 加载/保存 |
| `CPF_RequiredParm` | `0x8000` | 蓝图里必须显式连接，否则编译报错 |
| `CPF_Virtual` | `0x4000000` | 定义在接口上，**没有可用的 `Offset_Internal`** |
| **`CPF_ReferenceParm`** | `0x8000000` | **按引用传递；注释要求同时设置 `CPF_OutParm` 与 `CPF_Parm`** |

（出自 UE 5.8 `CoreUObject/Public/UObject/ObjectMacros.h` 的 `enum EPropertyFlags : uint64`）

**这就是「怎么判断一个属性是不是函数参数、是不是 out、是不是返回值」的答案**：
拿 `PropertyFlags & ParmFlags` 判断，而不是靠名字猜。

### 顺带一个可访问性的映射

CUE4Parse 里有把标志位映射成访问级别的逻辑：

```csharp
if (PropertyFlags.HasFlag(EPropertyFlags.BlueprintVisible) ||
    PropertyFlags.HasFlag(EPropertyFlags.BlueprintReadOnly))
    return EAccessMode.Public;
if (PropertyFlags.HasFlag(EPropertyFlags.Edit))
    return EAccessMode.Protected;
return EAccessMode.Private;
```

（出自 [CUE4Parse `UnrealType.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealType.cs)）

也就是说：**「蓝图里能不能看到这个变量」完全由标志位决定**，反过来也成立——
你在蓝图里看到 `Public` 变量，它的 `BlueprintVisible` 或 `BlueprintReadOnly` 一定被置上了。

::: tip 这和反编译有什么关系
本站 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler) 里说的
「`FunctionSignatures` 从 `LoadedProperties` 取出真实签名（参数名/类型/**in-out**/局部变量）」，
其中的 in-out 判定就是查这一组标志位。细节见[第 10 章](/ue5-bp/10-loaded-properties)。
:::

## 相关

- [07 · 反射对象的字段级定义](/ue5-bp/07-structures) —— 这些属性挂在哪个结构上
- [09 · FKismetPropertyPointer](/ue5-bp/09-property-pointer) —— 字节码里怎么指向一个属性
- [10 · LoadedProperties 与签名还原](/ue5-bp/10-loaded-properties) —— 用标志位还原函数签名
- [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm) —— 属性在运行时怎么被读写
- [附录 · 出处清单](/ue5-bp/appendix/sources)
