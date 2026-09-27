---
title: 02 · Kismet 字节码
---

# 02 · Kismet 字节码

Kismet 字节码**不是机器码，也不是栈式虚拟机指令**——它是一棵**带结构化跳转的表达式树**，
被线性序列化成字节流。理解这一点，后面所有事情都顺了。

## 操作码：EExprToken

操作码定义在引擎的 `Script.h` 里，枚举名是 `EExprToken`。下面是公开源码里的完整取值
（[`Script.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Script.h)，
注释为原文）：

| 分组 | 操作码 |
|---|---|
| **变量** | `EX_LocalVariable` 0x00（局部变量）、`EX_InstanceVariable` 0x01（对象变量）、`EX_DefaultVariable` 0x02（类上下文的默认值）、`EX_LocalOutVariable` 0x48（按引用传递的 out 参数） |
| **常量** | `EX_IntConst` 0x1D、`EX_FloatConst` 0x1E、`EX_StringConst` 0x1F、`EX_ObjectConst` 0x20、`EX_NameConst` 0x21、`EX_RotationConst` 0x22、`EX_VectorConst` 0x23、`EX_ByteConst` 0x24、`EX_IntZero` 0x25、`EX_IntOne` 0x26、`EX_True` 0x27、`EX_False` 0x28、`EX_TextConst` 0x29、`EX_TransformConst` 0x2B、`EX_IntConstByte` 0x2C、`EX_UnicodeStringConst` 0x34、`EX_Int64Const` 0x35、`EX_UInt64Const` 0x36、`EX_AssetConst` 0x67 |
| **控制流** | `EX_Return` 0x04、`EX_Jump` 0x06、`EX_JumpIfNot` 0x07、`EX_ComputedJump` 0x4E、`EX_SwitchValue` 0x69、`EX_EndOfScript` 0x53 |
| **函数调用** | `EX_Context` 0x19、`EX_Context_FailSilent` 0x1A、`EX_VirtualFunction` 0x1B、`EX_FinalFunction` 0x1C、`EX_CallMath` 0x68、`EX_EndFunctionParms` 0x16、`EX_Self` 0x17 |
| **赋值** | `EX_Let` 0x0F、`EX_LetBool` 0x14、`EX_LetObj` 0x5F、`EX_LetWeakObjPtr` 0x60、`EX_LetMulticastDelegate` 0x43、`EX_LetDelegate` 0x44、`EX_LetValueOnPersistentFrame` 0x64 |
| **类型转换** | `EX_MetaCast` 0x13、`EX_DynamicCast` 0x2E、`EX_PrimitiveCast` 0x38、`EX_ObjToInterfaceCast` 0x52、`EX_CrossInterfaceCast` 0x54、`EX_InterfaceToObjCast` 0x55 |
| **结构 / 容器** | `EX_StructConst` 0x2F + `EX_EndStructConst` 0x30、`EX_SetArray` 0x31 + `EX_EndArray` 0x32、`EX_ArrayConst` 0x65 + `EX_EndArrayConst` 0x66、`EX_StructMemberContext` 0x42、`EX_ArrayGetByRef` 0x6B |
| **委托** | `EX_AddMulticastDelegate` 0x5C、`EX_ClearMulticastDelegate` 0x5D、`EX_BindDelegate` 0x61、`EX_RemoveMulticastDelegate` 0x62、`EX_CallMulticastDelegate` 0x63、`EX_InstanceDelegate` 0x4B |
| **执行流栈** | `EX_PushExecutionFlow` 0x4C、`EX_PopExecutionFlow` 0x4D、`EX_ComputedJump` 0x4E、`EX_PopExecutionFlowIfNot` 0x4F |
| **调试 / 杂项** | `EX_Assert` 0x09、`EX_Nothing` 0x0B、`EX_Skip` 0x18、`EX_Breakpoint` 0x50、`EX_WireTracepoint` 0x5A、`EX_SkipOffsetConst` 0x5B、`EX_Tracepoint` 0x5E、`EX_InstrumentationEvent` 0x6A |

枚举最后是 `EX_Max = 0x100`。**注意 0x6B 到 0xFF 之间是一大片空档**——厂商的自定义指令就塞在这里，
见 [05 · 罕见之处](/ue5-bp/05-pitfalls)。

::: tip 操作码还在增加
UAssetAPI 维护的 UE5 侧枚举里有两个公开 UE4 源码里没有的取值：

```
EX_NothingInt32 = 0x0C,
EX_BitFieldConst = 0x11,
```

（出自 [`UAssetAPI/Kismet/Bytecode/EExprToken.cs`](https://github.com/atenfyr/UAssetAPI/blob/master/UAssetAPI/Kismet/Bytecode/EExprToken.cs)）

也就是说**「操作码表」本身也是随版本增长的**，任何按固定表解析的代码都要有「遇到未知 token 怎么办」的策略。
:::

## 序列化格式：树，不是栈

和 x86 对比最能说明问题：

| | x86 汇编 | Kismet 字节码 |
|---|---|---|
| 单元 | 指令 | **表达式**（一个 token + 它的操作数） |
| 跳转 | `jmp 地址`，目标要自己重建 CFG | `EX_JumpIfNot { Condition, CodeOffset }`——**偏移是表达式自带的字段** |
| 参数 | 压栈 / 寄存器约定 | 顺序读取，直到遇到 `EX_EndFunctionParms`（0x16） |
| 结束 | 无显式标记 | `EX_EndOfScript`（0x53） |

所以本站直译项目里那句结论是有依据的：**「不需要重建控制流图」**——
因为跳转目标就写在节点里，逐条翻译成 `if (!cond) goto L_1234;` 即可。

（相关推理与实测见 [直译模拟器 01](/kismet-sim/01-why-ast)）

### 参数列表怎么结束

`EX_EndFunctionParms` 是参数列表的终止符。还有一个细节：可选参数有默认值时，
用 `EX_EndParmValue`（0x15，注释原文：*end of default value for optional function parameter*）分隔。
**解析函数调用时，这两个 token 必须处理对**，否则参数个数会错位。

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

（出自 [`Script.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Script.h)）

要点：

- `Push` **不改变执行顺序**——它只是「记下这个地址，以后要用」，然后继续往下跑；
- `Pop` 才是真正的跳转，跳回最后一次 push 的地址；
- 这构成一个**后进先出的执行流栈**，蓝图里的顺序执行节点（sequence）与延迟逻辑就靠它实现。

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

这一条决定了工具必须**先能正确解析、才能正确渲染**：`GetSize` 错一个字节，后面所有跳转目标全错位——
而错位的结果往往不是崩溃，是**看起来正常但逻辑不对的伪代码**。

## 相关

- [01 · 蓝图资产里存了什么](/ue5-bp/01-anatomy)
- [03 · 反编译](/ue5-bp/03-decompile)
- [05 · 罕见之处](/ue5-bp/05-pitfalls) —— 0x6C–0xFF 空档里被塞了什么
- [附录 · 出处清单](/ue5-bp/appendix/sources)
