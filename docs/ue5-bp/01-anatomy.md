---
title: 01 · 蓝图资产里存了什么
---

# 01 · 蓝图资产里存了什么

反编译的第一步不是写代码，是搞清楚**你要读的东西到底在哪个字段里**。这一章把蓝图的资产形态拆开。

## 编辑器蓝图 ≠ 打包后的蓝图

| 阶段 | 里面有什么 |
|---|---|
| 编辑器里（`.uasset` 的源码形态） | `UBlueprint`：节点图（`UEdGraph` / `UEdGraphNode`）、变量、组件、事件 |
| **打包后** | `UBlueprintGeneratedClass`：一个真正的 `UClass`，函数体是**字节码**，节点图不复存在 |

所以「蓝图反编译」在打包产物上，实际是**从 `UClass` 里把 `UFunction` 的字节码抠出来**，
再尝试还原成接近原始节点图的伪代码。**节点图是编译器的输入，你拿到的是它的输出**——
这意味着还原永远是「推断」，不是「读取」。

## 字节码挂在哪个字段

在 UAssetAPI 的模型里，它叫 `ScriptBytecode`，挂在函数导出和结构导出上：

> UAssetAPI 已把字节码解析为 `KismetExpression[]`（`StructExport.ScriptBytecode`），本工具只做渲染 / 结构 / 优化。

（出自本站 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

引擎侧对应的成员是 `UStruct` 上的 script 字节数组（在
[`Class.cpp`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Private/UObject/Class.cpp)
里可见 `ScriptBytecode` 相关序列化逻辑）。**先记住这个层级**：字节码属于
`UStruct`（`UFunction` 是它的子类），不是属于 `UClass` 本身。

## 一个蓝图资产牵扯三样东西

| 文件 / 数据 | 作用 | 缺了会怎样 |
|---|---|---|
| `.uasset` + `.uexp` | 资产本体：类、函数、字节码、属性表 | 什么都读不到 |
| **`.usmap`** | UE5 的 unversioned properties 映射：属性**类型**信息 | 属性解析错位，字节码跟着一起烂 |
| IO Store（`.ucas` / `.utoc`） | 部分游戏用容器格式打包 | 需要先解容器再谈资产 |

`.usmap` 不是可选项。证据是工具的命令行里它都是显式参数：

- `KismetDecompiler --input <蓝图.uasset | 目录> [--usmap <mapping.usmap>]`（[README](https://github.com/CCB-TEAM/KismetDecompiler)）
- `KismetKompiler ... --usmap <path>`，以及 IO Store 场景下的 `--global <global.ucas/utoc>`
  （[KismetKompiler README](https://github.com/tge-was-taken/KismetKompiler)）

::: tip 为什么 UE5 特别需要它
UE4 打包时属性带版本信息（versioned），解析器可以靠版本号推断结构；UE5 默认走
**unversioned properties**——只留数据、不留类型描述，必须靠 `.usmap` 把类型补回来。
所以「拿不到 usmap」往往等于「这个游戏的蓝图读不干净」，这不是工具的问题。
:::

## AST 长什么样

以 CUE4Parse 的实现为例，表达式树的基类是 `KismetExpression<T>`，每个操作码一个子类，
构造函数直接从归档里读自己的操作数：

```csharp
// CUE4Parse/GameTypes/WuWa/Kismet/WuWaKismetExpression.cs
public class EX_WuWaInstr1(FKismetArchive Ar) : KismetExpression
{
    public override EExprToken Token => EExprToken.EX_6E;

    public FVector Pos1 = Ar.Read<FVector>();
    public FVector Pos2 = Ar.Read<FVector>();
    // ...
}
```

（出自 [`CUE4Parse/UE4/Kismet/KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Kismet/KismetExpression.cs)
与 [`CUE4Parse/GameTypes/WuWa/Kismet/WuWaKismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/GameTypes/WuWa/Kismet/WuWaKismetExpression.cs)）

UAssetAPI 用的是同一套思路，规模可以量化：**`UAssetAPI/Kismet/Bytecode/Expressions/` 下有 100 个 `EX_*.cs`**
（用 GitHub API 列目录实测计数）。一个操作码一个类，这是「AST 无损」的工程基础——
**解析是逐 token 的、有类型的分支，而不是靠正则去猜文本**。

## 属性指针在 UE 4.25 变过一次

一个容易被忽略、但会直接导致解析失败的细节：字节码里引用属性用的是
`FKismetPropertyPointer`，它的表示法在 UE 4.25 前后不同：

```csharp
public FKismetPropertyPointer(FKismetArchive Ar)
{
    if (Ar.Game >= GAME_UE4_25 || Ar.Game is GAME_AssaultFireFuture)
    {
        New = new FFieldPath(Ar);        // 4.25+：走 FField 路径
    }
    else
    {
        bNew = false;
        Old = new FPackageIndex(Ar);     // 4.25 之前：包索引
    }
}
```

（出自 [`CUE4Parse/UE4/Kismet/KismetExpression.cs`](https://github.com/FabianFG/CUE4Parse/blob/master/CUE4Parse/UE4/Kismet/KismetExpression.cs)）

注意 `GAME_AssaultFireFuture` 这个例外——**除了版本号，还有按具体游戏打的特例**。
这与[运行时逆向那一专题](/ue5-re/01-object-model)里讲的 `UProperty` → `FField` 变化是同一件事的两面：
属性系统换了，字节码里的属性引用也跟着换。

## 节点图与字节码不是一一对应

这是「反编译永远有损」的根本原因，也是为什么蓝图逆向比反汇编 x86 更别扭：

| 编译期发生的事 | 后果 |
|---|---|
| 宏（`ForEach`、`DoOnce` 等）被**展开**成 if + goto 结构 | 反编译只能还原成展开后的样子，还原不回一个漂亮的 `ForEach` 节点 |
| 事件图被合并进 `ExecuteUbergraph` 分发体 | 你看到的是 `switch (EntryPoint)`，不是「事件节点」 |
| 纯函数、临时量被大量引入 | 伪代码里到处是 `Temp_1`、`CallFunc_...` |
| 常量被折叠、类型被隐式转换 | 原始写法不可考 |

本站的直译项目甚至专门为「循环出口必须是 `break`」写过一节：蓝图里的 `ForEach` 展开成
`if (i < len) → 循环体 / else → 空壳块`，反编译器若把空壳块当成出口直接跳过，就会**凭空渲染出一个死循环**。

（出自本站 [KismetDecompiler README](https://github.com/CCB-TEAM/KismetDecompiler)）

## 相关

- [02 · Kismet 字节码](/ue5-bp/02-bytecode) —— 这些 AST 节点背后的操作码体系
- [05 · 罕见之处](/ue5-bp/05-pitfalls) —— usmap、IO Store、逐游戏差异
- [附录 · 出处清单](/ue5-bp/appendix/sources)
