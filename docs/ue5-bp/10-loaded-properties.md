---
title: 10 · LoadedProperties 与签名还原
---

# 10 · LoadedProperties 与签名还原

这一章回答一个很具体的问题：**打包后的蓝图里，函数签名（参数名、类型、in/out、返回值）从哪来？**

答案不在字节码里，也不在 `UFunction` 的字段里，而在 `LoadedProperties`。

## 定义

`LoadedProperties` 是 `UStruct` 导出上的一个数组，UAssetAPI 里的定义与注释原文是：

```csharp
/// <summary>
/// Properties serialized with this struct definition
/// </summary>
public FProperty[] LoadedProperties;
```

（出自 [UAssetAPI `ExportTypes/StructExport.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/ExportTypes/StructExport.cs)）

翻译成一句话：**它是「跟着这个结构定义一起被序列化下来的属性列表」**。
因为 `UFunction` 本身是 `UStruct` 的子类，所以**函数的参数与局部变量就躺在这里**。

## 为什么必需：`ParmsSize` 是内存变量

这是整件事的关键。看引擎源码里 `UFunction` 的字段分组：

```cpp
class COREUOBJECT_API UFunction : public UStruct
{
    // Persistent variables.
    uint32 FunctionFlags;
    uint16 RepOffset;

    // Variables in memory only.
    uint8  NumParms;
    uint16 ParmsSize;
    uint16 ReturnValueOffset;
    uint16 RPCId;
    uint16 RPCResponseId;

    /** pointer to first local struct property in this UFunction that contains defaults */
    UProperty* FirstPropertyToInit;

#if UE_BLUEPRINT_EVENTGRAPH_FASTCALLS
    UFunction* EventGraphFunction;
    int32 EventGraphCallOffset;
#endif
private:
    Native Func;
};
```

（出自 [UE4 公开源码 `Class.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h)）

**`ParmsSize`、`ReturnValueOffset`、`NumParms` 三个字段的注释是「Variables in memory only」**——
它们**不在资产文件里**，是引擎加载时算出来的。

那么问题来了：调用一个蓝图函数需要知道参数缓冲区多大（[运行时逆向专题第 05 章](/ue5-re/05-process-event)讲过
`ProcessEvent` 要按 `ParmsSize` 分配缓冲区），这个大小从哪来？

**从 `LoadedProperties` 重建。** 有了属性列表，参数大小、返回值偏移、参数个数都能自己算出来。

::: tip 一句话记住
**`ParmsSize` 是运行时算出来的结果，`LoadedProperties` 是算它所需的输入。**
资产文件里只有后者。
:::

## 它在文件里的位置与读取顺序

`StructExport` 的读取顺序是有严格顺序的（出自
[`StructExport.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/ExportTypes/StructExport.cs)）：

| 顺序 | 字段 | 说明 |
|---|---|---|
| 1 | `SuperStruct` | `FPackageIndex`，父结构，可为 null |
| 2 | `Children` | 子字段列表。**老版本是「单个 firstChild」，新版本是数组**——门是 `FFrameworkObjectVersion.RemoveUField_Next` |
| 3 | **`LoadedProperties`** | 属性数组。**门是 `FCoreObjectVersion.FProperties`**，早于此版本的资产没有这一段 |
| 4 | `ScriptBytecode` | 字节码表达式树 |
| 5 | `ScriptBytecodeSize` / `ScriptBytecodeRaw` | **兜底**：字节码解析失败时，用原始字节填这两个字段 |

第 5 条值得单独说，它的注释原文是：

> Bytecode size in total in deserialized memory. Filled out in lieu of `ScriptBytecode` if an error occurs
> during bytecode parsing.

**「解析出错时用它替代」——这句话说明「字节码解析失败」是这个库预期内会发生的事**，
所以设计了兜底字段。这也从侧面印证了[第 05 章](/ue5-bp/05-pitfalls)讲的：
厂商魔改 opcode 会让解析失败，而库作者知道这一点。

## 怎么用它还原签名

流程并不复杂，难点在细节：

```
LoadedProperties（FProperty[]）
   │
   ├─ 看 PropertyFlags & ParmFlags  →  是不是参数
   │      ├─ 带 Parm      →  普通入参
   │      ├─ 带 OutParm   →  out 参数（"Value is copied out after function call"）
   │      ├─ 带 ReturnParm→  返回值
   │      ├─ 带 ReferenceParm → 按引用（注释要求同时带 Parm 与 OutParm）
   │      └─ 带 ConstParm → 常量参数
   │
   ├─ 不带 Parm 标志的  →  局部变量
   │
   └─ 看 FProperty 的具体子类（FIntProperty / FObjectProperty / FStructProperty / ...）
          →  还原类型名
```

`ParmFlags` 的掩码定义在 `EPropertyFlags` 里（见[第 08 章](/ue5-bp/08-property-system)）：

```csharp
/// <summary>
/// All parameter flags
/// </summary>
ParmFlags = Parm | OutParm | ReturnParm | ReferenceParm | ConstParm | RequiredParm,
```

（出自 [CUE4Parse `UnrealType.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Objects/UObject/UnrealType.cs)）

