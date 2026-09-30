---
title: 12 · 常用字节码详解（下）
---

# 12 · 常用字节码详解（下）

接[上篇](/ue5-bp/11-opcodes-a)（变量、常量、调用、赋值）。这一章覆盖控制流、执行流栈、类型转换、
结构与容器、委托，最后给一张**全 token 索引（UE 5.8）**。

::: tip 本章以 UE 5.8 为准
取值与注释出自 **CCB-TEAM 私有镜像的 Epic 官方 UE5 源码**（`release` 分支，`ENGINE 5.8.0`）的
`CoreUObject/Public/UObject/Script.h`；运行时的处理函数名出自同版本的 `ScriptCore.cpp`。
:::

---

## 五、控制流

| 操作码 | token | 操作数 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_Jump` | `0x06` | `uint CodeOffset` | `goto L_XXXX` | *Goto a local address in code.* |
| `EX_JumpIfNot` | `0x07` | `uint CodeOffset`、`KismetExpression BooleanExpression` | `if (!cond) goto L_XXXX` | *Goto if not expression.* |
| `EX_Return` | `0x04` | `KismetExpression ReturnExpression` | `return` / `return X` | *Return from function.* |
| `EX_ComputedJump` | `0x4E` | `KismetExpression CodeOffsetExpression` | `// switch (...)` | *Goto a local address in code, specified by an integer value.* |
| `EX_SwitchValue` | `0x69` | 见下 | `RenderSwitch(s)` | 无 |
| `EX_Nothing` | `0x0B` | 无 | 空 | *No operation.* |
| `EX_NothingInt32` | `0x0C` | `int32`（调试用） | 空 | *No operation with an int32 argument (useful for debugging script disassembly)* |
| `EX_EndOfScript` | `0x53` | 无 | 空 | *Last byte in script code* |
| `EX_Assert` | `0x09` | `ushort LineNumber`、`bool DebugMode`、`KismetExpression AssertExpression` | `assert(...)` | *Assertion.* |
| `EX_Skip` | `0x18` | `uint CodeOffset`、`KismetExpression SkipExpression` | — | *Skippable expression.* |
| `EX_SkipOffsetConst` | `0x5B` | 无 | — | *A CodeSizeSkipOffset constant* |

### `EX_JumpIfNot` 是 if 的全部

注意它的语义是「**条件不成立就跳**」。所以 `if (C) { body }` 编译出来是：

```
EX_JumpIfNot { BooleanExpression: C, CodeOffset: <body 之后> }
<body>
```

反编译器要还原成 `if (C)`，得把条件**取反**——这就是为什么本站反编译器里有一堆
分支极性判定逻辑（`f==t && inner.Follow==t` → 守卫式 `if (!cond) break;` 之类）。

（极性判定规则出自 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

运行时的实现印证了这个顺序（UE 5.8 `ScriptCore.cpp`）：

```cpp
DEFINE_FUNCTION(UObject::execJumpIfNot)
{
    CheckRunaway();
    // Get code offset.
    CodeSkipSizeType Offset = Stack.ReadCodeSkipCount();

    uint8 TempValue = 0;
    Stack.Step(Stack.Object, &TempValue);      // ★ 递归求值条件表达式
    const bool NewBoolValue = (TempValue != 0);
    // Jump if false.
    if (!NewBoolValue) { ... }
}
```

### `EX_ComputedJump` 是块边界

它渲染成一句注释 `// switch (...)`——因为它的目标是**运行时算出来的整数偏移**，
静态渲染不出具体 case。但它在**结构上极其重要**：

- ubergraph 的分发入口就是 `ComputedJump(EntryPoint)`；
- 如果解析器不把它当作**基本块边界**，分发体的每个 case 都切不出来，执行流栈会一路下溢。

本站踩过这个坑，实测数字见[第 03 章](/ue5-bp/03-decompile)。运行时的实现（UE 5.8）：

```cpp
DEFINE_FUNCTION(UObject::execComputedJump)
{
    CheckRunaway();
    // Get the jump offset expression
    int32 ComputedOffset = 0;
    Stack.Step( Stack.Object, &ComputedOffset );
    check((ComputedOffset < Stack.Node->Script.Num()) && (ComputedOffset >= 0));
    // Jump to the new offset
    Stack.Code = &Stack.Node->Script[ComputedOffset];
}
```

