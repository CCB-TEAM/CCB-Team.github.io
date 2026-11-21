---
title: 04 · 集合、管道与组合
---

# 04 · 集合、管道与组合

::: tip 本章场景
拿到卡牌列表之后要算四件事：总攻击力、攻击力 ≥ 5 的卡名、按阵营分组、以及建一张
「id → 卡牌」的查找表；再加一个「取前 5 个平方数」的惰性例子。
:::

## 定义

**1. F# 有三个常用集合类型，语义不同：**

| 类型 | 字面量 | 结构 | 主要特点 | 模块 |
|---|---|---|---|---|
| `'T list` | `[ 1; 2; 3 ]` | 不可变单链表 | 头插/头拆 O(1)，索引 O(n)；共享尾部很便宜 | `List.` |
| `'T array` | `[| 1; 2; 3 |]` | 连续的可变数组 | 随机访问 O(1)；长度固定 | `Array.` |
| `seq<'T>` | `seq { ... }` | 惰性序列（就是 `IEnumerable<'T>`） | 每次枚举都重新计算；可以表示无限序列 | `Seq.` |

- `list` 是 F# 的默认选择，因为不可变 + 共享尾部，适合「变换」而不是「随机改」。
- `array` 在需要索引、与 .NET API 对接（`string[]`、`byte[]`）时用。
- `seq` 是 .NET 的 `IEnumerable<'T>`，`Seq.` 模块的函数大多返回 `seq`，也就是**还没算**。

**2. 管道 `|>`：** 定义是 `x |> f = f x`。它只做一件事：把一个值作为函数参数放到后面，
让「先构造、再变换、再汇总」的阅读顺序和数据流一致。

```fsharp
[ 1; 2; 3 ] |> List.map ((*) 2) |> List.sum    // 12
```

`|>` 是左结合的，返回函数的函数（如 `List.map f`）可以直接接在后面。

**3. 函数组合 `>>` 与 `<<`：**

```fsharp
let attackOf = (fun (card: Card) -> card.Attack)
let sumAttacks = List.map attackOf >> List.sum
```

`(f >> g) x` 等于 `g (f x)`；`(f << g) x` 等于 `f (g x)`。它们返回一个新的函数值，
适合把管道「存起来」复用。

**4. 常用高阶函数（以 `List` 为例，`Array` / `Seq` 同名同义）：**

| 函数 | 类型（简化） | 作用 |
|---|---|---|
| `map` | `('T -> 'U) -> 'T list -> 'U list` | 逐元素变换，长度不变 |
| `filter` | `('T -> bool) -> 'T list -> 'T list` | 保留满足条件的元素 |
| `choose` | `('T -> 'U option) -> 'T list -> 'U list` | 变换 + 过滤二合一 |
| `fold` | `('State -> 'T -> 'State) -> 'State -> 'T list -> 'State` | 从左到右归约 |
| `foldBack` | `('T -> 'State -> 'State) -> 'T list -> 'State -> 'State` | 从右到左归约 |
| `sumBy` | `('T -> int) -> 'T list -> int` | 投影后求和 |
| `tryFind` | `('T -> bool) -> 'T list -> 'T option` | 找第一个，找不到是 `None` |
| `groupBy` | `('T -> 'K) -> 'T list -> ('K * 'T list) list` | 按 key 分组 |
| `sortBy` | `('T -> 'K) -> 'T list -> 'T list` | 按 key 排序（稳定） |
| `distinct` | `'T list -> 'T list` | 去重（按结构相等） |
| `length` / `isEmpty` | `'T list -> int` / `-> bool` | 长度 / 是否为空 |

**5. `Map<'K, 'V>` 与 `Set<'T>`** 是不可变的有序字典 / 集合：

```fsharp
let lookup = [ "a", 1; "b", 2 ] |> Map.ofList
let idSet = [ "a"; "b" ] |> Set.ofList
```

建一次之后不修改；「加一项」得到新集合（`Map.add`、`Set.add`）。
它们要求键 / 元素支持比较（记录与 DU 默认支持）。

**6. 列表推导（list comprehension）** 用 `[ ... ]` 里的 `for` / `if` 构造列表，
每个元素用 `->` 给出：

```fsharp
let errors =
    [ if List.isEmpty deck.Cards then "卡组不能为空"
      if List.length deck.Cards > 30 then "卡组最多 30 张"
      for id in unknown do
          sprintf "未知卡牌：%s" id ]
```

