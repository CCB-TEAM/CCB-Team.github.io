---
title: 06 · 上手路径
---

# 06 · 上手路径

前面五章是「是什么」，这一章是「怎么开始」。按依赖顺序排，每一步都能独立验证。

## 六步

### 1. 先确认资产能正确解析

**别急着反编译。** 先只做一件事：把资产的属性读出来，看是否合理。

- 需要的文件：`.uasset` + `.uexp`，**以及匹配版本的 `.usmap`**；
- 如果是 IO Store 打包（`.ucas` / `.utoc`），先解容器；
- 判断标准：类名、函数名、属性名**能解成正常字符串**（这一步依赖名称池）。

解析错位的典型症状是「函数体异常短」「调用点莫名缺失」——**先怀疑 `.usmap`，再怀疑工具**
（见 [05 · 罕见之处](/ue5-bp/05-pitfalls)）。

### 2. 建立控制流直觉

拿一个不重要的资产，生成 CFG 看看：

```console
kismet-analyzer cfg unpacked/path/to/YourAsset.uasset
```

（出自 [kismet-analyzer README](https://github.com/trumank/kismet-analyzer)）

这一步的价值是让你先看到「Kismet 的控制流是带偏移的块」，而不是靠想象。

### 3. 读一个具体函数

```bash
KismetDecompiler --input BP_Card.uasset --usmap mapping.usmap --out ./out
# 渲染结果可疑时，回查操作码与跳转目标：
KismetDecompiler --input BP_Card.uasset --usmap mapping.usmap --disasm <函数名子串>
```

（参数出自本站 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

**读的时候记住它是有损的**：看到「分支少了」「调用缺了」，先去 `--disasm` 看操作码，
不要直接改工具。

### 4. 要批量或要精确，就自己走 AST

一旦你要做的是「统计」「转换」「对比」这类机器任务，**不要解析伪代码文本**——
直接遍历 `KismetExpression[]`。示意代码：

```csharp
// 示意：遍历一个函数的 AST，收集所有函数调用点
void Walk(KismetExpression expr, List<string> calls)
{
    switch (expr)
    {
        case EX_VirtualFunction vf:  calls.Add(vf.VirtualFunctionName.ToString()); break;
        case EX_FinalFunction   ff:  calls.Add(ff.StackNode.ToString());           break;
    }
    // 递归进子表达式（参数列表、条件、赋值右侧……）
}
```

（结构依据：[UAssetAPI 的 `Kismet/Bytecode/Expressions/` 下每个 opcode 一个类](https://github.com/atenfyr/UAssetAPI)；
上面是示意写法，不是可直接编译的代码）

### 5. 要改逻辑，选一条路

| 需求 | 做法 |
|---|---|
| 改完要**可分发的 mod** | 运行时方案（UE4SS 蓝图 mod 加载），不动资产文件 |
| 改完要**落在资产里** | 往返编译（[KismetKompiler](https://github.com/tge-was-taken/KismetKompiler) 的 `.kms` 格式） |
| 只是**试个效果** | 运行时改属性（Live View 类工具）最快 |

### 6. 验证，别省这一步

反编译产物**不会报错**。可用的验证手段：

- `--disasm` 对照操作码；
- `--cfg` / `--flowdebug` 看块切分与执行流栈；
- 换一个锚点算同一个数字，两个结果对不上就继续查。

## 本站是怎么做的

如果目标是「把蓝图逻辑搬出来，在别处跑」，本站 [KardsSim](/kismet-sim/) 走的是一条更激进的路：
**不用伪代码，直接把 AST 直译成 C#**。它的规模可以给你一个量级感：

| 指标 | 值 |
|---|---|
| 直译产物 | 1671 个资产 · 6434 个函数 · 45.6 万行 · 21 MB |
| 手工代码 | 41 个 `.cs` 文件（运行时 + hook 缝 + 引擎 + 审计工具） |
| 宿主原语 | 172 个条目（真正改 `GameState` 的叶子 + 库函数钩子） |
| 触发点 | 68 个枚举值，卡牌实际注册 61 个 |
| 机制断言 | 153 条（`--mode tests`），全绿 |
| 审计模式 | 9 个 |
| 自对弈 | 社区推荐卡组跑 100 局：0 异常 / 0 卡死 / 0 非法动作 / **0% 未实现调用** |

（出自 [直译模拟器 · 总览](/kismet-sim/)）

最关键的一个比例：**1671 个资产是机器转译的，只有 172 个原语条目是手写的。**
把「要手写多少」从「每个游戏函数都要重写」压到「只写碰 `GameState` 的叶子」，
是这套架构的全部价值。

## 该不该照抄

**适用**：逻辑在蓝图里、想要一个可复现的无头环境（AI 训练、批量平衡性实验、服务端侧结算）。

**先决条件三条，缺一条都别急着动手**（出自[直译模拟器 · 总览](/kismet-sim/)）：

1. 能拿到 **AST**（`KismetExpression[]`），而不是伪代码文本；
2. 源数据的**边界是对的**——否则直译质量直接打折；
3. 接受**产物不可读**——它的目标是正确执行，不是给人看。

如果只是想批量改个常量、看看某个蓝图长什么样，用
[KismetDecompiler](/projects/kismetdecompiler) / [KismetReactor](/projects/kismetreactor) 就够了，
不必上直译。

## 关于「务必多参考」这件事

蓝图逆向的公开资料少，且质量参差。给三条取材建议：

1. **优先读工具的源码，而不是教程。** 这个领域里，一个能跑的 `ExpressionSerializer`
   比十篇博客准确——因为格式细节只能从实现里得到验证。
2. **优先看有实测数字的材料。** 比如「效果调用点 7632 → 10102」这种，
   比「某处可能有 bug」有用得多。
3. **对社区结论保持怀疑。** 本专题没有引用任何无法核对原文的来源，
   见[附录 · 出处清单](/ue5-bp/appendix/sources)里的说明。

## 相关

- [03 · 反编译](/ue5-bp/03-decompile) —— 为什么必须验证
- [04 · 工具全景](/ue5-bp/04-tooling) —— 各工具的边界
- [直译模拟器系列](/kismet-sim/) —— 直译路线的完整实战
- [附录 · 出处清单](/ue5-bp/appendix/sources)