那句 `check(...)` 说明 **`EntryPoint` 就是 `Script` 数组里的字节下标**。

### `EX_SwitchValue` · `0x69` 的七个操作数

- `KismetExpression CaseIndexValueTerm`、`uint NextOffset`、`KismetExpression CaseTerm`、
  `uint EndGotoOffset`、`KismetExpression IndexTerm`、`KismetExpression DefaultTerm`、
  `FKismetSwitchCase[] Cases`

它是**唯一自带「跳转表」结构的操作码**：`Cases` 是 case 数组，`IndexTerm` 是被 switch 的值，
`DefaultTerm` 是 default 分支。UE 5.8 里它没有注释——**只能从实现里读语义**。

::: tip 渲染成空字符串的操作码，仍然要算偏移
`EX_Nothing`、`EX_NothingInt32`、`EX_EndOfScript`、`EX_Breakpoint`、`EX_Tracepoint`、
`EX_WireTracepoint`、`EX_InstrumentationEvent`、`EX_DeprecatedOp4A` 在反编译产物里**什么都不输出**。

但**它们占的字节一个都不能少算**——`GetSize` 错一个字节，后面所有 `CodeOffset` 全错位。
「不输出」不等于「不存在」。
:::

---

## 六、执行流栈

这三个操作码是全套字节码里最独特的设计：

