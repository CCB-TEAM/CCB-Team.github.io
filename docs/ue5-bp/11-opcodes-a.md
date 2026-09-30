---
title: 11 · 常用字节码详解（上）
---

# 11 · 常用字节码详解（上）

[第 02 章](/ue5-bp/02-bytecode)给了操作码的全景分组表；这两章把**实际会遇到的**操作码逐个讲清楚：
token 值、操作数、语义、以及反编译器会把它渲染成什么。

## 怎么读这一章

每个操作码给四样东西：

| 项 | 含义 |
|---|---|
| **token** | `EExprToken` 的取值（十六进制） |
| **操作数** | 序列化时的字段，**按写入顺序排列**——顺序就是解析顺序 |
| **渲染** | 本站 [KismetDecompiler](https://github.com/CCB-TEAM/KismetDecompiler) 的 `ExprRenderer` 实际输出（取自源码） |
| **注释原文** | UE 5.8 源码 `Script.h` 里的原话（有则引用，无则说明） |

::: tip 关于「无操作数」
有些操作码没有任何字段（如 `EX_True`、`EX_EndFunctionParms`）——**它们自己就是全部信息**。
还有些操作码的字段继承自基类，文中会标出基类名。
:::

---

## 一、变量引用

这一族的共同点是**操作数只有一个 `KismetPropertyPointer`**，由基类 `EX_VariableBase` 提供：

```csharp
public abstract class EX_VariableBase : KismetExpression
{
    /// <summary>A pointer to the variable in question.</summary>
    public KismetPropertyPointer Variable;
}
```

（出自 [UAssetAPI `EX_VariableBase.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_VariableBase.cs)）

### `EX_LocalVariable` · `0x00` — 局部变量
- 操作数：`KismetPropertyPointer Variable`
- 渲染：变量路径（由 `RenderVariablePath` 解析）
- 注释原文：*A local variable.*

### `EX_InstanceVariable` · `0x01` — 对象变量
- 操作数：`KismetPropertyPointer Variable`
- 注释原文：*An object variable.*

### `EX_DefaultVariable` · `0x02` — 类上下文的默认值
- 操作数：`KismetPropertyPointer Variable`
- 注释原文：*Default variable for a class context.*

### `EX_LocalOutVariable` · `0x48` — 按引用传递的 out 参数
- 操作数：`KismetPropertyPointer Variable`
- 注释原文：*local out (pass by reference) function parameter*
- 备注：这是「函数改了我的变量」的载体。判断一个参数是不是 out，靠的是 `LoadedProperties` 里的
  `OutParm`/`ReferenceParm` 标志（见[第 08 章](/ue5-bp/08-property-system)），**不是靠这个操作码**——
  它只表示「读这个引用」。

### `EX_Self` · `0x17` — 自己
- 操作数：无
- 渲染：`self`
- 注释原文：*Self object.*

### `EX_ClassSparseDataVariable` · `0x6C` — 稀疏数据变量 ★
- 操作数：`KismetPropertyPointer Variable`（继承 `EX_VariableBase`）
- 注释原文：*Sparse data variable*
- 备注：**UE4 表里没有这个取值**。`EX_VariableBase` 基类把默认 token 写成了它，说明它是变量引用族的一员。

---

## 二、常量

常量族大多走泛型基类 `KismetExpression<T>`，值放在泛型的 `Value` 里。

### 整数与布尔

| 操作码 | token | 值的类型 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_IntConst` | `0x1D` | `int` | 数字 | *Int constant.* |
| `EX_IntConstByte` | `0x2C` | `byte` | 数字 | *Int constant that requires 1 byte.* |
| `EX_Int64Const` | `0x35` | `long` | 数字 | *64-bit integer constant.* |
| `EX_UInt64Const` | `0x36` | `ulong` | 数字 | *64-bit unsigned integer constant.* |
| `EX_ByteConst` | `0x24` | `byte` | 数字 | *A byte constant.* |
| `EX_IntZero` | `0x25` | 无操作数 | `0` | *Zero.* |
| `EX_IntOne` | `0x26` | 无操作数 | `1` | *One.* |
| `EX_True` | `0x27` | 无操作数 | `true` | *Bool True.* |
| `EX_False` | `0x28` | 无操作数 | `false` | *Bool False.* |

::: tip 为什么 0 和 1 要单独占两个操作码
因为它们在蓝图里出现得太多，值得省掉 4 字节。**`EX_IntZero` 不是「值为 0 的 `EX_IntConst`」**，
而是完全独立的 token——写解析器时两个都要处理。
:::

### 浮点与字符串

| 操作码 | token | 操作数 | 注释原文 |
|---|---|---|---|
| `EX_FloatConst` | `0x1E` | `float Value` | *Floating point constant.* |
| `EX_DoubleConst` | `0x37` | `double`（泛型 `Value`） | *Double constant.* ★ |
| `EX_StringConst` | `0x1F` | `string`（泛型 `Value`） | *String constant.* |
| `EX_UnicodeStringConst` | `0x34` | `string`（泛型 `Value`） | *Unicode string constant.* |
| `EX_NameConst` | `0x21` | `FName`（泛型 `Value`） | *A name constant.* |

★ = UE4 表里没有这个取值。

::: warning 字符串有两种
`EX_StringConst` 是 ANSI 字符串，`EX_UnicodeStringConst` 是宽字符。
遇到非 ASCII 内容时前者可能已经丢过信息——**这是「名字里有中文」的蓝图必须注意的地方**。
:::

### 复杂常量

| 操作码 | token | 操作数 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_ObjectConst` | `0x20` | `FPackageIndex`（泛型 `Value`） | 对象名 | *An object constant.* |
| `EX_TextConst` | `0x29` | `FScriptText`（泛型 `Value`） | `"..."` / `NSLOCTEXT(...)` / `LOCTABLE(...)` | *FText constant* |
| `EX_VectorConst` | `0x23` | `FVector Value` | `(x, y, z)` | *A vector constant.* |
| `EX_RotationConst` | `0x22` | `FRotator Value` | — | *A rotation constant.* |
| `EX_TransformConst` | `0x2B` | `FTransform`（泛型 `Value`） | — | *A transform constant* |
| `EX_Vector3fConst` | `0x41` | `float X`、`float Y`、`float Z` | `(x, y, z)` | *A float vector constant.* ★ |
| `EX_NoObject` | `0x2A` | 无操作数 | `null` | *NoObject.* |
| `EX_NoInterface` | `0x2D` | 无操作数 | `null` | *A null interface (similar to `EX_NoObject`, but for interfaces)* |
| `EX_SoftObjectConst` | `0x67` | — | — | 无 |

::: warning `0x67` 换过含义
UE4 里 `0x67` 是 `EX_AssetConst`，**UE 5.8 里是 `EX_SoftObjectConst`**。
按 UE4 的表去读 UE5 资产，这一格会解释错。
:::

`EX_TextConst` 的渲染要看 `EBlueprintTextLiteralType`——本站反编译器按它还原成
字符串字面量、`NSLOCTEXT(...)` 或 `LOCTABLE(...)` 三种形式之一。

（渲染规则出自 [KismetDecompiler `ExprRenderer.cs`](https://github.com/CCB-TEAM/KismetDecompiler) 与
[README](https://github.com/CCB-TEAM/KismetDecompiler)）

---

## 三、函数调用

调用在字节码里是**两段式**：先一个「调用操作码」，后面跟一串参数表达式，最后用终止符收尾。

### 终止符

| 操作码 | token | 操作数 | 注释原文 |
|---|---|---|---|
| `EX_EndFunctionParms` | `0x16` | 无 | *End of function call parameters.* |
| `EX_EndParmValue` | `0x15` | 无 | *end of default value for optional function parameter* |

::: warning 这两个终止符必须成对处理
`EX_EndFunctionParms` 结束整个参数列表；`EX_EndParmValue` 结束**单个可选参数的默认值**。
只认前一个的话，带默认值的函数调用会把参数个数数错。
:::

### 三种调用形式

| 操作码 | token | 操作数 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_FinalFunction` | `0x1C` | `FPackageIndex StackNode`、`KismetExpression[] Parameters` | `name(params)` | *A prebound function call with parameters.* |
| `EX_VirtualFunction` | `0x1B` | `FName VirtualFunctionName`、`KismetExpression[] Parameters` | `name(params)` | *A function call with parameters.* |
| `EX_LocalVirtualFunction` | `0x45` | `FName` + `Parameters` | `name(params)` | *Special instructions to quickly call a virtual function that we know is going to run only locally* ★ |
| `EX_LocalFinalFunction` | `0x46` | `FPackageIndex StackNode` + `Parameters` | `name(params)` | *Special instructions to quickly call a final function that we know is going to run only locally* ★ |
| `EX_CallMath` | `0x68` | 继承 `EX_FinalFunction`（`StackNode` + `Parameters`） | 能识别成运算符就渲染成 `a + b`，否则退化成调用 | *static pure function from on local call space* |

**`EX_FinalFunction` 与 `EX_VirtualFunction` 的区别**：前者用 `FPackageIndex` 直接绑定目标函数
（编译期确定），后者用 `FName` 按名字查找（运行期解析）。前者更常见、也更好反编译。

`EX_CallMath` 值得单独说：它是**数学库调用**，本站反编译器会先把
`Greater_IntInt(a,b)` 这类名字映射成运算符（`a > b`），映射不上才退化成函数调用。

（映射规则出自 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

### 上下文调用

| 操作码 | token | 操作数 | 渲染 |
|---|---|---|---|
| `EX_Context` | `0x19` | `KismetExpression ObjectExpression`、`uint Offset`、`byte PropertyType`、`KismetPropertyPointer RValuePointer`、`KismetExpression ContextExpression` | `{ObjectExpression}.{ContextExpression}` |
| `EX_Context_FailSilent` | `0x1A` | 继承 `EX_Context` | 同上 |
| `EX_ClassContext` | `0x12` | 继承 `EX_Context` | 同上 |
| `EX_InterfaceContext` | `0x51` | `KismetExpression InterfaceValue` | 直接渲染内部表达式 |

注释原文：

- `EX_Context`：*Call a function through an object context.*
- `EX_Context_FailSilent`：*Call a function through an object context (can fail silently if the context is
  NULL; only generated for functions that don't have output or return values).*
- `EX_ClassContext`：*Class default object context.*
- `EX_InterfaceContext`：*Call a function through a native interface variable*

::: tip `EX_Context` 的五个操作数为什么这么多
它是「**在某个对象上做点什么**」的通用容器：`ObjectExpression` 是对象，`ContextExpression` 是要做的事，
中间的 `Offset` / `PropertyType` / `RValuePointer` 是为「跳过中间属性直接取值」准备的快捷路径。
反编译时只需要前两个，但**解析时必须把五个都读掉**，否则后面的字节全错位。
:::

---

## 四、赋值

### `EX_Let` · `0x0F` — 通用赋值
- 操作数：`KismetPropertyPointer Value`、`KismetExpression Variable`、`KismetExpression Expression`
- 渲染：`{Variable} = {Expression}`
- 注释原文：*Assign an arbitrary size value to a variable.*

注意它同时有 `Value`（属性指针）和 `Variable`（表达式）——**前者是「属性是谁」，后者是「怎么访问它」**。

### `EX_LetBase` 家族 — 按类型细分的赋值

基类只有两个字段：

```csharp
public KismetExpression VariableExpression;
public KismetExpression AssignmentExpression;
```

（出自 [UAssetAPI `EX_LetBase.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/Expressions/EX_LetBase.cs)）

派生出来的五个操作码**共用同一套操作数**，只在语义上区分目标类型：

| 操作码 | token | 注释原文 |
|---|---|---|
| `EX_LetBool` | `0x14` | *Let boolean variable.* |
| `EX_LetObj` | `0x5F` | *assign to any object ref pointer* |
| `EX_LetWeakObjPtr` | `0x60` | *assign to a weak object pointer* |
| `EX_LetDelegate` | `0x44` | *Assignment to a delegate* |
| `EX_LetMulticastDelegate` | `0x43` | *Assignment to a multi-cast delegate* |

渲染统一是 `{VariableExpression} = {AssignmentExpression}`——本站反编译器就用一个
`case EX_LetBase` 分支覆盖了全部五种。

### `EX_LetValueOnPersistentFrame` · `0x64` — 写进持久帧
- 操作数：`KismetPropertyPointer DestinationProperty`、`KismetExpression AssignmentExpression`
- 注释原文：无（UE 5.8 源码中该取值无注释）

**「持久帧」指的是跨帧保留的那块存储**（延迟节点的状态就存在这里）。
它和普通 `EX_Let` 的区别是目标不是对象属性，而是持久帧上的一个位置。

---

## 相关

- [12 · 常用字节码详解（下）](/ue5-bp/12-opcodes-b) —— 控制流、执行流栈、转换、容器、委托
- [02 · Kismet 字节码](/ue5-bp/02-bytecode) —— 操作码全表与序列化格式
- [09 · FKismetPropertyPointer](/ue5-bp/09-property-pointer) —— 变量引用族的操作数
- [附录 · 出处清单](/ue5-bp/appendix/sources)
