---
title: 11 · 路由、绑定与 JSON
---

# 11 · 路由、绑定与 JSON

::: tip 本章场景
把领域函数包装成八个 HTTP 端点，并决定它们的 JSON 形状：
`/health`、`/cards`、`/cards/{id}`、`/decks/validate`、`/matches`、`/matches/{id}`、
`/matches/{id}/play`、`/matches/{id}/finish`。
:::

## 定义

**1. 宿主两段式。** 先 `WebApplication.CreateBuilder(args)` 得到 builder，用它注册服务与配置；
再 `builder.Build()` 得到 `WebApplication`。后者同时是 `IApplicationBuilder`（加中间件）
与 `IEndpointRouteBuilder`（加端点）。`app.Run()` 阻塞直到进程结束。

**2. 端点映射。** `app.MapGet(pattern, handler)` 与 `app.MapPost(pattern, handler)`，
handler 的类型是 `Delegate`。它们返回 `IEndpointConventionBuilder`（用于挂授权、OpenAPI 元数据等），
所以 F# 里要 `|> ignore` 掉这个返回值（否则会触发 `FS0020`，见常见错误）。

**3. 路由模板。** `/cards/{id}` 里的 `{id}` 是路由参数；参数值默认是字符串，
需要在处理器里自己解析（`Guid.TryParse`、`Int32.TryParse`）。

**4. 处理器参数的绑定来源**（ASP.NET Core minimal API 的规则，按优先级）：

```text
路由值  →  查询字符串  →  DI 容器里的服务  →  请求体（复杂类型）
```

具体地说：

- 参数名与路由模板里的名字相同 → 取路由值；
- 与查询字符串的键相同 → 取查询值；
- 类型已在 `builder.Services` 注册 → 从容器取（`ICardStore`、`MatchStore`）；
- 以上都不匹配的复杂类型 → 按 JSON 读请求体（一个处理器最多一个这样的参数）。

**5. 返回值决定响应。** 返回 `IResult`（`Results.Ok(...)` / `NotFound(...)` / `BadRequest(...)`）
是最灵活的方式；返回其他类型时框架会按默认规则序列化（例如 `string` 走 `text/plain`）。

| 构造 | 状态码 | 用途 |
|---|---|---|
| `Results.Ok(value)` | 200 | 正常返回 |
| `Results.Created(uri, value)` | 201 + `Location` 头 | 新建资源 |
| `Results.BadRequest(value)` | 400 | 参数 / 规则不合法 |
| `Results.NotFound(value)` | 404 | 目标不存在 |
| `Results.Problem(...)` | 500（或指定） | 标准 `ProblemDetails` |

**6. JSON 选项只影响 HTTP 序列化。** `builder.Services.ConfigureHttpJsonOptions` 配置的是
minimal API 用的那套选项（`Microsoft.AspNetCore.Http.Json.JsonOptions`）；
MVC 的 `AddControllers().AddJsonOptions` 是另一套，不要以为改了这边会影响那边。

**7. `TypedResults` 与 `Results` 的区别。** `TypedResults.Ok(x)` 返回具体的 `Ok<T>` 类型，
能给 OpenAPI 提供精确的响应类型；`Results.Ok(x)` 统一返回 `IResult`。
本文用 `Results`，因为它与「多个分支返回不同状态码」的写法更直接；
需要生成 API 文档时换成 `TypedResults` 与 `Results<Ok<T>, NotFound>` 这类联合返回类型。

**8. 状态码是契约的一部分。** 客户端要区分「参数错」与「找不到」，
所以校验失败必须是 400、资源缺失必须是 404，不能一律 200 + `{"ok": false}`。

## 映射代码

下面这些调用都写在 `Program.fs` 的 `let app = builder.Build()` 之后（`app` 是 `WebApplication`）。