| 操作码 | token | 操作数 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_PushExecutionFlow` | `0x4C` | `uint PushingAddress` | **空** | *push an address on to the execution flow stack for future execution when a `EX_PopExecutionFlow` is executed. Execution continues on normally and doesn't change to the pushed address.* |
| `EX_PopExecutionFlow` | `0x4D` | 无 | **空** | *continue execution at the last address previously pushed onto the execution flow stack.* |
| `EX_PopExecutionFlowIfNot` | `0x4F` | `KismetExpression BooleanExpression` | `if (!cond) break` | *continue execution at the last address previously pushed onto the execution flow stack, if the condition is not true.* |

三个必须记住的点：

1. **`Push` 不改变执行顺序**。它只是「记下这个地址，以后要用」，然后继续往下跑——
   这和 x86 的 `call` 完全不同（`call` 会跳过去）。
2. **`Pop` 才是跳转**，跳回最后一次 push 的地址。所以这是一个**后进先出的栈**。
3. **`Push`/`Pop` 在反编译产物里渲染成空**——你在伪代码里看不到它们，
   但它们是蓝图里「顺序执行节点」「延迟逻辑」的实现基础。

运行时的承载就是 `FFrame::FlowStack`（UE 5.8 `Stack.h`）：

```cpp
/** The execution flow stack for compiled Kismet code */
FlowStackType FlowStack;    // typedef TArray<CodeSkipSizeType, TInlineAllocator<8>>
```

本站反编译器的做法是先用 `FlowStackResolver` 把这一对解析成**静态跳转**，
再交给后面的 CFG 构建，而不是在渲染阶段硬猜语义。

（出自 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

::: warning 直译路线的处理方式不同
本站[直译模拟器](/kismet-sim/)不走「解析成静态跳转」这条路——它用一个真的
`Stack<int>` 加 `switch` 直接承载这个执行流栈，因为**压栈的目标地址是编译期常量**。
两条路线都成立，区别是可读性 vs 保真度。
:::

---

## 七、类型转换

### `EX_Cast` · `0x38` — 基本类型转换

**注意：UE4 里这个取值叫 `EX_PrimitiveCast`，UE 5.8 已改名为 `EX_Cast`**（语义注释未变）。

- 操作数：`ECastToken ConversionType`、`KismetExpression Target`
- 注释原文：*A casting operator which reads the type as the subsequent byte*
- 运行时处理函数：`execCast`

注释里那句 **「reads the type as the subsequent byte」**——`ConversionType` 是紧跟 token 的**一个字节**。

本站反编译器对它的处理（出自 [README](https://github.com/CCB-TEAM/KismetDecompiler)）：

- 数值隐式转换 token `3`/`4` → 渲染成 `(float)` / `(double)`（已用 UHT 签名交叉验证）；
- 类型检查语义 → 渲染成 `x != None`。

### `EX_CastBase` 家族 — 五种对象/接口转换

基类两个字段：`FPackageIndex ClassPtr`、`KismetExpression Target`；渲染统一为 `Cast<T>(target)`。

| 操作码 | token | 运行时处理函数 | 注释原文 |
|---|---|---|---|
| `EX_DynamicCast` | `0x2E` | `execDynamicCast` | *Safe dynamic class casting.* |
| `EX_MetaCast` | `0x13` | `execMetaCast` | *Metaclass cast.* |
| `EX_ObjToInterfaceCast` | `0x52` | `execInterfaceCast` | *Converting an object reference to native interface variable* |
| `EX_InterfaceToObjCast` | `0x55` | `execInterfaceToObject` | *Converting an interface variable reference to an object* |
| `EX_CrossInterfaceCast` | `0x54` | `execInterfaceToInterface` | *Converting an interface variable reference to native interface variable* |

（处理函数名出自 UE 5.8 `ScriptCore.cpp` 的 `IMPLEMENT_VM_FUNCTION` 注册表，见 [13 章](/ue5-bp/13-vm)）

**`EX_DynamicCast` 是蓝图里 `Cast To XXX` 节点的实现**，也是反编译产物里出现频率最高的转换。
它渲染成 `Cast<BP_HandCard>(self)` 这种形式。

---

## 八、结构与容器

### 成对出现的常量块

| 开始 | token | 结束 | token | 说明 |
|---|---|---|---|---|
| `EX_StructConst` | `0x2F` | `EX_EndStructConst` | `0x30` | *An arbitrary UStruct constant* / *End of UStruct constant* |
| `EX_SetArray` | `0x31` | `EX_EndArray` | `0x32` | *Set the value of arbitrary array* |
| `EX_SetSet` | `0x39` | `EX_EndSet` | `0x3A` | Set 字面量（UE5 新增） |
| `EX_SetMap` | `0x3B` | `EX_EndMap` | `0x3C` | Map 字面量（UE5 新增） |
| `EX_SetConst` | `0x3D` | `EX_EndSetConst` | `0x3E` | Set 常量（UE5 新增） |
| `EX_MapConst` | `0x3F` | `EX_EndMapConst` | `0x40` | Map 常量（UE5 新增） |
| `EX_ArrayConst` | `0x65` | `EX_EndArrayConst` | `0x66` | 无注释 |

`EX_StructConst` 的操作数是 `FPackageIndex Struct`（结构类型）+ `int StructSize`（**这个常量占多少字节**），
后面跟各字段的表达式，直到 `EX_EndStructConst`。

::: warning 为什么需要 `StructSize`
因为结构常量的内容长度**不固定**——不同结构字段数不同。
`StructSize` 让解析器能跳过不认识的结构常量。**这也是唯一一处「长度写在前面」的设计**。
:::

### 成员访问

| 操作码 | token | 操作数 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_StructMemberContext` | `0x42` | `KismetPropertyPointer StructMemberExpression`、`KismetExpression StructExpression` | `{StructExpression}.{成员}` | *Context expression to address a property within a struct* |
| `EX_ArrayGetByRef` | `0x6B` | `KismetExpression ArrayVariable`、`KismetExpression ArrayIndex` | `{ArrayVariable}[{ArrayIndex}]` | 无 |
| `EX_PropertyConst` | `0x33` | `KismetPropertyPointer Property` | 属性路径 | *FProperty constant.* |
| `EX_FieldPathConst` | `0x6D` | `KismetExpression`（泛型 `Value`） | — | 无 |
| `EX_BitFieldConst` | `0x11` | `KismetPropertyPointer Property`、`byte Value` | `{属性}:{值}` | *assign to a single bit, defined by an FProperty* |
| `EX_Vector3fConst` | `0x41` | `float X`、`float Y`、`float Z` | `(x, y, z)` | *A float vector constant.* |

`EX_StructMemberContext` 是**「一个指针 + 一个表达式」**的组合：指针说「取哪个字段」，
表达式说「从哪个结构上取」。见[第 09 章](/ue5-bp/09-property-pointer)。

---

## 九、委托

