---
title: 09 · FKismetPropertyPointer
---

# 09 · FKismetPropertyPointer

字节码里凡是「提到某个变量/属性」的地方，用的都是这个类型。它的定义只有一句话，但背后的版本差异很容易踩坑。

## 定义

UAssetAPI 的类注释原文：

```csharp
/// <summary>
/// Represents a Kismet bytecode pointer to an FProperty or FField.
/// </summary>
[JsonObject(MemberSerialization.OptIn)]
public class KismetPropertyPointer
{
    /// <summary>
    /// The pointer serialized as an FPackageIndex. Used in versions older than
    /// FReleaseObjectVersion.FFieldPathOwnerSerialization.
    /// </summary>
    public FPackageIndex Old;

    /// <summary>
    /// The pointer serialized as an FFieldPath. Used in versions newer than
    /// FReleaseObjectVersion.FFieldPathOwnerSerialization.
    /// </summary>
    public FFieldPath New;
    // ...
}
```

（出自 [UAssetAPI `Kismet/Bytecode/KismetPropertyPointer.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/KismetPropertyPointer.cs)）

**一句话定义：它是「字节码里指向一个属性或字段」的指针**，而且**有两种序列化形态**，
由版本决定用哪一种。

## 两种形态

| 形态 | 类型 | 适用版本 | 含义 |
|---|---|---|---|
| `Old` | `FPackageIndex` | 早于 `FReleaseObjectVersion.FFieldPathOwnerSerialization` | 用**导入/导出表索引**指向属性 |
| `New` | `FFieldPath` | 晚于该版本 | 用**名字路径 + 拥有者**指向字段 |

注意版本门是一个**具名版本常量**（`FFieldPathOwnerSerialization`），不是「UE4 / UE5」这种粗粒度版本号。
CUE4Parse 用的是近似的判断：

```csharp
if (Ar.Game >= GAME_UE4_25 || Ar.Game is GAME_AssaultFireFuture)
    New = new FFieldPath(Ar);
else
    Old = new FPackageIndex(Ar);
```

（出自 [CUE4Parse `UE4/Kismet/KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Kismet/KismetExpression.cs)）

两个库表达同一件事的方式不同：**一个用「具名版本」，一个用「游戏版本号 + 特例」**。
后者还带了 `GAME_AssaultFireFuture` 这个按具体游戏的特例。

::: tip 为什么必须换形态（本专题的推论）
UE4 的 `UProperty` **是 `UObject`**，所以能进包的导入表，用 `FPackageIndex` 就能引用；
UE5 的 `FField`/`FProperty` **不再是 `UObject`**，进不了导入表，于是只能换成「名字路径」这种自描述的形式。

依据有三条：

1. UE4 的 `UProperty : public UField` 且 `UField : public UObject`（[UE4 公开镜像 `UnrealType.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UnrealType.h)）；
2. `FField` 在两个库里都是**独立于 `UObject` 的普通类**（[UAssetAPI](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/FieldTypes/FField.cs) /
   [CUE4Parse](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FField.cs)）；
3. **UE 5.8 源码里 `FFieldVariant` 的类注释直接说了这次迁移的目的**：
   *「Exposes common interface of FFields and UObjects for easier transition from UProperties to FProperties.」*
   （`CoreUObject/Public/UObject/Field.h`，见 [08 章](/ue5-bp/08-property-system)）

「所以必须换形态」是本专题的推论，但第 3 条基本坐实了因果。
:::

## FFieldPath 里有什么

```csharp
public class FFieldPath
{
    public FName[] Path;
    public FPackageIndex? ResolvedOwner; // UStruct

    public FFieldPath(FKismetArchive Ar) : this()
    {
        Path = Ar.ReadArray(Ar.ReadFName);
        // The old serialization format could save 'None' paths, they should be just empty
        if (Path.Length == 1 && Path[0].IsNone) Path = [];

        if (FFortniteMainBranchObjectVersion.Get(Ar) >= FFortniteMainBranchObjectVersion.Type.FFieldPathOwnerSerialization ||
            FReleaseObjectVersion.Get(Ar) >= FReleaseObjectVersion.Type.FFieldPathOwnerSerialization)
        {
            ResolvedOwner = new FPackageIndex(Ar);
        }

        Ar.Index = index + 8;
    }
}
```

（出自 [CUE4Parse `UE4/Objects/UObject/FFieldPath.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FFieldPath.cs)）

四个值得注意的点：