这也是 `Rules.validateDeck` 里「一次收集全部错误」而不是「遇到第一个就返回」的写法。

**7. `for` / `while` 是语句型构造**，返回 `unit`，用来做副作用；要构造集合请用推导或 `Seq`。

## 这一场景的代码

```fsharp
let cards = [ tiger; t34 ]

let totalAttack = cards |> List.map (fun card -> card.Attack) |> List.sum

let strong =
    cards
    |> List.filter (fun card -> card.Attack >= 5)
    |> List.map (fun card -> card.Name)

let byFaction = cards |> List.groupBy (fun card -> card.Faction)

let lookup = cards |> List.map (fun card -> card.Id, card) |> Map.ofList

let squares = Seq.initInfinite (fun i -> i * i) |> Seq.take 5 |> Seq.toList

let arrayTotal = cards |> List.toArray |> Array.sumBy (fun card -> card.Attack)

let idSet = cards |> List.map (fun card -> card.Id) |> Set.ofList

let foldTotal = List.fold (fun acc card -> acc + card.Attack) 0 cards

let summed = (List.map (fun (card: Card) -> card.Attack) >> List.sum) cards
```

输出：

```text
totalAttack = 9
strong = ["虎式"]
byFaction keys = [Germany; Soviet]
lookup.[s_001].Name = T-34
squares = [0; 1; 4; 9; 16]
arrayTotal = 9
idSet = set ["g_002"; "s_001"]
foldTotal = 9, summed = 9
```

## 惰性：`seq` 到底什么时候算

`Seq.initInfinite` 是无限序列，`Seq.take 5` 之后仍然**没有求值**，直到 `Seq.toList` 才真正计算前 5 项。
这就是 `seq` 的定义：它保存的是「怎么产生下一项」，不是「已经产生的项」。

后果有两条：

1. **每次枚举都重新计算。** 对 `seq` 迭代两遍，里面的表达式就跑两遍（包括副作用和耗时）。
   需要多次枚举时先 `Seq.cache` 或用 `Seq.toList` 物化。
2. **异常与副作用发生的时机很晚。** 一行构造 `seq` 的代码不会抛异常，异常发生在枚举它的时候。

`list` 与 `array` 都是**立即求值**的：`List.map` 返回时结果已经算好。

## 练习

1. 用 `List.choose` 把「卡牌列表」变成「攻击力 ≥ 3 的卡名列表」，一步完成过滤与投影。
2. 用 `List.groupBy` 统计每个阵营的卡牌数量（`List.length` 组合）。
3. 写 `deckAttack: string list -> Map<string, Card> -> int`，未知 id 按 0 计。

## 常见错误

**把 `seq` 当 `list` 用。** `Seq.map` 的返回值打印出来是 `seq [...]`，很多函数（如 `List.length`）
不接受它；要么 `Seq.toList`，要么换 `Seq.length`。

**用 `list.[i]` 做循环索引。** 单链表索引是 O(n)，循环里就是 O(n²)；需要随机访问用 `array`。

**`List.fold` 的参数顺序。** 它是 `fold folder state list`；写成 `fold list state folder` 会报类型错误。
`foldBack` 是 `foldBack folder list state`，顺序又不一样。

**列表分隔符写逗号。** 列表元素用 `;`。`[ "a", 1 ]` 是「一个元组元素」，不是两个元素；
`Map.ofList [ "a", 1; "b", 2 ]` 才是两个键值对（F# 会提示 `FS3886` 提醒单元素列表里用了逗号）。

**在管道里放会返回 `unit` 的东西。** `xs |> List.iter (printfn "%d")` 得到 `unit`，
后面不能再接 `|> List.sum`；`iter` 只用于副作用，`map` 才产出新集合。

**`array` 与 `list` 的相等。** `[| 1; 2 |] = [| 1; 2 |]` 是 `true`（数组也按结构比较），
但 `[ 1; 2 ] = [| 1; 2 |]` 是类型错误：它们不是同一个类型，不能比较。

**忘了 `Map` / `Set` 是不可变的。** `Map.add k v m` 返回**新** Map；只写 `Map.add k v m`
而不用返回值，等于什么都没做（编译器可能给出「忽略返回值」的提示）。