| 操作码 | token | 操作数 | 渲染 | 注释原文 |
|---|---|---|---|---|
| `EX_AddMulticastDelegate` | `0x5C` | `KismetExpression Delegate`、`KismetExpression DelegateToAdd` | `{Delegate}.Add({DelegateToAdd})` | *Adds a delegate to a multicast delegate's targets* |
| `EX_RemoveMulticastDelegate` | `0x62` | 同上 | `{Delegate}.Remove({DelegateToAdd})` | *Remove a delegate from a multicast delegate's targets* |
| `EX_ClearMulticastDelegate` | `0x5D` | `KismetExpression DelegateToClear` | `{DelegateToClear}.Clear()` | *Clears all delegates in a multicast target* |
| `EX_CallMulticastDelegate` | `0x63` | `KismetExpression Delegate`（+ `StackNode` / `Parameters`） | `{Delegate}.{函数}({参数})` | *Call multicast delegate* |
| `EX_BindDelegate` | `0x61` | `FName FunctionName`、`KismetExpression Delegate`、`KismetExpression ObjectTerm` | `{Delegate}.BindUFunction({ObjectTerm}, "{名字}")` | *bind object and name to delegate* |
| `EX_InstanceDelegate` | `0x4B` | `FName FunctionName` | 函数名 | *const reference to a delegate or normal function object* |

委托相关的赋值走 `EX_LetDelegate` / `EX_LetMulticastDelegate`（见[上篇](/ue5-bp/11-opcodes-a)）。

---

## 十、调试、事务内存与杂项

| 操作码 | token | 说明 |
|---|---|---|
| `EX_Breakpoint` | `0x50` | *Breakpoint. Only observed in the editor, otherwise it behaves like `EX_Nothing`.* |
| `EX_Tracepoint` | `0x5E` | *Trace point. Only observed in the editor, otherwise it behaves like `EX_Nothing`.* |
| `EX_WireTracepoint` | `0x5A` | 同上（蓝图连线上的调试点） |
| `EX_InstrumentationEvent` | `0x6A` | *Instrumentation event*；操作数 `EScriptInstrumentationType EventType`、`FName EventName` |
| `EX_DeprecatedOp4A` | `0x4A` | 已废弃的占位值 |

### UE5 新增：AutoRTFM 事务内存

| 操作码 | token | 注释原文 |
|---|---|---|
| `EX_AutoRtfmTransact` | `0x70` | *AutoRTFM: run following code in a transaction* |
| `EX_AutoRtfmStopTransact` | `0x71` | *AutoRTFM: if in a transaction, abort or break, otherwise no operation* |
| `EX_AutoRtfmAbortIfNot` | `0x72` | *AutoRTFM: evaluate bool condition, abort transaction on false* |
| `EX_AutoRtfmAbort` | `0x73` | *AutoRTFM: abort transaction* |

AutoRTFM（Automatic Runtime Transactional Function Memory）是 UE5 引入的**事务内存**机制——
这四个操作码就是它在字节码层面的体现。**UE4 的解析器完全不知道它们的存在。**

上面这些调试类操作码在打包后的游戏里通常**不出现**（编辑器专用），但解析器仍要能跳过它们。

---

## 附：全 token 索引（UE 5.8）

按取值排序的完整列表，取自 UE 5.8 `Script.h`。**「详解」列指向本章或上篇的小节**；
标「未详解」的是实践中很少遇到的。

