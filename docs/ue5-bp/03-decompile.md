---
title: 03 · 反编译
---

# 03 · 反编译

反编译的目标是**可读性**，代价是**有损**。这一章讲清楚：反编译要经过哪几层处理、每一层会丢什么、
以及怎么判断产物能不能信。

## 引擎自己就有反汇编器

Epic 提供了一个 `FKismetBytecodeDisassembler`，头文件里的自我描述是：

```cpp
/**
 * Kismet bytecode disassembler; Can be used to create a human readable version
 * of Kismet bytecode for a specified structure or class.
 */
class FKismetBytecodeDisassembler
{
    // ...
    UNREALED_API void DisassembleStructure(UFunction* Source);
```

（出自 [`ScriptDisassembler.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Editor/UnrealEd/Public/ScriptDisassembler.h)）

两个信息值得注意：

1. 它住在 **`UnrealEd`** 模块里——**只有编辑器构建才有**，打包后的游戏里没有。所以你不能指望在目标游戏里
   「调用引擎自带的反汇编器」把蓝图打出来。
2. 它的产物是「human readable version」，**面向人读**，不是可复用的数据结构。

这两点解释了为什么生态里需要第三方工具：**要的是数据，不是文本。**

## 反编译的四层处理

以本站 [KismetDecompiler](/projects/kismetdecompiler) 的流水线为例（出自
[README](https://github.com/CCB-TEAM/KismetDecompiler)）：

```
ScriptBytecode
   │  FlowStackResolver      把 EX_PushExecutionFlow / EX_PopExecutionFlow 解析成静态跳转
   ▼
BuildStatements → SplitBlocks → BuildEdges → MarkReachable(+DCE) → Compact
   │  FunctionSignatures     从 LoadedProperties 取真实签名（参数名/类型/in-out/局部变量）
   ▼
ComputeDominators / ComputePostDominators / FindLoops
   ▼
EmitRegion                 支配树 + 后支配 + 自然循环 → if / if-else / while / do-while / switch
   │  EmitPendingGotoTargets  无法结构化处才落 goto + label
   ▼
ReadabilityPasses          文本级等价改写
   ▼
SemanticOptimizer（--opt）  值流内联 + 常量折叠 + 命名 + 循环还原
```

逐层看，**每一层都在做「等价改写」，而每一次等价改写都是一次可能出错的推断**：

| 层 | 做什么 | 会丢什么 |
|---|---|---|
| 表达式渲染 | AST → 字符串：变量路径、函数名、常量、类型 | 内层表达式可能退化成类型名（需靠 `RawValue` 递归展开避免） |
| 控制流结构化 | 支配树 + 后支配 + 自然循环 → `if/else/while` | 结构化不了的地方降级成 `goto` + label；本站指标是 **17/19 函数零 goto** |
| 反 Dispatch | `ExecuteUbergraph` 还原成 `switch (EntryPoint)`，case 标注来源事件函数 | 跨段 goto 以保真形式保留，不强行结构化 |
| 可读性改写 | 折叠空 `if`、`else if` 合并、`for` 循环还原、去死代码等 | 文本级改写一旦规则写错，会**静默改变语义** |
| 语义优化 | 临时量值流内联、常量折叠、命名简化 | 原本两次独立调用可能看起来像一次 |

## 有损性：一次真实事故

这是本站最有价值的一条实测记录，来自[直译模拟器 01](/kismet-sim/01-why-ast)：

反编译器的 `EX_ComputedJump` 被当成普通顺序执行语句，**没有当作基本块边界**。
而 ubergraph 的分发入口恰恰就是 `ComputedJump(EntryPoint)` 起手的——
于是分发体从缺，执行流栈一路下溢，产物里遍布 `[stack=?]` 占位。

修法是在 `FlowStackResolver` 里给 `Block` 加 `Dispatch` 标记、在 `EX_ComputedJump` 与分发入口处切块，
并让 `BuildEdges` 把 `EX_ComputedJump` 当作 `Term.Halt`。补丁前后的实测（1906 张卡）：

| 指标 | 补丁前 | 补丁后 |
|---|---|---|
| 效果调用点 | 7632 | **10102（+32%）** |
| 空壳处理函数 | 1028（35.8%） | **826（28.8%）** |
| BP_Logic 产物 | 299174 B / 5324 行 | **363415 B / 5639 行** |
| BP_Logic 空 case | 2 | **0** |

（出自 [直译模拟器 01 · 为什么是 AST，不是伪代码](/kismet-sim/01-why-ast)）

::: warning 这张表的真正含义
**补丁前的产物是「能读的」**——它没有报错、没有崩溃，只是少了 32% 的调用点。
如果你拿它当参考去理解逻辑，你会得到一个**自信的错误结论**。

所以：**反编译产物的正确性，不能靠「看起来对不对」判断。**
:::

### 一个至今没修的残留缺陷

同一条记录里还留了一个二级 bug：`do { X(); } while (X());` 会把条件里的调用**重复渲染一次**，
370 个文件里共 **531 处**。对直译没影响（直译走 AST，不经过这条渲染路径），
但**如果你拿伪代码做参考，要知道这个位置会多一次调用**。

（出处同上）

## 怎么判断产物能不能信

综合上面的经验，给产物分级：

| 用途 | 可信度 | 说明 |
|---|---|---|
| **批量扫描找特征**（某个函数名出现在哪些蓝图里） | ✅ 可用 | 名称解析与调用点存在性一般不受结构化影响 |
| **人工阅读理解逻辑** | ⚠️ 需交叉验证 | 结构性缺陷会让分支/调用缺失，且不报错 |
| **作为机器翻译 / 直译的输入** | ❌ 不可用 | 应该直接消费 AST；伪代码是有损渲染，边界情况丢信息 |
| **作为改写后回编译的基础** | ❌ 不可用 | 往返编译必须走 AST ↔ 文本 ↔ AST，不能经过伪代码 |

（第一、三、四行的依据分别来自工具用法与[直译模拟器 01](/kismet-sim/01-why-ast) 的结论；
第二行为经验做法。）

### 三个可操作的验证手段

1. **看反汇编视图。** 本站工具提供 `--disasm [名字子串]`，输出「字节偏移 / 操作码 / 渲染结果 / 跳转目标」
   四列——**渲染结果可疑时，回去看操作码**。
2. **看 CFG。** `--flowdebug` / `--cfg` 把执行流栈解析与基本块切分过程打出来。
   边界切错的典型症状就是「块数明显偏少」「执行流栈下溢」。
3. **换一个锚点交叉验证。** 比如统计「某个函数被调用的次数」，用 AST 遍历算一遍，
   再和伪代码文本 grep 一遍——**两个数字不一致时，先怀疑伪代码**。

（工具参数出自 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

## 反编译与直译的分工

| | 反编译 | 直译 |
|---|---|---|
| 输入 | AST | **AST**（不是伪代码） |
| 产物 | 给人读的伪代码 | 给机器执行的目标语言代码 |
| 可读性 | 目标 | **明确放弃**（产物 42 万行全是 `L_0A23:` 和 `goto`） |
| 正确性要求 | 够读就行 | 必须严格等价 |
| 本站实例 | [KismetDecompiler](/projects/kismetdecompiler) | [KardsSim](/kismet-sim/) |

本站直译项目对这件事有一句总结：**「能拿到 AST 就别看文本。文本是给眼睛的，AST 是给机器的。」**

## 相关

- [02 · Kismet 字节码](/ue5-bp/02-bytecode) —— `EX_ComputedJump` 为什么是块边界
- [04 · 工具全景](/ue5-bp/04-tooling)
- [直译模拟器 · 为什么是 AST，不是伪代码](/kismet-sim/01-why-ast)
- [附录 · 出处清单](/ue5-bp/appendix/sources)
