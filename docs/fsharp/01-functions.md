---
title: 01 · 函数
---

# 01 · 函数

::: tip 本章场景
一次攻击的伤害是「攻击力减去防御力」，最低为 0；一张卡牌打出去之后，生命值要按这个数扣。
先把这件事写成一个函数，再把它组合成能复用的形式。
:::

## 定义

**1. 绑定。** `let name = expression` 求值右边的表达式，把结果绑定到 `name`。
绑定默认不可变：同一个名字不能再次赋值（但可以**重新绑定**，见「遮蔽」）。

**2. 函数绑定。** `let add a b = a + b` 等价于下面这种写法：

```fsharp
let add = fun a -> fun b -> a + b
```

也就是说：**F# 的函数都是一元的**，多参数函数是「返回函数的函数」。
这种形式叫柯里化（currying）。`add` 的类型因此写成右结合的 `int -> int -> int`。

**3. 函数应用。** 写 `f a b`，不带括号，参数用空格分隔。应用是左结合的：
`f a b` 等价于 `(f a) b`。所以 `f a` 得到的是「把第一个参数固定住的新函数」，
这叫部分应用（partial application）。它不是语法技巧，是第 2 条的直接结果。

**4. 函数体是一个表达式，最后一个表达式的值就是返回值。** F# 没有 `return` 语句；
`return` 只在计算表达式里出现（见 [07 计算表达式](/fsharp/07-computation-expressions)）。

**5. 递归必须显式声明**：`let rec f ... =`。没有 `rec` 时，函数体里的 `f` 指的是外层的同名绑定。

**6. `unit` 是「没有有意义的返回值」的类型**，它只有一个值 `()`。
`let f () = ...` 是「接收 `unit` 参数」的函数；调用时必须写 `f ()`。

**7. 类型由编译器推断**：参数与返回值的类型从用法反推（基于 Hindley–Milner 的推断）。
需要收窄或写清意图时加注解：`(attack: int)`、`: Result<int, string>`。

**8. 函数是值。** 它可以被绑定、作为参数、作为返回值：

```fsharp
let twice f x = f (f x)      // (int -> int) -> int -> int
```

**9. 遮蔽（shadowing）是合法的重新绑定**，不是修改：

```fsharp
let x = 1
let x = x + 1     // 新的绑定，右边的 x 指向上一个
```

## 这一场景的最小代码

```fsharp
let damage (attack: int) (defense: int) = max 0 (attack - defense)

let hit = damage 5 // hit : int -> int

let rec total (xs: int list) =
    match xs with
    | [] -> 0
    | head :: tail -> head + total tail

let mutable hp = 10
hp <- hp - 3

let describe (value: 'a) = sprintf "%A" value

let swap (a, b) = b, a
```

实际输出：

```text
hit 7 = 0
damage 5 2 = 3
total [1;2;3] = 6
hp = 7
describe = 3.5
swap (1,2) = (2, 1)
```

逐条对照定义：

- `damage 5 2` 是完整应用，得到 `3`。
- `hit = damage 5` 是部分应用，`hit` 的类型是 `int -> int`；`hit 7` 等于 `max 0 (5 - 7)`，所以是 `0`。
- `total` 用了 `rec`，并且用模式匹配拆列表（列表模式在[03 模式匹配](/fsharp/03-pattern-matching)里系统讲）。
- `hp` 用 `mutable` 显式允许赋值，赋值运算符是 `<-`（`=` 是比较，不是赋值——这一点和 C# 相反）。
- `describe` 的类型是 `'a -> string`，`'a` 是泛型参数，由调用处决定。
- `swap (a, b)` 接收的是**一个元组参数**，不是两个参数；它的类型是 `'a * 'b -> 'b * 'a`。

## 元组参数 vs 柯里化参数

这两者不一样，混用是新手最常见的类型错误来源：

| 写法 | 类型 | 调用 |
|---|---|---|
| `let swap (a, b) = ...` | `'a * 'b -> 'b * 'a` | `swap (1, 2)` |
| `let swap a b = ...` | `'a -> 'b -> 'b * 'a` | `swap 1 2` |
| `let damage (attack, defense) = ...` | `int * int -> int` | `damage (5, 2)` |

.NET 方法（比如 `String.Concat`）通常接收元组式的参数表，调用时写成 `f (a, b)`；
F# 自己写的函数默认柯里化，便于部分应用与 `|>` 管道。

## 练习

1. 写 `heal current amount`，上限是 30。
2. 写 `let stronger a b = if a.Attack >= b.Attack then a else b`，参数是两个卡牌记录（记录在下一章）。
3. 把 `total` 改成对任意数字列表求和，并在空列表上返回 0。

## 常见错误

**漏括号导致运算优先级错。** 函数应用绑定最紧：

```fsharp
max 0 attack - defense        // 等于 (max 0 attack) - defense
max 0 (attack - defense)      // 想要的是这个
```

**忘记 `rec`。** 函数体里调用自己会报「未定义」——因为此时它看不到自己。

**把函数值当成结果。** `printfn "%d" hit` 会类型错误：`hit` 是 `int -> int`，不是 `int`。
想执行它要传参：`hit 7`。

**用 `=` 赋值。** `hp = hp - 3` 是布尔比较；赋值必须 `hp <- hp - 3`，且 `hp` 要声明为 `mutable`。

**没有参数却写成 `let f = ...`。** 例如 `let now = DateTime.Now` 在绑定那一刻就求值一次；
想要「每次调用都取当前时间」，必须写 `let now () = DateTime.Now`。

## 与 C# 的差异（只记一句）

C# 的方法必须包在类型里；F# 的 `let` 绑定可以写在模块（`module`）里，编译后就是一个静态方法，
所以它照样能被 C# 调用——只是在 C# 侧看起来是「接收第一个参数、返回一个 `FSharpFunc`」。这一点在
[08 互操作](/fsharp/08-dotnet-interop)里会再解释。
