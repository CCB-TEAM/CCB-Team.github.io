---
title: 15 · 坑与校准
---

# 15 · 坑与校准

十五条在本文里真实出现过（或真实会让人浪费半天）的误解。每条都写清「现象 — 定义 — 正确做法」，
不写「注意一下」。前十二条是语言层面的，后面三条是关于「不可变」与「性能」的直觉错位。

## 1. 用 `=` 赋值

**现象**：`hp = hp - 3` 编译通过但状态没变，或者在 `if` 里得到 `bool`。
**定义**：`=` 是**结构相等比较**，返回 `bool`；赋值运算符是 `<-`，且目标必须是 `mutable`。
**正确做法**：

```fsharp
let mutable hp = 10
hp <- hp - 3
```

## 2. 把 `f a b` 当成「调用接收两个参数的函数」

**现象**：给 `let damage (attack, defense) = ...` 传 `damage 5 2` 报类型错误。
**定义**：`let f (a, b) = ...` 接收**一个元组**（类型 `int * int -> int`）；
`let f a b = ...` 是柯里化（`int -> int -> int`）。两者不能混调用。
**正确做法**：元组版写 `damage (5, 2)`；柯里化版写 `damage 5 2`。

## 3. 以为 `.fsproj` 里的文件顺序可以随便排

**现象**：`Program.fs` 用了 `Api.fs` 里的函数，报「未定义」。
**定义**：F# 按 `<Compile Include>` 的顺序逐文件编译，后面的文件看得见前面的，反之不行。
**正确做法**：按依赖从下往上排（Domain → Stores → Dtos → Api → Program），
并且项目之间用 `<ProjectReference>`。

## 4. 以为「绑定一个函数」就等于「执行它」

**现象**：写 `let result = Api.cards`，然后困惑为什么没发请求。
**定义**：`Api.cards` 是函数值（类型 `ICardStore -> IResult`），只有应用它才会执行。
**正确做法**：`let result = Api.cards store`；或者把函数本身传给 `Func<...>` 构造器。

## 5. 对 `seq` 迭代两遍

**现象**：日志打了两次、查询发了两次、耗时翻倍。
**定义**：`seq<'T>` 是惰性序列，每次枚举都会重新执行产生元素的代码。
**正确做法**：需要多次使用时先 `Seq.cache` 或 `Seq.toList` 物化；只枚举一次就没问题。

## 6. 以为 `when` 守卫能让 `match` 变穷尽

**现象**：`match n with | x when x > 0 -> ...` 仍报 `FS0025`（模式匹配不完整）。
**定义**：穷尽性只看**模式形状**（常量、case、`_`），守卫是运行期条件，不参与覆盖判断。
**正确做法**：给开放类型（`int`、`string`）加 `_` 兜底，或者用 `if/elif/else` 表达纯条件分支。

## 7. 用 `null` 表示「没有」

**现象**：`match` 漏了 null，运行时 `NullReferenceException`。
**定义**：F# 自定义类型（记录、DU）不接受 `null`，但 .NET 的引用类型仍可能是 null。
**正确做法**：自己的模型用 `option`；在边界上 `Option.ofObj` / `isNull` / `String.IsNullOrWhiteSpace`
显式转换。

## 8. 把判别联合直接塞进 DTO

**现象**：请求成功，响应 500；日志里是
`NotSupportedException: F# discriminated union serialization is not supported`。
**定义**：`System.Text.Json`（.NET 10）支持记录、`list`、`option`，**不支持 DU**。
**正确做法**：DTO 里用字符串/基本类型，DU → 字符串的转换放在 `Dto` 模块；或者引入
`FSharp.SystemTextJson` 并接受它的反射代价。

## 9. 把 F# 函数值直接赋给 `Func` 变量

**现象**：`let f: Func<int,int> = fun x -> x + 1` 报类型不匹配。
**定义**：F# 函数类型与委托是不同类型；lambda 在**方法参数位置**可以隐式转换，变量赋值不行。
**正确做法**：`let f = Func<int, int>(fun x -> x + 1)`。

## 10. 在 `task { }` 里用 `let` 等异步结果

**现象**：得到 `Task<...>` 而不是结果，后面类型全错；或者忘了 `Async.RunSynchronously` 导致
程序直接退出。
**定义**：`let!` 才会等待；`task` 等 `Task`、`async` 等 `Async`，两者不能直接互等。
**正确做法**：`let! x = someTask ()`；跨模型时 `Async.StartAsTask` / `Async.AwaitTask`。