| token | 操作码 | 详解 |
|---|---|---|
| `0x00` | `EX_LocalVariable` | [上篇 · 变量引用](/ue5-bp/11-opcodes-a) |
| `0x01` | `EX_InstanceVariable` | [上篇 · 变量引用](/ue5-bp/11-opcodes-a) |
| `0x02` | `EX_DefaultVariable` | [上篇 · 变量引用](/ue5-bp/11-opcodes-a) |
| `0x04` | `EX_Return` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x06` | `EX_Jump` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x07` | `EX_JumpIfNot` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x09` | `EX_Assert` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x0B` | `EX_Nothing` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x0C` | `EX_NothingInt32` ★ | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x0F` | `EX_Let` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x11` | `EX_BitFieldConst` ★ | [本章 · 成员访问](/ue5-bp/12-opcodes-b) |
| `0x12` | `EX_ClassContext` | [上篇 · 上下文调用](/ue5-bp/11-opcodes-a) |
| `0x13` | `EX_MetaCast` | [本章 · 类型转换](/ue5-bp/12-opcodes-b) |
| `0x14` | `EX_LetBool` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x15` | `EX_EndParmValue` | [上篇 · 终止符](/ue5-bp/11-opcodes-a) |
| `0x16` | `EX_EndFunctionParms` | [上篇 · 终止符](/ue5-bp/11-opcodes-a) |
| `0x17` | `EX_Self` | [上篇 · 变量引用](/ue5-bp/11-opcodes-a) |
| `0x18` | `EX_Skip` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x19` | `EX_Context` | [上篇 · 上下文调用](/ue5-bp/11-opcodes-a) |
| `0x1A` | `EX_Context_FailSilent` | [上篇 · 上下文调用](/ue5-bp/11-opcodes-a) |
| `0x1B` | `EX_VirtualFunction` | [上篇 · 函数调用](/ue5-bp/11-opcodes-a) |
| `0x1C` | `EX_FinalFunction` | [上篇 · 函数调用](/ue5-bp/11-opcodes-a) |
| `0x1D` | `EX_IntConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x1E` | `EX_FloatConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x1F` | `EX_StringConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x20` | `EX_ObjectConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x21` | `EX_NameConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x22` | `EX_RotationConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x23` | `EX_VectorConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x24` | `EX_ByteConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x25` | `EX_IntZero` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x26` | `EX_IntOne` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x27` | `EX_True` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x28` | `EX_False` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x29` | `EX_TextConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x2A` | `EX_NoObject` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x2B` | `EX_TransformConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x2C` | `EX_IntConstByte` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x2D` | `EX_NoInterface` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x2E` | `EX_DynamicCast` | [本章 · 类型转换](/ue5-bp/12-opcodes-b) |
| `0x2F` | `EX_StructConst` | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x30` | `EX_EndStructConst` | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x31` | `EX_SetArray` | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x32` | `EX_EndArray` | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x33` | `EX_PropertyConst` ★ | [本章 · 成员访问](/ue5-bp/12-opcodes-b) |
| `0x34` | `EX_UnicodeStringConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x35` | `EX_Int64Const` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x36` | `EX_UInt64Const` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x37` | `EX_DoubleConst` ★ | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x38` | `EX_Cast` | [本章 · 类型转换](/ue5-bp/12-opcodes-b) |
| `0x39` | `EX_SetSet` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x3A` | `EX_EndSet` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x3B` | `EX_SetMap` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x3C` | `EX_EndMap` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x3D` | `EX_SetConst` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x3E` | `EX_EndSetConst` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x3F` | `EX_MapConst` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x40` | `EX_EndMapConst` ★ | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x41` | `EX_Vector3fConst` ★ | [本章 · 成员访问](/ue5-bp/12-opcodes-b) |
| `0x42` | `EX_StructMemberContext` | [本章 · 成员访问](/ue5-bp/12-opcodes-b) |
| `0x43` | `EX_LetMulticastDelegate` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x44` | `EX_LetDelegate` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x45` | `EX_LocalVirtualFunction` ★ | [上篇 · 函数调用](/ue5-bp/11-opcodes-a) |
| `0x46` | `EX_LocalFinalFunction` ★ | [上篇 · 函数调用](/ue5-bp/11-opcodes-a) |
| `0x48` | `EX_LocalOutVariable` | [上篇 · 变量引用](/ue5-bp/11-opcodes-a) |
| `0x4A` | `EX_DeprecatedOp4A` | 未详解（已废弃） |
| `0x4B` | `EX_InstanceDelegate` | [本章 · 委托](/ue5-bp/12-opcodes-b) |
| `0x4C` | `EX_PushExecutionFlow` | [本章 · 执行流栈](/ue5-bp/12-opcodes-b) |
| `0x4D` | `EX_PopExecutionFlow` | [本章 · 执行流栈](/ue5-bp/12-opcodes-b) |
| `0x4E` | `EX_ComputedJump` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x4F` | `EX_PopExecutionFlowIfNot` | [本章 · 执行流栈](/ue5-bp/12-opcodes-b) |
| `0x50` | `EX_Breakpoint` | [本章 · 调试与杂项](/ue5-bp/12-opcodes-b) |
| `0x51` | `EX_InterfaceContext` | [上篇 · 上下文调用](/ue5-bp/11-opcodes-a) |
| `0x52` | `EX_ObjToInterfaceCast` | [本章 · 类型转换](/ue5-bp/12-opcodes-b) |
| `0x53` | `EX_EndOfScript` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x54` | `EX_CrossInterfaceCast` | [本章 · 类型转换](/ue5-bp/12-opcodes-b) |
| `0x55` | `EX_InterfaceToObjCast` | [本章 · 类型转换](/ue5-bp/12-opcodes-b) |
| `0x5A` | `EX_WireTracepoint` | [本章 · 调试与杂项](/ue5-bp/12-opcodes-b) |
| `0x5B` | `EX_SkipOffsetConst` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x5C` | `EX_AddMulticastDelegate` | [本章 · 委托](/ue5-bp/12-opcodes-b) |
| `0x5D` | `EX_ClearMulticastDelegate` | [本章 · 委托](/ue5-bp/12-opcodes-b) |
| `0x5E` | `EX_Tracepoint` | [本章 · 调试与杂项](/ue5-bp/12-opcodes-b) |
| `0x5F` | `EX_LetObj` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x60` | `EX_LetWeakObjPtr` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x61` | `EX_BindDelegate` | [本章 · 委托](/ue5-bp/12-opcodes-b) |
| `0x62` | `EX_RemoveMulticastDelegate` | [本章 · 委托](/ue5-bp/12-opcodes-b) |
| `0x63` | `EX_CallMulticastDelegate` | [本章 · 委托](/ue5-bp/12-opcodes-b) |
| `0x64` | `EX_LetValueOnPersistentFrame` | [上篇 · 赋值](/ue5-bp/11-opcodes-a) |
| `0x65` | `EX_ArrayConst` | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x66` | `EX_EndArrayConst` | [本章 · 结构与容器](/ue5-bp/12-opcodes-b) |
| `0x67` | `EX_SoftObjectConst` | [上篇 · 常量](/ue5-bp/11-opcodes-a) |
| `0x68` | `EX_CallMath` | [上篇 · 函数调用](/ue5-bp/11-opcodes-a) |
| `0x69` | `EX_SwitchValue` | [本章 · 控制流](/ue5-bp/12-opcodes-b) |
| `0x6A` | `EX_InstrumentationEvent` | [本章 · 调试与杂项](/ue5-bp/12-opcodes-b) |
| `0x6B` | `EX_ArrayGetByRef` | [本章 · 成员访问](/ue5-bp/12-opcodes-b) |
| `0x6C` | `EX_ClassSparseDataVariable` ★ | [上篇 · 变量引用](/ue5-bp/11-opcodes-a) |
| `0x6D` | `EX_FieldPathConst` ★ | [本章 · 成员访问](/ue5-bp/12-opcodes-b) |
| `0x70` | `EX_AutoRtfmTransact` ★ | [本章 · 事务内存](/ue5-bp/12-opcodes-b) |
| `0x71` | `EX_AutoRtfmStopTransact` ★ | [本章 · 事务内存](/ue5-bp/12-opcodes-b) |
| `0x72` | `EX_AutoRtfmAbortIfNot` ★ | [本章 · 事务内存](/ue5-bp/12-opcodes-b) |
| `0x73` | `EX_AutoRtfmAbort` ★ | [本章 · 事务内存](/ue5-bp/12-opcodes-b) |
| `0xFF` | `EX_Max` | 枚举上界，非实际操作码 |

标 **★** 的是 UE4 表里没有的取值（共 22 个）。

::: warning 空档在哪：`0x6E`–`0x6F` 与 `0x74`–`0xFE`
引擎自己用到了 `0x6D`，`0x70`–`0x73` 被 AutoRTFM 占用。所以**厂商能塞自定义指令的空间是这两段**——
鸣潮的 `EX_6E`/`EX_6F` 正好落在前一段，Borderlands 4 的 `EX_FD`/`EX_FE` 在后一段，
见 [第 05 章 · 罕见之处](/ue5-bp/05-pitfalls)。
:::

## 相关

- [11 · 常用字节码详解（上）](/ue5-bp/11-opcodes-a)
- [02 · Kismet 字节码](/ue5-bp/02-bytecode) —— 序列化格式与 UE4→UE5 差异表
- [03 · 反编译](/ue5-bp/03-decompile) —— 这些操作码如何被还原成控制流
- [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm) —— 每个操作码对应哪个运行时处理函数
- [附录 · 出处清单](/ue5-bp/appendix/sources)