::: warning 别用名字猜 in/out
参数名里的 `Out`、`Return` 都是**命名习惯，不是语义**。语义只看标志位。
本站 [KismetDecompiler](https://github.com/CCB-TEAM/KismetDecompiler) 的做法是
「从 `LoadedProperties` 取出真实签名（参数名/类型/in-out/局部变量）」——
注意它取的是**四个维度**，in-out 与类型都来自这里，不来自字节码。
:::

## 与 `.usmap` 的分工

这两个东西经常被混为一谈，其实职责不同：

| | `LoadedProperties` | `.usmap` |
|---|---|---|
| 回答什么 | **这个结构/函数有哪些属性** | **这些属性的类型是什么** |
| 在哪 | 资产文件内部（`StructExport` 上） | 独立的外部映射文件 |
| 何时需要 | 永远需要（还原签名的输入） | UE5 的 unversioned properties 场景必需 |
| 缺了会怎样 | 签名还原不出来，只能从字节码反推 | 属性解析错位，字节码跟着烂 |

**两个都缺一不可。** 这也解释了为什么工具的命令行里 `.usmap` 是显式参数，
而 `LoadedProperties` 是「自动就在那里」的——它是资产的一部分。

## 实践中的三个坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 资产早于 `FCoreObjectVersion.FProperties` | `LoadedProperties` 为空 | 只能从字节码里反推参数（`EX_EndFunctionParms` 之前的表达式序列），精度下降 |
| 只看字节码不看 `LoadedProperties` | 参数名变成 `Temp_1`、in/out 判错 | 参数信息以 `LoadedProperties` 为准 |
| 忘了 `ScriptBytecodeRaw` 兜底 | 解析失败时以为「这个函数是空的」 | 检查 `ScriptBytecodeSize`/`ScriptBytecodeRaw` 是否有值——有值说明解析失败过 |

（表中内容为基于上述来源的推论与本站实践。）

### 一个交叉验证手段

本站工具提供了 `--uhtdump` 参数：给出 UHT 头文件导出目录后，
「引擎函数的 out 形参会渲染成 `out x`，未知数值转换也能按形参类型还原」
（出自 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）。

这就是一条很好的验证链：**用 UHT 头文件（权威的类型/签名来源）去校验从 `LoadedProperties` 还原出来的签名**。
两者不一致时，先怀疑你的还原逻辑。

## 相关

- [07 · 反射对象的字段级定义](/ue5-bp/07-structures) —— `StructExport` 与 `UStruct` 的对应关系
- [08 · 属性系统](/ue5-bp/08-property-system) —— `EPropertyFlags` 与 `ParmFlags`
- [09 · FKismetPropertyPointer](/ue5-bp/09-property-pointer) —— 属性在字节码里的引用方式
- [运行时逆向 · ProcessEvent](/ue5-re/05-process-event) —— `ParmsSize` 的运行时用途
- [附录 · 出处清单](/ue5-bp/appendix/sources)
