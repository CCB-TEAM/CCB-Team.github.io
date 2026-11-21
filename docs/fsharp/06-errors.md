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
