---
title: 06 · 错误处理
---

# 06 · 错误处理

::: tip 本章场景
客户端提交一个卡组。它可能是空的、可能太长、可能包含不存在的卡牌——这些都**不是异常**，
是正常业务结果，而且要把所有问题一次报回去。另一方面，`Guid.TryParse` 这类调用需要参数类型，
写漏了会直接编译失败。
:::

## 定义

**1. `Result<'T, 'TError>` 是标准库的 DU：**

```fsharp
type Result<'T, 'TError> =
    | Ok of 'T
    | Error of 'TError
```

它的含义是：**一个要么成功（带值）、要么失败（带原因）的计算结果**。失败被写进了类型，
所以调用方必须处理它；而且它是一个普通的值，可以存、可以返回、可以组合。

**2. 三种失败表达方式，判据如下：**

| 方式 | 什么时候用 | 例子 |
|---|---|---|
| `option` | 没有值，且**不需要解释为什么** | 按 id 查卡牌，库里没有 |
| `Result` | 失败**可预期**，调用方应该处理，且需要原因 | 卡组不合法、对局不存在、状态不允许 |
| 异常 | **程序错误**或无法恢复的意外：null、配置缺失、第三方库抛出的异常 | 反序列化失败、磁盘满 |

判据的核心是「调用方是否应该处理」：如果失败是调用方必须考虑的分支，用 `Result`；
如果失败说明代码写错了，用异常，让它尽早炸。

**3. 构造与解构。** `Ok value` / `Error reason` 构造；用 `match` 解构（穷尽性检查会提醒你别漏）。
下面是 `Api.validateDeck` 里的片段（`known`、`deck` 是上一节的入参，`ValidateDeckResponse` 是 DTO）：

```fsharp
match Rules.validateDeck known deck with
| Ok valid -> { Valid = true; Errors = [||]; CardCount = List.length valid.Cards }
| Error errors -> { Valid = false; Errors = Array.ofList errors; CardCount = List.length deck.Cards }
```

**4. 组合。** 不要写「嵌套 match 套嵌套 match」，用标准库的组合子：

| 函数 | 类型 | 用途 |
|---|---|---|
| `Result.map` | `('T -> 'U) -> Result<'T,'E> -> Result<'U,'E>` | 成功时变换值，错误原样 |
| `Result.mapError` | `('E -> 'F) -> Result<'T,'E> -> Result<'T,'F>` | 只改错误 |
| `Result.bind` | `('T -> Result<'U,'E>) -> Result<'T,'E> -> Result<'U,'E>` | 串起可能失败的下一次调用 |
| `Result.defaultValue` | `'T -> Result<'T,'E> -> 'T` | 失败时给默认值 |
| `Result.toOption` | `Result<'T,'E> -> 'T option` | 丢掉错误只要「有没有」 |
| `Result.isOk` / `isError` | `Result<'T,'E> -> bool` | 判断 |

**5. 异常的语法。**

```fsharp
try
    risky ()
with
| :? System.ArgumentException as ex -> sprintf "参数错误：%s" ex.Message
| :? System.IO.IOException as ex -> sprintf "IO 错误：%s" ex.Message
| ex -> sprintf "其它错误：%s" ex.Message
```

- `try ... with` 捕获；`try ... finally` 只做清理，不改变结果。
- `raise exn` 抛出已有异常对象；`failwith "msg"` 抛 `Exception`；
  `invalidArg "参数名" "原因"` 抛 `ArgumentException` 并带上参数名。
- 异常分支里可以用 `:? T as ex` 做类型测试，也可以用 `when` 守卫。

**6. 关键区别：异常不出现在类型里。** `let f x = ...` 的签名不会告诉你「它会抛什么」，
所以任何调用点都可能被炸；`Result` 会。这就是「用 `Result` 表达业务失败」的理由，不是风格问题。

**7. 在边界上转换。** 常用两个方向（下面是签名，不是可直接执行的代码）：

```text
Option.toList   : 'T option -> 'T list
Result.toOption : Result<'T,'E> -> 'T option
```

`Option` → `Result` 没有标准函数（本文实测：`Option.toResult` 在当前 FSharp.Core 里不存在），
自己写一个就行：

```fsharp
let optionToResult (error: 'E) (option: 'T option) : Result<'T, 'E> =
    match option with
    | Some value -> Ok value
    | None -> Error error
```

**8. 错误类型本身也应该是一个类型。** 用 `string` 当错误最简单，但错误一多就分不清；
用 DU 可以精确表示，也方便在边界上映射成 HTTP 状态码：

```fsharp
type DeckError =
    | MissingName
    | EmptyDeck
    | TooLarge of actual: int
    | UnknownCards of ids: string list
```

## 代码与输出

```fsharp
let parsePositive (text: string) : Result<int, string> =
    match System.Int32.TryParse text with
    | true, n when n > 0 -> Ok n
    | true, _ -> Error "必须为正数"
    | _ -> Error(sprintf "不是整数：%s" text)

let optionToResult (error: 'E) (option: 'T option) : Result<'T, 'E> =
    match option with
    | Some value -> Ok value
    | None -> Error error
```

```text
optionToResult (Some 1) = Ok 1
optionToResult None     = Error "missing"
invalidArg  -> ArgumentException: 必须为正数 (Parameter 'amount')
failwith    -> Exception: boom
parse "12"  -> Ok 12
parse "x"   -> Error "不是整数：x"
mapError    -> Error 6
```

注意 `invalidArg` 的输出：它自动把参数名放进消息（`Parameter 'amount'`），
比 `failwith` 提供更多上下文——这就是选它而不用 `failwith` 的原因。

