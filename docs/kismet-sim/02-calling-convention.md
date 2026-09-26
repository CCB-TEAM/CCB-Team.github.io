---
title: 02 · 架构与调用约定
---

# 02 · 架构与调用约定

这一章是本项目**最容易出错**的地方。写错了不会编译失败，只会静默算出错误的数字。

## 分层

```
KardsTranspiler         AST → C#（一个函数一个静态方法）
        ↓
Generated/*.g.cs        42.5 万行直译产物
        ↓  H.Call("Foo", new Val[] { 接收者, 实参... })
Kismet/IHost            运行时抽象
        ↓
Bridge/EngineHost       分派器：先查原语表，再递归进直译产物
        ↓
Engine/GameEngine       对局规则，直接改 GameState
```

设计要点：**分派器先把调用转回直译产物**，而不是在宿主里重写每个游戏函数。

`cardFunction.DamageCard(...)` → 调转译出来的 `BP_CardFunctions.DamageCard(host, obj, args)`
→ 它内部继续 `H.Call` → 最终落到少数几个真正碰 `GameState` 的叶子原语上。

这就是"要手写多少"从 226 个降到 **138 个叶子原语**的原因。其余全自动。

## 调用约定：`a[0]` 是接收者

所有 `H.Call` 发出的实参数组形状是：

```
{ 接收者, 真实实参1, 真实实参2, ... }
```

而直译产物的函数体签名是：

```csharp
public static Val Foo(IHost H, Val self, Val[] args)
//                                ^^^^      ^^^^
//                                接收者    只含真实实参（args[0] 是第一个形参）
```

所以分派器**转进去之前必须剥掉第 0 位**：

```csharp
var rest = a.Length > 0 ? a[1..] : a;
return fn(this, recv, rest);
```

::: danger 我自己踩的坑
写新原语时很自然就写成 `a[0]`、`a[1]`、`a[2]` —— 但 `a[0]` 是接收者。

我给 `SpawnCardInHandBySide` / `AddIntelToCard` / `SpawnCardOnBattlefield`
全写错了偏移，编译通过、跑起来不炸，只是**参数全部错位**。
最后是拿 UHT 签名逐个对照才发现的：

```
// UHT:  void SpawnCardInHandBySide(ESideEnum side, FName card_name, ...)
var side = (Side)a[1].AsInt();   // 不是 a[0]
var name = a[2].AsStr();         // 不是 a[1]
```

**写原语时永远对照 UHT 签名数一遍。** 光看调用点看不出来。
:::

## 两个返回值通道

KARDS 蓝图里有两种"返回结果"的方式，混用会导致静默走错分支：

| 通道 | 形态 | 例 |
|---|---|---|
| **out 形参** | `Val.Out(__v => L["x"] = __v)`，宿主**必须写回** | `Array_Get`、`GetCardFromID`、`getAndDecryptAttack` |
| **函数返回值** | `L["x"] = H.Call(...)` | `IsValid`、`Set_Length` |

宿主原语的两种写法：

```csharp
// out 形参：把结果写进最后一个槽
private static Val? Out(Val[] a, bool result)
{
    Val.TrySetOut(a[^1], Val.Of(result));
    return Val.Nothing;
}

// 函数返回值：直接 return
case "Set_Length": return Hit(Val.Of(SetOf(a[1])?.Count ?? 0));
```

::: warning 搞混的后果
`IsValid` 我一开始用 out 形参写法实现，但调用点读的是返回值 ——
于是**条件判断整个反了**，效果被静默跳过。不抛异常，只是判断永远为假。
:::

## 接收者怎么判定

不是猜的，按 import 链的第二层（声明类）推：

```
Function → Class → Package
```

- `/Script/kards` 下的函数 → **成员函数**，接收者 `self`
- `KismetArrayLibrary` / `BlueprintSetLibrary` 之类 → **静态库**，接收者 `Val.Ref("<库名>")`

`EX_LocalFinalFunction` / `EX_LocalVirtualFunction` 这两个 opcode 的语义就是
"在这个对象上调用"，所以接收者**必须是 `self`，不允许推断**。

::: danger 又一次踩坑
`EX_Context` 没有 context 表达式时（即无接收者的成员调用），
接收者被发成了 `Val.Nothing` → 判断永远为假 → 整段效果被跳过。

修法：无 context 时接收者用 `self` 兜底。
:::

注意库类名单要**显式列举** —— `BlueprintSetLibrary` 不以 `Kismet` 开头，
靠前缀规则会漏掉它。

## out / in 的四级回退

判定"这个参数是不是 out"做成了四级回退，因为没有任何单一来源是全的：

| 级 | 来源 | 覆盖 |
|---|---|---|
| 1 | 声明资产自己的 `FunctionExport.LoadedProperties`（原生 `CPF_OutParm`） | 最权威，但只管本资产 |
| 2 | 跨资产蓝图扫描，按函数名索引 | 覆盖 `EX_LocalVirtualFunction`（只带名字、不带 `FPackageIndex`） |
| 3 | UHT 头文件里 `T&` vs `const T&` | 覆盖引擎库 |
| 4 | `EngineLibraryParams` 手写表 | 兜底 |

## 局部变量必须零初始化

Kismet 的局部槽是**零初始化**的，但 C# 字典不是。直译时写 `L["x"]` 会在读取时抛
`KeyNotFoundException`。

所以发射的是 `GetLocal(L, "x")`：

```csharp
private static Val GetLocal(Dictionary<string, Val> L, string n)
    => L.TryGetValue(n, out var v) ? v : Val.Nothing;
```

典型触发场景：循环体首次进入时读 `Array_Get` 的 out 槽 ——
数组为空时那次调用根本没执行过，槽从没被写入。

## 执行流栈

`EX_PushExecutionFlow` / `EX_PopExecutionFlow` 用一个真的 `Stack<int>` + `switch`：

```csharp
__ef.Push(2720);          // EX_PushExecutionFlow
...
switch (__ef.Pop())       // EX_PopExecutionFlow
{
    case 2720: goto L_0AA0;
    case 2955: goto L_0B6E;
    default: goto __halt;
}
```

栈下溢时记日志并 halt，不要静默继续 —— 那会跑出完全没有意义的行为。

## 转发壳与无限递归

有一类函数是纯粹的转发壳，例如：

```
BP_CardFunctions.GetClientSide  →  GameStateRef.GetClientSide
```

如果 `GameStateRef` 那边找不到同名函数，分派器会落到"无接收者"的兜底分支 →
又找回 `BP_CardFunctions` 的同名壳 → **无限递归到栈溢出**。

两种情况都会触发：

1. 依赖蓝图（`BP_GameState_Battle`、`Library/*`）只当签名表、没一起转译
2. 单例之间的反向指针没建全（`CardFunctions` 缺 `GameStateRef`）

修法两件一起做：依赖也转译 + 加同名调用深度防护（连续 8 次即截断并记为未实现）。
**栈溢出会把整个进程带走**，比记一笔未实现糟糕得多。

## 下一步

[03 · 触发点体系](/kismet-sim/03-triggers) —— 逻辑能跑了，
但"什么时候该跑谁"还没解决。
