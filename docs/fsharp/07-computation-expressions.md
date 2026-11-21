---
title: 07 · 计算表达式：task、async 与自定义 builder
---

# 07 · 计算表达式：task、async 与自定义 builder

::: tip 本章场景
HTTP 处理器要等 IO：写响应是异步的、调用下游是异步的。同时我们希望「一系列可能失败的操作」
能像普通代码一样线性书写，而不是层层嵌套 `match`。
这两件事在 F# 里都由同一种语法解决：**计算表达式**（computation expression，CE）。
:::

## 定义

**1. 计算表达式是一段由 builder 决定语义的语法块。** 写法是 `builderName { ... }`，
块里可以出现 `let!` / `do!` / `return` / `return!` / `use!` / `yield` 等关键字。
编译器会把这些关键字**翻译成对 builder 方法的调用**，块整体的类型由 `builder.Return` 决定。

**2. 翻译规则（最常用的五条）：**

| 写法 | 翻译成 |
|---|---|
| `let! x = e` 后接 `rest` | `builder.Bind(e, fun x -> rest)` |
| `do! e` 后接 `rest` | `builder.Bind(e, fun () -> rest)` |
| `return e` | `builder.Return(e)` |
| `return! e` | `builder.ReturnFrom(e)` |
| `use x = e` 后接 `rest` | `builder.Using(e, fun x -> rest)` |

`Bind` 是「怎么把上一步的结果交给下一步」；`Return` 是「怎么把值变成最终类型」。
一个 builder 只要实现这两个方法（加上 `ReturnFrom`、`Zero` 等可选成员），
就能定义一门小语言的语义。

**3. 普通 `let` 在 CE 里仍然是普通绑定**，只有带 `!` 的才走 `Bind`。

**4. `task { ... }` 是 FSharp.Core 内置的 builder，产出 `Task<'T>`。**
它的语义与 C# 的 `async` 方法一致：**块一执行就立刻开始**（hot task），
`let!` 等待的是 `Task<'T>`。

**5. `async { ... }` 产出 `Async<'T>`，是惰性的。** 构造 `Async<'T>` 不会执行任何东西，
必须交给 `Async.RunSynchronously` / `Async.Start` / `Async.StartAsTask` 才真正运行。
`let!` 等待的是 `Async<'T>`。

**6. 选择哪一套：**

| 需求 | 选择 |
|---|---|
| 与 ASP.NET Core、`Task` 为主的 .NET API 交互 | `task` |
| 需要惰性构造、`Async.Parallel` / `Async.Sequential` 这类组合 | `async` |
| 需要显式传取消令牌 | 两者都要显式传 `CancellationToken` |

两者可以互转：`Async.StartAsTask`、`Async.AwaitTask`。

**7. 自定义 builder** 就是实现一个带 `Bind` / `Return` 等成员的类，然后绑定一个实例：

```fsharp
type MaybeBuilder() =
    member _.Bind(value, f) = Option.bind f value
    member _.Return value = Some value
    member _.ReturnFrom value = value
    member _.Zero() = Some()

let maybe = MaybeBuilder()
```

`Bind` 用 `Option.bind`，就自动获得「遇到 `None` 就短路」的语义——
这不是特例，是 `Bind` 的定义决定的。

## 代码与输出

```fsharp
let readTask () =
    task {
        do! System.Threading.Tasks.Task.Delay 1
        return 42
    }

let readAsync () =
    async {
        do! Async.Sleep 1
        return 42
    }

let combined =
    task {
        let! a = readTask ()
        let! b = Async.StartAsTask(readAsync ())
        return a + b
    }
```

```text
combined = 84     // 42 + 42
```

并行版本（`async`）：

```fsharp
let results =
    Async.Parallel [ for i in 1..3 -> async { return i * 2 } ]
    |> Async.RunSynchronously

// results = [|2; 4; 6|]
```

自定义 builder 的短路效果：

```fsharp
let bothCards =
    maybe {
        let! a = tryCard "g_002"
        let! b = tryCard "s_001"
        return a.Attack + b.Attack
    }

// bothCards = None
```

`bothCards` 是 `None`，因为 `tryCard "s_001"` 返回 `None`，`Bind` 直接短路，
`return` 那一行根本没执行。这演示了 CE 不是「特殊的控制流魔法」，
而是一串普通的函数调用——`Bind` 返回什么，块就走到哪里。

## 在处理器里怎么用

ASP.NET Core 的中间件签名是 `HttpContext -> RequestDelegate -> Task`，
所以中间件体用 `task { }` 最自然（下面是简化版：`app` 是 `Program.fs` 里的 `WebApplication`，
真实代码把 `printfn` 换成 `ILogger`）：

```fsharp
app.Use(
    Func<HttpContext, RequestDelegate, Task>(fun context next ->
        task {
            let started = DateTimeOffset.UtcNow
            do! next.Invoke(context)
            let elapsed = (DateTimeOffset.UtcNow - started).TotalMilliseconds
            printfn "%s -> %d (%f ms)" context.Request.Path.Value context.Response.StatusCode elapsed
        })
)
```

三个要点：

1. 整个 `fun context next -> task { ... }` 的类型是 `HttpContext -> RequestDelegate -> Task`，
   正好匹配 `Func<...>` 委托；
2. `do! next.Invoke(context)` 是「等下游处理完」，返回值是 `unit`；
3. `task { }` 里可以用 `try ... with` 包住 `do!`，异常会在等待处被捕获——下一章的异常中间件就是这个形状。

## 练习

1. 给 `MaybeBuilder` 加 `Delay` 与 `Combine`，让它可以写多语句块并支持 `if ... then ...`（无 else）。
2. 写一个 `ResultBuilder`，`Bind` 用 `Result.bind`，使块在第一个 `Error` 处短路。
3. 把 `readAsync` 改成接收参数数量，并用 `Async.Parallel` 并发读取 3 个。

## 常见错误

**在 `task { }` 里用普通 `let` 等异步结果。** `let x = someTask ()` 得到的是 `Task`，不是结果；
要 `let! x = someTask ()`。

**混用 `async` 和 `task` 的 `let!`。** `task` 块里 `let!` 等的是 `Task`，
要等 `Async` 必须先 `Async.StartAsTask`；反过来 `async` 块里要 `Async.AwaitTask`。

**忘了 `async` 是惰性的。** 写 `async { ... }` 只是构造了一个值，不运行；
控制台程序里忘了 `Async.RunSynchronously` 会「什么都没发生」并且直接退出。

**在 `task` 里做 CPU 密集的同步计算。** 它会占住线程；需要并行时用 `Task.Run` 或 `Async.Parallel`，
但别为了「看起来异步」把同步代码包进 `task`。

**`return` 之后还写代码。** `return` 是块的结束；后面的语句不可达，编译器通常会给出提示。
需要提前结束用 `if ... then return x else ...` 或 `return!`。

**自己写 builder 时漏了 `ReturnFrom`。** 用到 `return!` 就会编译失败；
而 CE 里 `if/then` 无 `else` 还需要 `Zero`。