```fsharp
app.MapGet("/health", Func<IResult>(fun () -> Api.health())) |> ignore

app.MapGet("/cards", Func<ICardStore, IResult>(fun store -> Api.cards store)) |> ignore

app.MapGet("/cards/{id}", Func<string, ICardStore, IResult>(fun id store -> Api.card id store)) |> ignore

app.MapPost(
    "/decks/validate",
    Func<ValidateDeckRequest, ICardStore, IResult>(fun request store -> Api.validateDeck request store)
)
|> ignore

app.MapPost(
    "/matches",
    Func<CreateMatchRequest, MatchStore, IResult>(fun request store -> Api.createMatch request store)
)
|> ignore

app.MapGet("/matches/{id}", Func<string, MatchStore, IResult>(fun id store -> Api.matchInfo id store))
|> ignore

app.MapPost(
    "/matches/{id}/play",
    Func<string, PlayCardRequest, MatchStore, IResult>(fun id request store -> Api.play id request store)
)
|> ignore

app.MapPost(
    "/matches/{id}/finish",
    Func<string, FinishMatchRequest, MatchStore, IResult>(fun id request store -> Api.finish id request store)
)
|> ignore
```

处理器本身尽量只做「HTTP → 领域」的翻译：

```fsharp
let health () : IResult = Results.Ok({| status = "ok"; service = "duel" |})

let cards (store: ICardStore) : IResult =
    store.All() |> Array.map Dto.ofCard |> Results.Ok

let card (id: string) (store: ICardStore) : IResult =
    match store.TryGet id with
    | Some found -> Results.Ok(Dto.ofCard found)
    | None -> Results.NotFound({| error = sprintf "没有这张牌：%s" id |})

let play (id: string) (request: PlayCardRequest) (store: MatchStore) : IResult =
    match Guid.TryParse id with
    | false, _ -> Results.BadRequest({| error = "对局 id 不是合法的 GUID" |})
    | true, matchId ->
        match store.TryFind matchId with
        | None -> Results.NotFound({| error = "对局不存在" |})
        | Some game ->
            match Rules.play game request.Player request.Card with
            | Ok updated ->
                store.Replace(updated)
                Results.Ok(Dto.ofMatch updated)
            | Error message -> Results.BadRequest({| error = message |})
```

三个值得注意的地方：

1. **匿名记录 `{| ... |}` 也被序列化。** 它编译成一个带只读属性的类型，`System.Text.Json` 认它，
   所以临时响应体不用专门定义 DTO。
2. **`Guid.TryParse` 返回元组**，所以直接模式匹配成 `| false, _ ->` / `| true, id ->`。
3. **错误响应也带 `error` 字段**，让客户端有一致的解析路径。

## 实际请求与响应

```text
GET /health
200 {"service":"duel","status":"ok"}

GET /cards
200 [{"id":"b_001","name":"喷火","faction":"Britain","attack":2,"defense":3}, ...]

GET /cards/nope
404 {"error":"没有这张牌：nope"}

POST /decks/validate  {"name":"测试","cards":["g_001","zzz"]}
200 {"valid":false,"errors":["未知卡牌：zzz"],"cardCount":2}

POST /matches  {"firstPlayer":"甲","firstDeck":["g_001"],"secondPlayer":"乙","secondDeck":["s_001"]}
201 {"id":"40688cfa-2bed-405c-897e-7cefc90daa01","first":"甲","second":"乙","status":"running","turn":1,"log":[]}

GET /matches/not-a-guid
400 {"error":"对局 id 不是合法的 GUID"}

POST /matches/{id}/play  {"player":"乙","card":"g_002"}
200 {"id":"...","turn":2,"log":[{"turn":1,"player":"乙","card":"g_002"}],"status":"running",...}

POST /matches/{id}/finish  {"winner":"乙"}
200 {"status":"finished:乙", ...}
```

## 路由分组与端点过滤器

八个端点平铺在 `Program.fs` 里还行，再多就需要分组。`MapGroup` 返回一个分组，
在它上面挂的路由共享前缀与配置：

```fsharp
let games =
    app.MapGroup("/games").AddEndpointFilter(requireToken)

// GameOptions 与 IOptions 的用法见第 12 章的「配置绑定」
games.MapGet(
    "/settings",
    Func<IOptions<GameOptions>, IResult>(fun options ->
        let value = options.Value
        Results.Ok({| maxDeckSize = value.MaxDeckSize; startingHand = value.StartingHand |}))
)
|> ignore

games.MapGet("/ping", Func<IResult>(fun () -> Results.Ok({| pong = true |}))) |> ignore
```

