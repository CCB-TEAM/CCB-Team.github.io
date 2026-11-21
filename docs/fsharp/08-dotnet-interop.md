---
title: 08 · 与 .NET 互操作
---

# 08 · 与 .NET 互操作

::: tip 本章场景
Web 层要调用 ASP.NET Core 的 `MapGet`、`ConfigureHttpJsonOptions`，要把 F# 函数交给
`Func<...>` 委托，要让 `System.Text.Json` 把 DTO 记录序列化成上一章看到的那种 camelCase JSON。
这一章讲清楚这三件事的规则。
:::

## 定义

**1. F# 编译成 .NET IL，运行在同一个运行时上。** 没有「F# 运行时」这种东西：
`System.*`、ASP.NET Core、任何 NuGet 包都能直接用，只是调用语法不同：

| 场景 | F# 写法 |
|---|---|
| 静态方法 | `Guid.NewGuid()`、`String.IsNullOrWhiteSpace text` |
| 实例方法 | `text.Trim()`、`dict.TryGetValue key` |
| 属性 | `DateTimeOffset.UtcNow`、`response.StatusCode` |
| 索引器 | `map.[key]` 或 `map[key]`（F# 6+ 推荐后者） |
| 构造函数 | `new HttpClient()` 或 `HttpClient()` |

`new` 可写可不写；F# 惯例省略。

**2. 委托转换。** `int -> int`（F# 函数类型）与 `System.Func<int, int>`（委托）是**不同的类型**。
在「方法参数位置」，F# 允许把 lambda 直接转成委托；把已有的函数值传过去时要显式构造：

```fsharp
// lambda 直接传：方法参数类型是 Action<JsonOptions>
builder.Services.ConfigureHttpJsonOptions(fun options ->
    options.SerializerOptions.PropertyNamingPolicy <- JsonNamingPolicy.CamelCase)

// 委托显式构造：MapGet 的第二个参数是 Delegate
app.MapGet("/health", Func<IResult>(fun () -> Api.health()))

// 已有函数值：用委托构造器包一层
let handler (store: ICardStore) : IResult = Api.cards store
app.MapGet("/cards", Func<ICardStore, IResult>(handler))
```

**3. 柯里化函数与 `Func` 的参数形态。** F# 函数是柯里化的（`a -> b -> r`），
`Func<A, B, R>` 是「一次接收两个参数」。构造时 lambda 的参数写法一一对应：

```fsharp
Func<string, ICardStore, IResult>(fun id store -> Api.card id store)
```

`Func` 的泛型参数**最后一个**是返回值；前面的都是参数，顺序不能换。

**4. 接口与对象表达式。** F# 实现 .NET 接口：

```fsharp
type ICardStore =
    abstract member All: unit -> Card[]
    abstract member TryGet: cardId: string -> Card option

type InMemoryCardStore(cards: Card seq) =
    let byId = cards |> Seq.map (fun card -> card.Id, card) |> Map.ofSeq

    interface ICardStore with
        member _.All() = byId.Values |> Seq.toArray
        member _.TryGet cardId = Map.tryFind cardId byId
```

临时的、只实现一次的接口用对象表达式：

```fsharp
let emptyStore =
    { new ICardStore with
        member _.All() = [||]
        member _.TryGet _ = None }
```

`[||]` 的类型由接口成员推断成 `Card[]`，`None` 推断成 `Card option`。
两者在 IL 层完全一样，对象表达式只是省掉了一个命名的类型。

**5. 记录编译成什么样的 .NET 类型**（决定了 JSON 行为）：

- 一个 sealed class；
- 每个字段是一个只读属性（`get`）；
- 构造器接收全部字段；
- 自带 `IEquatable` / `IComparable` / `ToString`。

**6. `[<CLIMutable>]` 给记录补两样东西**：一个无参构造器 + 每个字段一个可写属性。
它的用途是让「用属性赋值来填充对象」的序列化器 / 绑定器能工作——`System.Text.Json` 就是其中之一。

**7. `System.Text.Json` 能处理什么、不能处理什么**（以下都是在 .NET 10 上实测的结果）：

| 类型 | 序列化 | 反序列化 | 实测行为 |
|---|---|---|---|
| 记录（基本字段） | ✅ | ✅ | 有 `[<CLIMutable>]` 时走无参构造 + 属性赋值 |
| `string` / `int` / `bool` / `Guid` / `DateTimeOffset` | ✅ | ✅ | 内置 |
| `'T[]` | ✅ | ✅ | 内置 |
| `'T list` | ✅ | ✅ | 输出成 JSON 数组，读回来还原成 F# 列表 |
| `option` | ✅ | ✅ | `Some 1` → `1`，`None` → `null`；读回时 `1` → `Some 1`、`null` → `None` |
| 判别联合（DU） | ❌ | ❌ | 直接抛 `NotSupportedException` |

DU 的异常消息很明确：

```text
NotSupportedException: F# discriminated union serialization is not supported.
Consider authoring a custom converter for the type.
```

::: tip 版本相关
`option` 与 `list` 的内置支持是随运行时版本变化的。本文的数字都来自 .NET 10；
换到更早的 .NET 版本时，先用一个最小项目验证再决定 DTO 形状。
:::

这条限制直接决定了 DTO 的形状：**领域里的 `Faction` / `MatchStatus` 是 DU，不能进 DTO**，
必须在 `Dto` 模块里转成字符串（`"Germany"`、`"running"`、`"finished:甲"`）。
反过来，`option` 本身可以序列化，但 `None` 会变成 `null`，客户端得处理「字段可能是 null」；
本文干脆把可能缺失的信息压进字符串，让线上格式只有一种形状。