## 在 API 层把 Result 变成响应

`Api.fs` 里每个处理器都是同一个模式：**先校验，再决定状态码**。

```fsharp
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

这里有三层失败：解析失败（400）、找不到（404）、规则拒绝（400）。
每一层都由类型驱动：`Guid.TryParse` 返回元组、`TryFind` 返回 `option`、`Rules.play` 返回 `Result`。

## fail-fast 与 collect-all

`Result.bind` 是**单子式**组合：第一步失败就短路，后面的步骤根本不执行。适合「后面依赖前面」的流程
（先解析 id，再查对局，再改状态）。

但**校验**不一样：卡组同时有「名字为空」和「超过 30 张」时，用户希望一次看到两条，
而不是改一条再提交一次。这需要**应用式**（applicative）组合：把两个独立结果合起来，
错误合并、绝短路。标准库里没有现成的 `Result<'T,'E list>` 应用式组合子，自己写十行：

```fsharp
let apply (fResult: Result<'a -> 'b, 'e list>) (xResult: Result<'a, 'e list>) : Result<'b, 'e list> =
    match fResult, xResult with
    | Ok f, Ok x -> Ok(f x)
    | Error e1, Error e2 -> Error(e1 @ e2)
    | Error e, _ -> Error e
    | _, Error e -> Error e

let checkName (name: string) = if name = "" then Error [ "名字为空" ] else Ok name
let checkSize (n: int) = if n > 30 then Error [ "超过 30" ] else Ok n

let combined = apply (apply (Ok (fun name size -> name, size)) (checkName "")) (checkSize 31)
```

实测：`combined` = `Error ["名字为空"; "超过 30"]`——两条错误都在。

三条判据：

| 需求 | 组合方式 | 行为 |
|---|---|---|
| 步骤之间有依赖（上一步的输出是下一步的输入） | `Result.bind` | 第一个 `Error` 短路 |
| 步骤互相独立、要一次报全 | 应用式 `apply` / 手写 `Validation` | 收集全部 `Error` |
| 只要「有没有问题」，不要原因 | `option` | 第一个 `None` 短路 |

本文的 `validateDeck` 走的是第二条的另一种实现：它不返回 `Result` 而是先用列表收集，
最后统一包装成 `Result`——等价，且少一层组合子。

## 异常过滤器：按内容分支，不按类型分支

`try ... with` 的分支也支持 `when`，条件不成立就继续试下一个分支：

```fsharp
exception TransientError of string

let classify (input: string) =
    try
        if input = "timeout" then raise (TransientError "timeout after 3s")
        else raise (TransientError "bad input")
    with
    | TransientError msg when msg.Contains "timeout" -> "可重试：" + msg
    | TransientError msg -> "不可重试：" + msg
    | ex -> "其它：" + ex.GetType().Name
```

实测：`classify "timeout"` = `可重试：timeout after 3s`，`classify "bad"` = `不可重试：bad input`。

这比「先捕获再 `if` 判断再重新抛」干净：过滤器不成立时异常继续传播，
不会出现「捕获了又抛出去」的中间状态（也就不会丢栈）。

## C# 视角

| C# 里的直觉 | F# 里的定义 | 结果 |
|---|---|---|
| 参数不对就 `throw new ArgumentException` | 业务失败进 `Result`，异常留给 bug | 调用方必须处理失败分支 |
| `catch (Exception ex)` 统一兜底 | `Result` 在签名里；异常只在边界处理 | 失败可见、可组合 |
| `TryParse` + `out` | 元组 + `Result` | 没有 `out` 参数 |
| 用条件判断决定抛哪种异常 | `when` 过滤器 / DU 错误类型 | 分支与类型都显式 |
| 自定义异常类层次 | `type DeckError = MissingName \| EmptyDeck \| ...` | 封闭、可穷尽匹配、可映射到状态码 |

`Result` 与异常不是二选一：整个应用仍然要有异常边界（第 12 章的中间件），
只是**边界之内**的业务失败用值表达。

## 练习

1. 把 `Rules.validateDeck` 的错误类型从 `string list` 改成 `DeckError list`，
   再写一个 `DeckError -> string` 的渲染函数给 API 用。
2. 写 `Result<'T,'E> -> IResult` 的通用映射器，参数是「错误 → 状态码 + 消息」的函数。
3. 用 `Result.bind` 把「解析 id → 查对局 → 校验状态」串成一条链，避免三层嵌套。

## 常见错误

**只写 `validateDeck ...` 不处理返回值。** 它只是个值，不处理不会报错，但也什么都没做；
编辑器通常会给「忽略返回值」的提示。要么 `match`，要么 `|> ignore`（明确表示不关心）。

**用异常做业务分支。** `try ... with` 包住整个业务函数，会让「哪种失败」消失在栈里，
也没法让编译器提醒你处理。

**`with _ -> ...` 吞掉一切。** 连 `OutOfMemoryException` 也一起吞掉；至少要 `:? exn as ex` 保留信息，
或者只捕获具体的异常类型。

**把 `Result.map` 和 `Result.mapError` 搞混。** 前者改成功值，后者改错误；写反了类型通常对不上，
但如果两边都是 `string` 就悄悄通过了。

**`try ... with` 里忘了 `raise`。** 捕获后返回一个默认值，等于把错误变成了正常结果，
调用方永远不知道出过问题。

**`Int32.TryParse` 等重载方法缺少类型注解。** 参数类型不定时编译器会报 `FS0041`
（「未能确定方法 TryParse 的唯一重载」），给参数加上 `(text: string)` 即可。
