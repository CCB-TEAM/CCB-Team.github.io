---
title: 01 · 为什么是 AST，不是伪代码
---

# 01 · 为什么是 AST，不是伪代码

## 先说结论

| 方案 | 结果 |
|---|---|
| 读卡面文本、正则匹配效果 | **必然失败**。只能覆盖简单卡，且永远有偏差 |
| 读反编译出来的伪代码 | **不可靠**。伪代码是有损渲染，边界情况丢信息 |
| 读 UAssetAPI 解析好的 Kismet AST | ✅ 无损，可以 1:1 映射成目标语言 |

一句话：**能拿到 AST 就别看文本**。文本是给眼睛的，AST 是给机器的。

## 为什么伪代码不行

反编译器（比如我们自己的 [KismetDecompiler](/projects/kismetdecompiler)）
把 AST 渲染成 C++ 风格伪代码，做控制流结构化、if/else 还原、命名简化。
这些对**人读**是加分，对**机器翻译**全是噪音：

- 结构化还原会引入新的临时变量和重排，跳转目标不再一一对应
- 优化会折叠表达式，原本分开的两次调用可能看起来像一次
- 遇到还原不了的边界情况会降级成 `goto` 或占位符（`[stack=?]`）

最要命的是**你不容易发现它错了** —— 伪代码看起来永远合理。

## AST 为什么可以

UAssetAPI 已经把 `FunctionExport.ScriptBytecode` 解析成
`KismetExpression[]`，这是一个真正的表达式树，不是文本。

而 Kismet 字节码的特殊之处在于：**它自带结构化跳转**。
汇编里只有 `jmp` + 地址，要重建 CFG 才能还原 `if/while`；
但 Kismet 里跳转是带偏移的表达式节点：

```
EX_JumpIfNot { Condition, CodeOffset }
EX_Jump      { CodeOffset }
EX_ComputedJump { CodeOffsetExpression }
```

于是翻译是逐条对应的：

```
Kismet:   EX_JumpIfNot(cond, 0x1234);  body;  0x1234: next;
C#:       if (!cond) goto L_1234;      body;  L_1234: next;
```

**不需要重建控制流图。**

连最麻烦的"执行流栈"（`EX_PushExecutionFlow` / `EX_PopExecutionFlow` /
`EX_PopExecutionFlowIfNot`）都不用猜语义 —— 用一个真的 `Stack<int>` 加 `switch`
承载就行，因为压栈的目标地址是编译期常量。

代价是产物完全不可读：42 万行全是 `L_0A23:` 和 `goto`。
**但它不需要可读**，它是给机器执行的。

## 踩过的坑：反编译器本身也有边界错误

直译之前，先用反编译器看了一遍产物，发现 ubergraph 的分发体大量缺失，
`[stack=?]` 占位遍布。查下来是反编译器的锅：

`EX_ComputedJump` 被当成普通顺序执行语句，**没有当作基本块边界**。
而 ubergraph 的分发入口恰恰就是 `ComputedJump(EntryPoint)` 起手的 ——
于是分发体从缺，执行流栈一路下溢。

修在 `KismetDecompiler`（[补丁 `e445faa`](https://github.com/CCB-TEAM/KismetDecompiler)）：

- `FlowStackResolver`：`Block` 增加 `Dispatch` 标记，`Resolve()` 接受 `dispatchEntries`，
  在 `EX_ComputedJump` 和分发入口处切块
- `StructuredKismetDecompiler`：`EmitDispatch` 把 case 目标作为切分点传入；
  `BuildEdges` 把 `EX_ComputedJump` 当 `Term.Halt`

补丁前后的实测（1906 张卡）：

| 指标 | 补丁前 | 补丁后 |
|---|---|---|
| 效果调用点 | 7632 | **10102**（+32%） |
| 空壳处理函数 | 1028（35.8%） | **826（28.8%）** |
| BP_Logic 产物 | 299174 B / 5324 行 | **363415 B / 5639 行** |
| BP_Logic 空 case | 2 | **0** |

::: warning 教训
**直译的质量上限由"源数据的保真度"决定，不由翻译器决定。**
翻译器写得再对，源 AST 的边界切错了，产物就是错的 —— 而且错得很安静。
所以动手翻译之前，先花时间确认源数据本身是对的。
:::

## 残留的一个已知缺陷

反编译器有个二级 bug 没修：`do { X(); } while (X());` 会把条件里的调用**重复一次**，
370 个文件里共 531 处。

对直译没影响（直译走 AST，不经过这个渲染路径），但如果有人拿伪代码做参考，
要知道这个位置会多一次调用。

## 下一步

[02 · 架构与调用约定](/kismet-sim/02-calling-convention) —— AST 拿到了，
怎么把它接进一个能跑的引擎。