1. **`Path` 是 `FName[]`**——一条逐级的名字路径（比如 `Owner -> Struct -> Field`），不是单个名字；
2. **`ResolvedOwner` 是「拥有者」**，指向 `UStruct`；它本身也受版本门控制（两个分支版本常量任一满足就存在）；
3. **老格式可能存 `None` 路径**，实现里把它归一化成空数组——这类「历史包袱」在解析器里到处都是；
4. **`Ar.Index = index + 8;`** ——**一个 `KismetPropertyPointer` 在字节码里固定占 8 字节**。

## 占 8 字节：两个库的独立印证

这一点很重要，因为它直接关系到[第 02 章](/ue5-bp/02-bytecode)讲的「`GetSize` 累计偏移」。
两个库的实现里都写着同一个数字：

```csharp
// CUE4Parse
Ar.Index = index + 8;

// UAssetAPI（EX_VariableBase.Visit）
offset += 8; // Variable (KismetPropertyPointer)
```

（依次出自 [CUE4Parse `FFieldPath.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/FFieldPath.cs) 与
[UAssetAPI `EX_VariableBase.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_VariableBase.cs)）

::: warning 8 字节是「这两种形态都按 8 字节算」的意思
`Old` 形态是 `FPackageIndex`（4 字节）+ 4 字节对齐/填充；`New` 形态是 `FFieldPath` 的可变内容。
但**在字节码偏移计算里，它按 8 字节固定处理**。如果你自己写解析器，这里最容易错。
:::

## 哪些操作码会用到它

| 操作码 | 字段 | 说明 |
|---|---|---|
| `EX_VariableBase`（抽象基类） | `KismetPropertyPointer Variable` | 「指向所讨论的变量」——`EX_LocalVariable`、`EX_InstanceVariable`、`EX_DefaultVariable`、`EX_ClassSparseDataVariable` 都继承它 |
| `EX_PropertyConst` | `KismetPropertyPointer Property` | 「指向所讨论的属性」 |
| `EX_StructMemberContext` | `KismetPropertyPointer StructMemberExpression` + `KismetExpression StructExpression` | 访问结构体里的成员：**一个指针 + 一个「取哪个结构」的表达式** |
| `EX_FieldPathConst` | 包一个 `KismetExpression` | 字段路径常量 |

（出自 UAssetAPI 的 [`EX_VariableBase.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_VariableBase.cs)、
[`EX_PropertyConst.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_PropertyConst.cs)、
[`EX_StructMemberContext.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_StructMemberContext.cs)、
[`EX_FieldPathConst.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_FieldPathConst.cs)）

::: tip 一个侧面证据：操作码还在长
`EX_VariableBase` 的抽象基类里写着 `Token => EExprToken.EX_ClassSparseDataVariable`——
这个操作码**不在 UE4 公开源码的 `EExprToken` 表里**，属于后来新增的。
又一次印证[第 05 章](/ue5-bp/05-pitfalls)的结论：操作码表本身在增长。
:::

## 怎么解引用

两种形态，两条路：

| 形态 | 解引用步骤 |
|---|---|
| `Old`（`FPackageIndex`） | 看符号定 Import/Export → 取对应表项 → 得到属性对象 → 读它的 `Name` |
| `New`（`FFieldPath`） | 从 `ResolvedOwner`（`UStruct`）出发 → 按 `Path` 里的 `FName` **逐级查找** → 得到字段 |

`New` 形态的好处是**自描述**：不需要外部表也能走通（只要你能定位 `ResolvedOwner`）。
代价是**多了一次逐级查找**，而且路径里任何一级名字对不上就找不到。

## 实践中的坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 版本判断只按 UE 大版本 | 边界版本上解析错位 | 用**具名版本常量**（`FFieldPathOwnerSerialization`）判断，注意还有分支版本（Fortnite 主线） |
| 忘了 `None` 路径归一化 | `Path` 里出现一个 `None`，查找失败 | 单元素且为 `None` 时视为空路径 |
| 偏移算成 4 字节 | 后续所有跳转目标错位，且**不报错** | 固定按 8 字节计 |
| 拿到指针就以为拿到了名字 | `FFieldPath` 里没有名字字符串，只有 `FName` 索引 | 还要过一次名称池（[第 03 章](/ue5-re/03-gnames)） |

（表中内容为基于上述来源的推论与本站实践。）

## 相关

- [07 · 反射对象的字段级定义](/ue5-bp/07-structures) —— `FPackageIndex` 的 Import/Export 语义
- [08 · 属性系统](/ue5-bp/08-property-system) —— `FField` / `FFieldPath` 是什么
- [10 · LoadedProperties 与签名还原](/ue5-bp/10-loaded-properties)
- [附录 · 出处清单](/ue5-bp/appendix/sources)