## 11. 多项目构建失败但「0 个错误」

**现象**：

```text
生成失败。
    0 个警告
    0 个错误
```

**定义**：MSBuild 并行节点在部分环境下的失败，与 F# 代码无关。
**正确做法**：`dotnet build -m:1` 串行构建（发布同理）。

## 12. 忽略返回值导致的 `FS0020`，以及重载导致的 `FS0041`

**现象 A**：

```text
warning FS0020: 此表达式的结果具有类型“IEndpointConventionBuilder”且已被隐式忽略。
```

**定义**：表达式序列里前一条语句的结果类型不是 `unit`，被隐式丢弃；`MapGet`、`Use`、`AddSingleton`
都返回非 `unit` 的对象。
**正确做法**：`|> ignore` 显式丢弃。

**现象 B**：

```text
error FS0041: 未能根据此程序点之前的类型信息确定方法“TryParse”的唯一重载。
```

**定义**：`Int32.TryParse` 有多个重载，参数类型不定时无法选择。
**正确做法**：给参数加类型注解 `(text: string)`，或用 `Int32.TryParse(text: string)` 形式。

## 13. 以为 `{ x with ... }` 是深拷贝

**现象**：改了「新记录」里的数组，发现「旧记录」也变了。
**定义**：copy-and-update 是**浅拷贝**——它只替换列出的字段，其余字段仍是同一个引用（数组、字典、
列表、嵌套记录都一样）。
**正确做法**：要真正独立就显式复制那一层（`Array.copy`、`List.ofSeq`、重新构造嵌套记录），
或者干脆保持不可变、不做「改一份副本」这种操作。

## 14. 把 `Map` / `Set` 当 `Dictionary` 用

**现象**：循环里反复 `Map.add`，几万次之后明显变慢。
**定义**：`Map`/`Set` 是持久化数据结构，每次「修改」返回新版本并共享大部分节点——
正确但常数大（O(log n) + 分配）；`Dictionary` 是摊还 O(1) 的就地哈希表。
**正确做法**：需要频繁就地增删用 `Dictionary` / `HashSet` / `ResizeArray`，
只在函数边界外暴露不可变集合。

## 15. 在生产代码里用 `%A` 打大对象

**现象**：一条日志让请求慢了 10 ms。
**定义**：`printfn "%A"` / `sprintf "%A"` 是**结构化格式化**，会递归遍历对象图并反射读字段；
对几千条记录的列表是实打实的开销。
**正确做法**：日志里手写关键字段（第 12 章的 `{Method} {Path} -> {Status}` 就是模板字符串），
`%A` 只用于调试与测试输出。

## 从 C# 过来的对照表

| C# | F# | 说明 |
|---|---|---|
| `var x = 1;` | `let x = 1` | 默认不可变 |
| `x = 2;` | `let x = 2`（遮蔽）或 `mutable` + `<-` | 没有「重新赋值」的同名绑定 |
| `return x;` | 最后一个表达式是 `x` | `return` 只用于计算表达式 |
| `switch` / `if-else` | `match` | `match` 是表达式，可解构 |
| `enum` | 判别联合 | DU 可带字段，无整数值 |
| `T?` / `null` | `option` | `Some` / `None` |
| `async Task<T>` / `await` | `task { let! ... }` | 语义接近 |
| `interface` + `class` | `type` + `interface ... with` | 也可用对象表达式 |
| `try/catch` | `try ... with` | 模式匹配异常类型 |
| `for (int i...)` | `for i in 1..n do` | 语句型，返回 `unit` |
| `List<T>` | `'T list` | 不可变单链表 |
| `T[]` | `'T array` | 同样的连续数组 |
| `IEnumerable<T>` | `seq<'T>` | 惰性 |

## 最后一条建议

遇到「F# 怎么这么别扭」的时候，先问一句：**我是不是在用它模拟 C#？**
F# 里最省力的写法通常与 C# 的顺序不同——不可变优先、表达式优先、类型优先。
这篇教程的十三个文件之所以能一直保持这个形状，就是每一步都先定了类型与边界，
再写实现；反过来写也能跑，但会不断和编译器打架。