`AddEndpointFilter` 的参数是 `Func<EndpointFilterInvocationContext, EndpointFilterDelegate, ValueTask<obj>>`：

```fsharp
let requireToken =
    Func<EndpointFilterInvocationContext, EndpointFilterDelegate, ValueTask<obj>>(fun context next ->
        if context.HttpContext.Request.Headers.ContainsKey "X-Token" then
            next.Invoke context
        else
            ValueTask<obj>(Results.Unauthorized()))
```

三个要点：

1. 过滤器的返回值是 `obj`（装的是 `IResult` 或处理器返回值），所以**短路**就是直接返回一个 `IResult`，
   不要调 `next`；
2. `next.Invoke context` 返回 `ValueTask<obj>`，不短路时原样返回即可；
3. 组级过滤器对组内**所有**路由生效，包括之后加进来的。

实测：

```text
GET /games/settings               -> 401（没有 X-Token）
GET /games/settings  X-Token: 1   -> 200 {"maxDeckSize":30,"startingHand":5}
GET /games/ping      X-Token: 1   -> 200 {"pong":true}
```

过滤器与中间件的区别：**中间件**在管道层，拿不到「这次命中了哪个端点、参数是什么」；
**端点过滤器**在端点层，能读 `context.Arguments`、也能短路成 `IResult`，
所以适合做「按端点做参数校验 / 授权 / 统一响应包装」。

## C# 视角

| C# 里的直觉 | F# 里的定义 | 结果 |
|---|---|---|
| `app.MapGet("/x", (int id) => ...)` | `Func<int, IResult>(fun id -> ...)` | 必须显式给委托类型，因为参数是 `Delegate` |
| 控制器 + `[FromBody]` / `[FromRoute]` 标注 | 靠**参数名与类型**推断绑定来源 | 名字就是契约 |
| `IActionResult` / `ActionResult<T>` | `IResult` | 同一个思路，接口更简单 |
| `return Ok(x)` | `Results.Ok(x)` | 一样 |
| 特性（attribute）做授权 | 端点过滤器 / `RequireAuthorization()` | 过滤器更像「中间件 + 端点上下文」 |

## 练习

1. 加一个 `GET /cards?faction=Soviet` 的过滤参数，用查询字符串绑定（参数名 `faction`）。
2. 把 `Results` 换成 `TypedResults`，观察返回类型的变化。
3. 给 `/matches/{id}/play` 加一个 `If-Match` 风格的乐观并发检查（用 `Turn` 当版本号），
   不匹配返回 409。

## 常见错误

**忘了 `|> ignore`。** `MapGet` 返回的是 `IEndpointConventionBuilder`，不是 `unit`，F# 会提示：

```text
warning FS0020: 此表达式的结果具有类型“IEndpointConventionBuilder”且已被隐式忽略。
请考虑使用 "ignore" 以显式弃用此值(例如 "expr |> ignore")，或使用 "let" 将结果绑定到名称上。
```

**参数名与路由名不一致。** 路由写 `{id}`、参数写 `matchId`，绑不定就变成「找不到参数」，
表现为 400 或空值。名字必须一致。

**在 GET 处理器上放复杂类型参数。** GET 通常没有请求体，复杂类型会被当成 body 读取并失败；
需要过滤条件就用简单类型（从查询字符串绑定）。

**返回 `string` 而不是 `IResult`。** 响应会变成 `text/plain`，客户端按 JSON 解析就炸。
要么把对象交给 `Results.Ok`，要么直接返回 DTO 类型（框架会 JSON 序列化）。

**DTO 里带判别联合。** 请求成功进入处理器，但写响应时抛
`NotSupportedException: F# discriminated union serialization is not supported`，
客户端看到 500。转换必须在 `Dto` 模块里做完。

**在处理器里 `new` 服务。** 这样每个请求都新建一个存储，对局数据随即丢失。
服务应当注册到 DI，让框架注入——下一章讲。
