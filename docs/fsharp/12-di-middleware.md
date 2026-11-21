---
title: 12 · 依赖注入、中间件与日志
---

# 12 · 依赖注入、中间件与日志

::: tip 本章场景
卡牌库与对局存储要在整个进程内共享（否则每个请求都看不到别的请求创建的对局）；
每个请求要记一条日志；未捕获的异常要变成 500 JSON 而不是断开的连接。
:::

## 定义

**1. 依赖注入容器注册的是「如何得到一个类型的实例」。** 三种生命周期：

| 方法 | 生命周期 | 适用 |
|---|---|---|
| `AddSingleton` | 整个应用一个实例 | 无状态或需要共享的状态（卡牌库、对局表） |
| `AddScoped` | 每个请求一个实例 | 请求级状态（DbContext 一类） |
| `AddTransient` | 每次解析都新建 | 轻量、无状态工具 |

**2. 两种注册方式：**

```fsharp
// 注册实例：自己构造，容器只负责给
builder.Services.AddSingleton<ICardStore>(InMemoryCardStore(Seed.cards) :> ICardStore)

// 注册类型：让容器调用无参构造器（或已注册的构造参数）
builder.Services.AddSingleton<MatchStore>()
```

本文两个服务都用单例：卡牌库是只读的，对局表必须跨请求共享。

**3. 处理器参数自动来自 DI。** 只要类型已注册，它就可以作为 handler 参数：

```fsharp
app.MapGet("/cards", Func<ICardStore, IResult>(fun store -> Api.cards store))
```

框架看到 `ICardStore` 不在路由也不在查询字符串里，就去容器取。

**4. 中间件是一个函数：`HttpContext -> RequestDelegate -> Task`。** 其中
`RequestDelegate` 就是 `HttpContext -> Task`（管道里的「下一步」）。中间件可以在调用 `next` 前后
做事，也可以**不调用** `next` 直接结束请求（短路）。

**5. 管道顺序 = 注册顺序。** 请求按注册顺序进入，响应按相反顺序退出：

```text
请求 ──► 中间件 A ──► 中间件 B ──► 端点
响应 ◄── 中间件 A ◄── 中间件 B ◄── 端点
```

这决定了两件事：**异常中间件必须在外层**才能捕获内层的异常；
**日志中间件必须最外层**才能看到最终状态码（包括被异常中间件改成 500 的那种）。

**6. 日志通过 `ILoggerFactory` 拿。** 在中间件里通过 `context.RequestServices` 取：

```fsharp
let logger =
    context.RequestServices
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("Duel.Http")

logger.LogInformation("{Method} {Path} -> {Status} ({Elapsed:F1} ms)",
    context.Request.Method, context.Request.Path.Value, context.Response.StatusCode, elapsed)
```

消息模板里的 `{Name}` 是**结构化占位符**：日志系统会把它当字段保存，而不是拼字符串。

**7. 异常中间件的形状：**

```fsharp
try
    do! next.Invoke(context)
with ex ->
    context.Response.StatusCode <- StatusCodes.Status500InternalServerError
    do! context.Response.WriteAsJsonAsync({| error = ex.GetBaseException().Message |})
```

限制：如果内层已经把响应头发出去（`Response.HasStarted = true`），改状态码会抛异常。
生产代码应当先判断 `context.Response.HasStarted`，已开始就只能断开连接。

**8. 不需要手动 `UseRouting` / `UseEndpoints`。** minimal hosting 在映射端点时会自动加上路由，
`app.MapGet` 直接可用。

## 代码

```fsharp
[<EntryPoint>]
let main args =
    let builder = WebApplication.CreateBuilder(args)

    builder.Services.ConfigureHttpJsonOptions(fun options ->
        options.SerializerOptions.PropertyNamingPolicy <- JsonNamingPolicy.CamelCase)
    |> ignore

    builder.Services.AddSingleton<ICardStore>(InMemoryCardStore(Seed.cards) :> ICardStore)
    |> ignore

    builder.Services.AddSingleton<MatchStore>() |> ignore

    let app = builder.Build()

    // 中间件 1：日志（最外层）
    app.Use(
        Func<HttpContext, RequestDelegate, Task>(fun context next ->
            task {
                let started = DateTimeOffset.UtcNow
                let logger =
                    context.RequestServices
                        .GetRequiredService<ILoggerFactory>()
                        .CreateLogger("Duel.Http")

                do! next.Invoke(context)

                let elapsed = (DateTimeOffset.UtcNow - started).TotalMilliseconds

                logger.LogInformation(
                    "{Method} {Path} -> {Status} ({Elapsed:F1} ms)",
                    context.Request.Method,
                    context.Request.Path.Value,
                    context.Response.StatusCode,
                    elapsed
                )
            })
    )
    |> ignore

    // 中间件 2：异常兜底
    app.Use(
        Func<HttpContext, RequestDelegate, Task>(fun context next ->
            task {
                try
                    do! next.Invoke(context)
                with ex ->
                    context.Response.StatusCode <- StatusCodes.Status500InternalServerError
                    do! context.Response.WriteAsJsonAsync({| error = ex.GetBaseException().Message |})
            })
    )
    |> ignore

    // ... MapGet / MapPost ...

    app.Run()
    0
```

## 实际行为

启动日志与请求日志（`dotnet run`）：

```text
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://127.0.0.1:5200
info: Duel.Http[0]
      GET /health -> 200 (3.7 ms)
info: Duel.Http[0]
      GET /matches/not-a-guid -> 400 (1.6 ms)
info: Duel.Http[0]
      GET /boom -> 500 (10.7 ms)
```

`/boom` 是一个故意抛异常的端点（`fun () -> failwith "故意抛出的异常"`），它的响应是：

```text
500 {"error":"故意抛出的异常"}
```

注意顺序：日志中间件在外层，所以它记录到的是 `500`——异常中间件已经改过状态码。
如果把日志放在异常中间件**里面**，`/boom` 那条日志就永远不会被写出来（异常直接穿过它）。

## 练习

1. 写一个中间件，给每个响应加 `X-Duel-Version: 1` 头。
2. 把日志中间件改成「只记录耗时超过 100 ms 的请求」。
3. 把 `MatchStore` 改成 `AddScoped`，观察多次请求之间的数据是否丢失，并解释原因。

## 常见错误

**顺序写反。** 异常中间件放在最后，端点抛的异常它根本看不到；日志放在里面，异常请求不会被记录。

**忘了 `do! next.Invoke(context)`。** 中间件不调用下一步，请求就在这里结束，
客户端会拿到空响应或一直等。

**中间件没有 `|> ignore`。** `app.Use` 返回 `IApplicationBuilder`，
不丢弃会触发 `FS0020` 警告（和 `MapGet` 一样）。

**服务注册成 `Transient` 却当共享状态用。** 每次注入都新建一个，对局表看起来「一直为空」。

**`AddSingleton<T>()` 的类型没有可用构造器。** 容器需要无参构造，或者它依赖的每个参数都已注册；
否则在**第一次解析时**才报错（不是启动时），表现为第一个请求 500。

**在中间件里直接改 `Response.StatusCode` 而不检查 `HasStarted`。** 响应已开始写时会抛
`InvalidOperationException`，把「原本的错误」变成「新的、更难查的错误」。
