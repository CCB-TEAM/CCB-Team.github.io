---
title: 02 · Kismet 字节码
---

# 02 · Kismet 字节码

Kismet 字节码**不是机器码，也不是栈式虚拟机指令**——它是一棵**带结构化跳转的表达式树**，
被线性序列化成字节流。理解这一点，后面所有事情都顺了。

::: tip 本章以 UE 5.8 为准
下表取自 **CCB-TEAM 私有镜像的 Epic 官方 UE5 源码**（`release` 分支，`ENGINE 5.8.0`）的
`CoreUObject/Public/UObject/Script.h`，注释为原文。

**不要拿 UE4 的表来读 UE5 的字节码**——[本章末尾](#ue4--ue-58-的差异)列了全部会读错的位置。
:::

## 操作码：EExprToken

| 分组 | 操作码（UE 5.8 取值） |
|---|---|
| **变量** | `EX_LocalVariable` 0x00（局部变量）、`EX_InstanceVariable` 0x01（对象变量）、`EX_DefaultVariable` 0x02（类上下文的默认值）、`EX_LocalOutVariable` 0x48（按引用传递的 out 参数）、`EX_Self` 0x17、`EX_ClassSparseDataVariable` 0x6C ★ |
| **常量** | `EX_IntConst` 0x1D、`EX_IntConstByte` 0x2C、`EX_Int64Const` 0x35、`EX_UInt64Const` 0x36、`EX_FloatConst` 0x1E、`EX_DoubleConst` 0x37 ★、`EX_StringConst` 0x1F、`EX_UnicodeStringConst` 0x34、`EX_ObjectConst` 0x20、`EX_SoftObjectConst` 0x67 ★、`EX_NameConst` 0x21、`EX_TextConst` 0x29、`EX_VectorConst` 0x23、`EX_Vector3fConst` 0x41 ★、`EX_RotationConst` 0x22、`EX_TransformConst` 0x2B、`EX_ByteConst` 0x24、`EX_PropertyConst` 0x33 ★、`EX_FieldPathConst` 0x6D ★、`EX_BitFieldConst` 0x11 ★、`EX_IntZero` 0x25、`EX_IntOne` 0x26、`EX_True` 0x27、`EX_False` 0x28、`EX_NoObject` 0x2A、`EX_NoInterface` 0x2D |
| **控制流** | `EX_Return` 0x04、`EX_Jump` 0x06、`EX_JumpIfNot` 0x07、`EX_ComputedJump` 0x4E、`EX_SwitchValue` 0x69、`EX_EndOfScript` 0x53、`EX_Assert` 0x09、`EX_Skip` 0x18、`EX_SkipOffsetConst` 0x5B |
| **函数调用** | `EX_Context` 0x19、`EX_Context_FailSilent` 0x1A、`EX_ClassContext` 0x12、`EX_InterfaceContext` 0x51、`EX_VirtualFunction` 0x1B、`EX_FinalFunction` 0x1C、`EX_LocalVirtualFunction` 0x45 ★、`EX_LocalFinalFunction` 0x46 ★、`EX_CallMath` 0x68、`EX_EndFunctionParms` 0x16、`EX_EndParmValue` 0x15 |
| **赋值** | `EX_Let` 0x0F、`EX_LetBool` 0x14、`EX_LetObj` 0x5F、`EX_LetWeakObjPtr` 0x60、`EX_LetDelegate` 0x44、`EX_LetMulticastDelegate` 0x43、`EX_LetValueOnPersistentFrame` 0x64 |
| **类型转换** | `EX_MetaCast` 0x13、`EX_DynamicCast` 0x2E、**`EX_Cast` 0x38**（UE4 叫 `EX_PrimitiveCast`）、`EX_ObjToInterfaceCast` 0x52、`EX_CrossInterfaceCast` 0x54、`EX_InterfaceToObjCast` 0x55 |
| **结构 / 容器** | `EX_StructConst` 0x2F + `EX_EndStructConst` 0x30、`EX_SetArray` 0x31 + `EX_EndArray` 0x32、`EX_ArrayConst` 0x65 + `EX_EndArrayConst` 0x66、`EX_SetSet` 0x39 + `EX_EndSet` 0x3A ★、`EX_SetMap` 0x3B + `EX_EndMap` 0x3C ★、`EX_SetConst` 0x3D + `EX_EndSetConst` 0x3E ★、`EX_MapConst` 0x3F + `EX_EndMapConst` 0x40 ★、`EX_StructMemberContext` 0x42、`EX_ArrayGetByRef` 0x6B |
| **委托** | `EX_AddMulticastDelegate` 0x5C、`EX_ClearMulticastDelegate` 0x5D、`EX_BindDelegate` 0x61、`EX_RemoveMulticastDelegate` 0x62、`EX_CallMulticastDelegate` 0x63、`EX_InstanceDelegate` 0x4B |
| **执行流栈** | `EX_PushExecutionFlow` 0x4C、`EX_PopExecutionFlow` 0x4D、`EX_ComputedJump` 0x4E、`EX_PopExecutionFlowIfNot` 0x4F |
| **事务内存** ★ | `EX_AutoRtfmTransact` 0x70、`EX_AutoRtfmStopTransact` 0x71、`EX_AutoRtfmAbortIfNot` 0x72、`EX_AutoRtfmAbort` 0x73 |
| **调试 / 杂项** | `EX_Nothing` 0x0B、`EX_NothingInt32` 0x0C ★、`EX_DeprecatedOp4A` 0x4A、`EX_Breakpoint` 0x50、`EX_WireTracepoint` 0x5A、`EX_Tracepoint` 0x5E、`EX_InstrumentationEvent` 0x6A |

标 **★** 的是 UE4 表里**没有**的取值。枚举上界是 `EX_Max = 0xFF`。

::: warning 空档是 0x6E–0xFE，不是 0x6C–0xFF
引擎自己用到了 `0x6D`（`EX_FieldPathConst`），而 `0x70`–`0x73` 被 AutoRTFM 占用。
**厂商可用的空间是 `0x6E`–`0x6F` 与 `0x74`–`0xFE`**——鸣潮的 `EX_6E`/`EX_6F` 正好落在前者，
见 [05 · 罕见之处](/ue5-bp/05-pitfalls)。
:::

## 序列化格式：树，不是栈

和 x86 对比最能说明问题：

| | x86 汇编 | Kismet 字节码 |
|---|---|---|
| 单元 | 指令 | **表达式**（一个 token + 它的操作数） |
| 跳转 | `jmp 地址`，目标要自己重建 CFG | `EX_JumpIfNot { BooleanExpression, CodeOffset }`——**偏移是表达式自带的字段** |
| 参数 | 压栈 / 寄存器约定 | 顺序读取，直到遇到 `EX_EndFunctionParms`（0x16） |
| 结束 | 无显式标记 | `EX_EndOfScript`（0x53） |

所以本站直译项目里那句结论是有依据的：**「不需要重建控制流图」**——
因为跳转目标就写在节点里，逐条翻译成 `if (!cond) goto L_1234;` 即可。

（相关推理与实测见 [直译模拟器 01](/kismet-sim/01-why-ast)）

### 参数列表怎么结束

`EX_EndFunctionParms` 是参数列表的终止符。还有一个细节：可选参数有默认值时，
用 `EX_EndParmValue`（0x15，注释原文：*end of default value for optional function parameter*）分隔。
**解析函数调用时，这两个 token 必须处理对**，否则参数个数会错位。

运行时的 VM 也在依赖这个约定——它在读完参数后会自检：

```cpp
checkSlow(*Stack.Code==EX_EndFunctionParms);
```

（UE 5.8 `ScriptCore.cpp`，详见 [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm)）

## 执行流栈四件套

这是 Kismet 里最独特、也最容易把人绕晕的部分。四个操作码的官方注释已经把语义说完了：

```
EX_PushExecutionFlow  = 0x4C, // push an address on to the execution flow stack for future
                              // execution when a EX_PopExecutionFlow is executed. Execution
                              // continues on normally and doesn't change to the pushed address.
EX_PopExecutionFlow   = 0x4D, // continue execution at the last address previously pushed onto
                              // the execution flow stack.
EX_ComputedJump       = 0x4E, // Goto a local address in code, specified by an integer value.
EX_PopExecutionFlowIfNot = 0x4F, // continue execution at the last address previously pushed onto
                                 // the execution flow stack, if the condition is not true.
```

（UE 5.8 `Script.h`）

要点：

- `Push` **不改变执行顺序**——它只是「记下这个地址，以后要用」，然后继续往下跑；
- `Pop` 才是真正的跳转，跳回最后一次 push 的地址；
- 这构成一个**后进先出的执行流栈**，蓝图里的顺序执行节点（sequence）与延迟逻辑就靠它实现。

**运行时的实现**就是 `FFrame::FlowStack` 这个 `TArray`（`Stack.h`）：

```cpp
typedef TArray< CodeSkipSizeType, TInlineAllocator<8> > FlowStackType;
// ...
DEFINE_FUNCTION(UObject::execPushExecutionFlow)
{
    // Read a code offset and push it onto the flow stack
    CodeSkipSizeType Offset = Stack.ReadCodeSkipCount();
    Stack.FlowStack.Push(Offset);
}
```

（UE 5.8 `ScriptCore.cpp`，完整链路见 [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm)）

::: warning 反编译器最容易在这里翻车
`EX_ComputedJump` 的注释写着「跳到一个由**整数值**指定的本地地址」——
这正是 ubergraph 分发体的入口形态：`ComputedJump(EntryPoint)`，其中 `EntryPoint` 就是字节偏移。

如果一个反编译器把 `EX_ComputedJump` 当成**普通顺序执行语句**、不把它当作基本块边界，
那么分发体的每个 case 都不会被切出来，执行流栈会一路下溢。
本站就踩过这个坑，实测数字见 [03 · 反编译](/ue5-bp/03-decompile)。
:::

## 偏移与对齐

字节码里的跳转目标、`EntryPoint` 都是**字节偏移**，所以反编译器必须精确知道每个表达式占多少字节：

> `EX_*` 表达式的字节偏移用 `GetSize(asset)` 累计，与 `CodeOffset` / `EntryPoint` 精确对齐。

（出自本站 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

运行时读偏移的方式印证了这一点（UE 5.8 `Stack.h`）：

```cpp
inline CodeSkipSizeType FFrame::ReadCodeSkipCount()
{
    CodeSkipSizeType Result = FPlatformMemory::ReadUnaligned<CodeSkipSizeType>(Code);
    Code += sizeof(CodeSkipSizeType);
    return Result;
}
```

**两边算的必须是同一个偏移**：离线反编译用 `GetSize` 累计，在线 VM 用 `Code` 游标递增。
差一个字节，跳转目标就全错——而错位的结果往往不是崩溃，是**看起来正常但逻辑不对的伪代码**。

## UE4 → UE 5.8 的差异

拿 UE4 的表读 UE 5.8 的字节码，会在下面这些位置读错：

| 取值 | UE4 | UE 5.8 | 后果 |
|---|---|---|---|
| `0x0C` | — | `EX_NothingInt32` | UE4 解析器会当成未知 token |
| `0x11` | — | `EX_BitFieldConst` | 同上 |
| `0x33` | — | `EX_PropertyConst` | UE4 表里这一格是空的 |
| `0x37` | — | `EX_DoubleConst` | 同上 |
| `0x38` | `EX_PrimitiveCast` | **`EX_Cast`** | **同一个值、不同名字**（语义注释相同） |
| `0x39`–`0x3C` | — | `EX_SetSet` / `EX_EndSet` / `EX_SetMap` / `EX_EndMap` | 新增 |
| `0x3D`–`0x40` | — | `EX_SetConst` / `EX_EndSetConst` / `EX_MapConst` / `EX_EndMapConst` | 新增 |
| `0x41` | — | `EX_Vector3fConst` | 新增 |
| `0x45` / `0x46` | — | `EX_LocalVirtualFunction` / `EX_LocalFinalFunction` | 新增 |
| `0x67` | `EX_AssetConst` | **`EX_SoftObjectConst`** | **含义被替换** |
| `0x6C` / `0x6D` | — | `EX_ClassSparseDataVariable` / `EX_FieldPathConst` | 新增 |
| `0x70`–`0x73` | — | `EX_AutoRtfm*` | 新增 |
| 上界 | `EX_Max = 0x100` | **`EX_Max = 0xFF`** | 分派表大小不同 |

::: tip 为什么「照抄一张操作码表」注定过时
上面 13 行里有 11 行是 UE5 才出现的。**操作码表本身在演进**，所以任何按固定表解析的代码都要有
「遇到未知 token 怎么办」的策略——报错、跳过（如果长度可算）、还是猜，三者都会出错，
区别只是错得明不明显。
:::

## 相关

- [01 · 蓝图资产里存了什么](/ue5-bp/01-anatomy)
- [03 · 反编译](/ue5-bp/03-decompile)
- [11](/ue5-bp/11-opcodes-a) / [12 · 常用字节码详解](/ue5-bp/12-opcodes-b) —— 逐个操作码的操作数与语义
- [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm) —— 这些操作码在运行时由哪个函数执行
- [附录 · 出处清单](/ue5-bp/appendix/sources)
