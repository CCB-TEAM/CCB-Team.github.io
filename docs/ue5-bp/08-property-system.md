---
title: 08 · 属性系统：FField 与 FProperty
---

# 08 · 属性系统：FField 与 FProperty

字节码里到处是「某个属性」的引用。搞不清属性系统，`EX_PropertyConst`、`EX_StructMemberContext`、
`EX_InstanceVariable` 这些操作码就只能靠猜。

## 先给定义

| 名词 | 定义 | 出处 |
|---|---|---|
| **`FField`** | **「Base class of reflection data objects」**——反射数据的基类 | [UAssetAPI `FieldTypes/FField.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs) 的类注释原文 |
| **`FProperty`** | 属性的类型描述对象（`FField` 的派生体系），UE5 里取代了 UE4 的 `UProperty` | 见下文迁移表 |
| **`UProperty`** | UE4 的属性类型描述对象，**是 `UObject` 的子类** | [UE4 公开源码 `UnrealType.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UnrealType.h) |
| **`FFieldPath`** | 一条「按名字逐级定位字段」的路径，附带拥有者 | [CUE4Parse `FFieldPath.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FFieldPath.cs) |
| **`FKismetPropertyPointer`** | **「Represents a Kismet bytecode pointer to an FProperty or FField」**——字节码里指向属性的指针 | [UAssetAPI `KismetPropertyPointer.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/KismetPropertyPointer.cs) 的类注释原文 |

注意最后两行的区别：**`FFieldPath` 是「怎么找」，`FKismetPropertyPointer` 是「字节码里怎么存」**。
后者在[第 09 章](/ue5-bp/09-property-pointer)单独展开。

## FField 在资产文件里长什么样

这是最有用的部分——**打包后的 `FField` 序列化出来的字段很少**：

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

（出自 [UAssetAPI `FieldTypes/FField.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs)）

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

## UE4 的 UProperty：字段分两类

引擎源码把成员分成了「持久变量」和「内存变量」两组，这个区分极其重要：

```cpp
class COREUOBJECT_API UProperty : public UField
{
    // Persistent variables.
    int32   ArrayDim;
    int32   ElementSize;
    uint64  PropertyFlags;
    uint16  RepIndex;
    FName   RepNotifyFunc;

private:
    // In memory variables (generated during Link()).
    int32   Offset_Internal;

    ELifetimeCondition BlueprintReplicationCondition;

public:
    /** In memory only: Linked list of properties from most-derived to base **/
    UProperty* PropertyLinkNext;
    /** In memory only: Linked list of object reference properties from most-derived to base **/
    UProperty* NextRef;
    /** In memory only: Linked list of properties requiring destruction. **/
    UProperty* DestructorLinkNext;
    /** In memory only: Linked list of properties requiring post constructor initialization. **/
    UProperty* PostConstructLinkNext;
};
```

（出自 [UE4 公开源码 `UnrealType.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UnrealType.h)）

关键点：**`ElementSize` 与 `Offset_Internal` 是「Link() 时生成」的**。这意味着：

- **资产文件里没有属性偏移**。你在 `.uasset` 里拿不到「这个属性在对象内存里的偏移」；
- 偏移是引擎加载资产、调用 `Link()` 之后算出来的；
- 这也解释了为什么[运行时逆向那一专题](/ue5-re/01-object-model)要用 Dumper-7 的 `FindUObjectNameOffset()` 这类**探测函数**去找偏移——
  **偏移是运行时才知道的，静态文件里根本没有**。

CUE4Parse 的 UE4 侧实现也印证了这一点：它只读 `ArrayDim` / `PropertyFlags` / `RepNotifyFunc` /
`BlueprintReplicationCondition`，**不读 `ElementSize` 和 `Offset_Internal`**。