需要 DU 的 JSON 表示时，标准做法是加 `FSharp.SystemTextJson` 包并用它的转换器；
代价是多一个依赖，而且转换器基于反射，在 NativeAOT 裁剪下有风险（见[14 发布](/fsharp/14-publish)）。

**8. `option` 与 null 的边界转换。** 从 .NET 拿到的引用类型可能是 null：

```fsharp
Option.ofObj null        // None
Option.ofObj "abc"       // Some "abc"
```

**9. 模块编译成静态类。** `module Duel.Web.Api` 编译后是 `Duel.Web.Api` 类，里面的 `let` 是静态方法。
实测：`Rules.play` 编译成 `play(Match, String, String)`——柯里化不影响方法签名，
C# 侧可以直接 `Duel.Web.Api.health()` 或 `Rules.play(game, player, card)` 调用。
C# 做不到的只有「部分应用」（少传几个参数得到一个函数值），需要的话自己包一层。

## 代码与输出

一个最小的互操作闭环（来自实际运行的服务）：

```text
GET /health
{"service":"duel","status":"ok"}

GET /cards/s_001
{"id":"s_001","name":"T-34","faction":"Soviet","attack":4,"defense":4}

POST /matches
{"id":"40688cfa-2bed-405c-897e-7cefc90daa01","first":"甲","second":"乙","status":"running","turn":1,"log":[]}
```

这三行覆盖了三件事：匿名记录序列化（`/health`）、`[<CLIMutable>]` 记录 + camelCase 策略
（`/cards`）、`Guid` 转字符串与 DU 转字符串（`/matches` 的 `status` 来自 `MatchStatus`，
`log` 来自 `Move list` 的投影）。

## 委托与方法组的细节

`app.MapGet(path, Delegate)` 接收的是 `Delegate`，ASP.NET Core 通过反射读参数名来绑定：

- 参数名 `id` 对应路由里的 `{id}`；
- 复杂类型（不在路由里、不是已注册服务）按 JSON 请求体绑定；
- 已注册到 DI 的类型从容器取（`ICardStore`、`MatchStore`）。

所以 F# lambda 的参数**名字**是有语义的：写成 `fun identifier store -> ...` 就绑不上 `{id}`。

## C# 侧看到的是什么

如果另一个 C# 项目引用这个 F# 库，它看到的是普通的 .NET 类型（实测形状见第 2 章）：

| F# | C# 侧 | 注意 |
|---|---|---|
| `type Card = { Id: string; Attack: int }` | `sealed class Card { string Id { get; } int Attack { get; } }` | 只读属性；构造器 `Card(string, int)` |
| `type MatchStatus = Waiting \| Running \| Finished of string option` | `abstract class MatchStatus` + `MatchStatus.Finished` 等嵌套类 | 用 `is` / `switch` 判断，也可以读 `Tag` |
| `let validateDeck known deck = ...` | `static FSharpResult<Deck, FSharpList<string>> validateDeck(FSharpSet<string>, Deck)` | 多参静态方法，可直接调用；不能部分应用 |
| `let health () = ...` | `static IResult health()` | `unit` 参数在 IL 里没有对应参数 |
| `int option` | `FSharpOption<int>`（`None` 是 `null`） | 需要 `OptionModule` 或判空 |
| `'T list` | `FSharpList<'T>` | 实现 `IReadOnlyList<'T>` / `IEnumerable<'T>` |

**给 C# 用的 API 怎么设计**（三条就够了）：

1. **需要部分应用就给 F# 用柯里化版本，给 C# 另外包一个元组版本**：
   两者编译后都是多参静态方法，但只有元组版本在 C# 里读起来是「正常的方法调用」。
2. **返回 `Task<'T>`，不要 `Async<'T>`**：C# 不认识 `Async`，虽然能转但要包一层。
3. **不要在公共签名里用 `option`/DU**：要么提供 `bool TryX(out T)` 风格的包装函数，
   要么把 DU 转成枚举 + 属性（但那等于放弃 DU 的封闭性，所以通常干脆给 C# 用专门的 DTO）。

反过来，**F# 用 C# 库**没什么特别注意的：接口实现、委托转换、`Task` 都在前面几节讲完了。

## 练习

1. 把 `ICardStore` 换成一个 C# 风格的接口（在 C# 项目里定义），在 F# 里实现它。
2. 写一个 `[<CLIMutable>]` 的 DTO，含 `Guid`、`DateTimeOffset`、`string[]`，观察 JSON 形状。
3. 用 `Option.ofObj` 包一层 C# 库的返回值为 null 的方法。

## 常见错误

**把 F# 函数值直接赋值给 `Func` 变量。** 需要显式构造：`Func<int, int>(f)`。
lambda 在方法参数位置可以隐式转换，但变量赋值不行。

**`Func` 泛型参数顺序写反。** `Func<A, B, R>` 的最后一个才是返回值。

**DTO 里直接放判别联合。** 序列化就抛 `NotSupportedException`，而请求是在运行时才失败——
最好在写 DTO 时就用字符串 / 基本类型表示，转换放在 `Dto` 模块。

**DTO 里放 `option` 却不告诉客户端。** `None` 会变成 JSON `null`，客户端必须处理 null；
要么在 DTO 里用「空字符串 / 缺省值」，要么在文档里写清该字段可为 null。

**以为 `[<CLIMutable>]` 会改变相等语义。** 它只加无参构造与 setter，结构相等仍然按字段。

**忘了 `open`。** `[<CLIMutable>]`、`Option`、`Result` 都在 `Microsoft.FSharp.Core`，
默认已打开；但 `System.Text.Json`、`Microsoft.AspNetCore.Http` 需要显式 `open`。

**在 lambda 里用 `_` 当参数名。** `fun _ store -> ...` 在 minimal API 里会丢掉参数名，
绑定就失败；ASP.NET Core 需要真实名字。