（出自 [CUE4Parse `UnrealTypeLegacy.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealTypeLegacy.cs)；
文件名里的 **Legacy** 就是这个意思）

## UE4 → UE5：从 UProperty 到 FProperty

| | UE4 | UE5（4.25 起） |
|---|---|---|
| 属性类型对象 | `UProperty`（**是 `UObject`**） | `FProperty`（**不是 `UObject`**，属于 `FField` 体系） |
| 能否在对象数组里找到 | ✅ 能 | ❌ 不能，要顺着 `UStruct` 的字段链走 |
| 字节码里的属性引用 | `FPackageIndex`（指向 Import/Export） | `FFieldPath`（名字路径 + 拥有者） |
| 两个库的文件名 | `UnrealTypeLegacy.cs` | `UnrealType.cs` |

（前两行的依据：`UProperty : public UField : public UObject` 见 `UnrealType.h`；`FField` 的定位见
[UAssetAPI](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs) 与
[CUE4Parse](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FField.cs)
里它都是**独立于 `UObject` 的普通类**；第三行见[第 09 章](/ue5-bp/09-property-pointer)）

这个迁移的实用后果：**UE4 时代可以「遍历对象数组找 UProperty」，UE5 不行了**。
属性变成了非 `UObject` 的轻量对象，只能从类型（`UStruct`/`UClass`）往下走。

## EPropertyFlags：判定参数与 in/out 的唯一依据

属性标志位是 64 位（`ulong`），UE3 某个版本后从 32 位扩到 64 位
（`PropertyFlagsSizeExpandedTo64Bits`，见 `UnrealTypeLegacy.cs` 的读取分支）。常用取值：

| 标志 | 值 | 含义（注释原文） |
|---|---|---|
| `Edit` | `0x1` | Property is user-settable in the editor |
| `ConstParm` | `0x2` | This is a constant function parameter |
| `BlueprintVisible` | `0x4` | This property can be read by blueprint code |
| `ExportObject` | `0x8` | Object can be exported with actor |
| `BlueprintReadOnly` | `0x10` | This property cannot be modified by blueprint code |
| `Net` | `0x20` | Property is relevant to network replication |
| **`Parm`** | `0x80` | **Function/When call parameter** |
| **`OutParm`** | `0x100` | **Value is copied out after function call** |
| `ZeroConstructor` | `0x200` | memset is fine for construction |
| **`ReturnParm`** | `0x400` | **Return value** |
| `Transient` | `0x2000` | 不该被保存/加载（蓝图 CDO 除外） |
| `RequiredParm` | `0x8000` | 蓝图里必须连接，否则编译报错 |
| **`ReferenceParm`** | `0x8000000` | **按引用传递；注释明确要求同时设置 OutParm 与 Parm** |

（出自 [CUE4Parse `UnrealType.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealType.cs) 的 `EPropertyFlags` 枚举，注释为原文）

还有两个「组合掩码」，直接给了判定方法：

```csharp
/// <summary>
/// All parameter flags
/// </summary>
ParmFlags = Parm | OutParm | ReturnParm | ReferenceParm | ConstParm | RequiredParm,
```

（同上）

**这就是「怎么判断一个属性是不是函数参数、是不是 out、是不是返回值」的答案**：
拿 `PropertyFlags & ParmFlags` 判断，而不是靠名字猜。

::: tip 这和反编译有什么关系
本站 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler) 里说的
「`FunctionSignatures` 从 `LoadedProperties` 取出真实签名（参数名/类型/**in-out**/局部变量）」，
其中的 in-out 判定就是查这一组标志位。细节见[第 10 章](/ue5-bp/10-loaded-properties)。
:::

### 顺带一个可访问性的映射

同一个文件里还有把标志位映射成访问级别的逻辑：

```csharp
if (PropertyFlags.HasFlag(EPropertyFlags.BlueprintVisible) ||
    PropertyFlags.HasFlag(EPropertyFlags.BlueprintReadOnly))
    return EAccessMode.Public;
if (PropertyFlags.HasFlag(EPropertyFlags.Edit))
    return EAccessMode.Protected;
return EAccessMode.Private;
```

（同上）

也就是说：**「蓝图里能不能看到这个变量」完全由标志位决定**，反过来也成立——
你在蓝图里看到 `Public` 变量，它的 `BlueprintVisible` 或 `BlueprintReadOnly` 一定被置上了。

## 相关

- [07 · 反射对象的字段级定义](/ue5-bp/07-structures) —— 这些属性挂在哪个结构上
- [09 · FKismetPropertyPointer](/ue5-bp/09-property-pointer) —— 字节码里怎么指向一个属性
- [10 · LoadedProperties 与签名还原](/ue5-bp/10-loaded-properties) —— 用标志位还原函数签名
- [附录 · 出处清单](/ue5-bp/appendix/sources)
