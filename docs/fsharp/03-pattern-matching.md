---
title: 03 · 模式匹配
---

# 03 · 模式匹配

::: tip 本章场景
对局状态是 `Waiting | Running | Finished of winner`，出牌前要根据状态决定「能不能出」。
同时要把客户端传来的卡牌 id 分成「库里有」和「库里没有」两组。
这两件事都用 `match` 表达。
:::

## 定义

**1. `match` 是一个表达式。** 它求值被匹配的表达式，从上到下试每个分支，
第一个匹配成功的分支给出整个 `match` 的值：

```fsharp
let label status =
    match status with
    | Waiting -> "等待"
    | Running -> "进行中"
    | Finished None -> "已结束"
    | Finished (Some winner) -> sprintf "已结束，胜者 %s" winner
```

因为它是表达式，所以：

- 所有分支的**类型必须一致**（这里是 `string`）；
- 它可以直接放在 `let` 右边、参数位置、`|>` 管道里，不需要先赋值给变量。

**2. 模式是「结构描述 + 变量绑定」。** 一个模式同时做三件事：检查形状、解构、
把子结构绑定到新名字。匹配失败不会抛异常，只是继续试下一个分支。

**3. 常见模式形式**：

| 形式 | 例子 | 说明 |
|---|---|---|
| 常量 | `\| 0 ->` | 只在值相等时匹配 |
| 通配 | `\| _ ->` | 匹配任何东西，不绑定 |
| 变量 | `\| x ->` | 匹配任何东西，绑定到 `x` |
| 联合 case | `\| Some x ->` / `\| Finished (Some w) ->` | 检查 case，并拆出字段 |
| 记录 | `\| { Attack = 0 } ->` | 按字段值匹配，未写的字段用 `_` |
| 元组 | `\| (a, b) ->` | 拆元组 |
| 空列表 | `\| [] ->` | 只匹配空列表 |
| 头尾 | `\| x :: rest ->` | 匹配非空列表，拆成头和尾 |
| 定长列表 | `\| [ a; b ] ->` | 只匹配恰好两个元素 |
| 守卫 | `\| n when n < 0 ->` | 模式之后再加布尔条件 |
| 别名 | `\| Some v as whole ->` | 既拆开又保留整体 |
| 类型测试 | `\| :? ArgumentException as ex ->` | 运行时类型检查（异常处理里常用） |
| 活动模式 | `\| Even ->` | 自定义的、可复用的分类器，见下 |

**4. 穷尽性由编译器检查。** 没有覆盖所有 case 时，编译器给出 `FS0025` 警告并给出反例：

```text
warning FS0025: 此表达式中的模式匹配不完整。 例如，值"None"可以指示模式未涵盖的用例。
```

**5. `function` 是 `fun x -> match x with` 的简写**，适合只做分派的函数：

```fsharp
let factionCode =
    function
    | Germany -> "DE"
    | Britain -> "GB"
    | Soviet -> "SU"
    | Usa -> "US"
```

**6. 守卫（`when`）不参与穷尽性判断。** `| n when n > 0 -> ...` 不会让编译器认为 `int` 已被覆盖，
所以处理 `int`、`string` 这类开放类型时通常需要一个 `_` 兜底。

**7. 分支按书写顺序尝试。** 把 `_` 或变量模式放在前面，后面的分支就永远到不了
（编译器通常也会提醒「该规则永远不会被匹配」）。

**8. 活动模式（active pattern）** 是带名字的匹配函数，用在 `match` 里像一个 case：

```fsharp
let (|Even|Odd|) n =
    if n % 2 = 0 then Even else Odd

let parity n =
    match n with
    | Even -> "even"
    | Odd -> "odd"
```

它的类型是 `int -> Choice<...>` 之类的「返回 case 标签」的函数，编译器把它展开成模式；
好处是把「怎么分类」和「分类后做什么」分开。

## 这一场景的代码

```fsharp
let factionName faction =
    match faction with
    | Germany -> "Germany"
    | Britain -> "Britain"
    | Soviet -> "Soviet"
    | Usa -> "USA"

let classify n =
    match n with
    | 0 -> "zero"
    | n when n < 0 -> "negative"
    | _ -> "positive"

let listHead xs =
    match xs with
    | [] -> None
    | x :: _ -> Some x

let describeList xs =
    match xs with
    | [] -> "empty"
    | [ x ] -> sprintf "single %d" x
    | x :: _ as all -> sprintf "head %d, 共 %d 个" x (List.length all)

let pick opt =
    match opt with
    | Some v as original when v > 0 -> sprintf "正数 %d（原值 %A）" v original
    | Some v -> sprintf "非正数 %d" v
    | None -> "没有值"
```

输出：

```text
factionName Germany = Germany
factionCode Usa = US
classify 0 / -1 / 5 = zero / negative / positive
listHead [1;2] = Some 1
listHead [] = None
parity 7 = odd
```

```text
empty
single 7
head 1, 共 3 个
正数 3（原值 Some 3）
非正数 -1
没有值
```

传负数参数时写成 `classify (-1)`，不要依赖 `-` 与空格的解析约定。

## 在对局规则里的用法

`Rules.play` 的全部守卫就是一个 `match`（片段：`isParticipant` 是 `Rules` 里的私有辅助函数，
完整定义见[第 13 章](/fsharp/13-complete-project)）：

```fsharp
let play (game: Match) (player: string) (card: string) : Result<Match, string> =
    match game.Status with
    | Finished _ -> Error "对局已经结束"
    | Waiting -> Error "对局还没开始"
    | Running when not (isParticipant game player) -> Error(sprintf "玩家 %s 不在这一局里" player)
    | Running when String.IsNullOrWhiteSpace card -> Error "没有指定要出的牌"
    | Running ->
        let move = { Turn = game.Turn; Player = player; Card = card }
        Ok { game with Turn = game.Turn + 1; Log = move :: game.Log }
```

读法：先按状态分派，再在 `Running` 这个 case 上用守卫继续细分；最后一条 `Running` 没有守卫，
所以 `Running` 一定被覆盖，`Finished` 与 `Waiting` 在前面已覆盖——穷尽性成立，没有 `_` 兜底。

## match 是怎么执行的

`match` 的语义有两条，不是实现细节，而是你写代码时必须依赖的规则：

**① 从上到下试，第一个匹配的分支胜出。** 没有「最优匹配」或「最具体的模式优先」这回事。
所以分支顺序就是优先级：`Some v` 写在 `None` 前面没问题，`_` 写在前面就会吞掉一切。

**② 匹配 = 形状检查 + 变量绑定。** 编译器把模式翻译成「类型/tag 检查 + 字段读取 + 条件判断」：

| 模式 | 运行期做什么 |
|---|---|
| `\| Some v ->` | 检查对象是否为空（F# 里 `None` 表示为 null）+ 读取 `Value` |
| `\| Finished w ->` | 检查 tag 是否为 `Finished` + 读字段 |
| `\| Running when cond ->` | 检查 tag，**再**求值 `cond`；`cond` 为 `false` 就继续试下一分支 |
| `\| 0 ->` | 与常量比较（`=`） |
| `\| x :: rest ->` | 检查列表是否为空 + 拆头尾 |

所以守卫（`when`）的求值发生在「形状已匹配之后、分支被选中之前」。这也是为什么守卫里可以安全地
使用已经绑定好的变量，而且守卫抛异常会直接向外传播（不会被当成「不匹配」）。

**③ 穷尽性是编译期对「形状」的检查。** 编译器不分析守卫的布尔语义，也不做值域推理：
`int` 有 2³² 个值，它只认常量与 `_`。

## 更多模式

**或模式（or-pattern）**：多个形状共用一段代码。

```fsharp
let isAxis =
    function
    | Germany | Britain -> true
    | _ -> false
```

**并行模式（and-pattern，`&`）**：同时用两种方式拆同一个值。

```fsharp
let both (pair: int * int) =
    match pair with
    | (a, _) & (_, b) -> a + b
```

实测 `both (3, 4)` = `7`。

**异常过滤器**：`when` 同样可以用在 `try ... with` 的分支上，条件不成立就继续试下一个分支。

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

顺带一个真实的坑：不要用 `FileNotFoundException.FileName` 做判据，它经常是 `null`
（`ReadAllText` 抛出时就是），过滤器会静默落到兜底分支。

**部分活动模式（partial active pattern）**：返回 `option`，匹配不上就是 `None`。
它适合「按内容分类」，而不是按类型分类：

```fsharp
let (|Int|_|) (text: string) =
    match System.Int32.TryParse text with
    | true, n -> Some n
    | _ -> None

let describe (text: string) =
    match text with
    | Int n -> sprintf "整数 %d" n
    | _ -> "不是整数"
```

**`match!`（在计算表达式里）**：把「等一个异步结果再匹配」写成一步（第 7 章有 CE 的背景）。

```fsharp
let readTask () =
    task { return 7 }

let matchBang =
    task {
        match! readTask () with
        | 7 -> return "seven"
        | n -> return string n
    }
```

实测 `matchBang.Result` = `"seven"`。

## C# 视角

| C# 里的直觉 | F# 里的定义 | 结果 |
|---|---|---|
| `switch` 是语句 | `match` 是表达式 | 能直接赋值、当参数、接管道 |
| `case` 只能是常量/模式，靠 `break` 结束 | 分支自动结束，没有 fallthrough | 不会漏 `break` |
| `if (x is Foo f)` 逐层判断 | 模式可以嵌套（`Some (Finished w)`） | 一次写完整个形状 |
| `switch` 表达式（C# 8） | `match` | 概念最接近；F# 多了 DU 拆解与穷尽性 |
| 编译器不检查 `switch` 是否覆盖全部枚举 | 覆盖不全给 `FS0025` 警告并给反例 | 加 case 时会被点出来 |
| `when` 只在 `catch` 里有 | `match` 每个分支都能带 `when` | 条件与形状可以分层 |

## 练习

1. 写 `deckSummary`，对空卡组 / 1 张 / 多张给出三种不同文案（用 `[ x ]` 与 `x :: rest`）。
2. 把 `classify` 改写成 `function` 形式。
3. 写一个活动模式 `(|Positive|Zero|Negative|)`，用它重写 `classify`。

## 常见错误

**把 `_` 写在前面。** `| _ -> "任意"` 会吞掉所有输入，后面的分支成为死代码。

**以为 `[x]` 是「以 x 开头」。** 它只匹配**恰好一个**元素；「开头」是 `x :: rest`。

**在 `match` 分支里不返回值。** 每个分支必须给同一类型的值；如果只想执行副作用，
用 `|> ignore` 或让分支返回 `unit`。

**忘了守卫不影响穷尽性。** 只有常量、case、`_` 这些「形状」参与覆盖判断。

**变量模式遮蔽了外层绑定。** 例如外层有 `let x = 1`，分支写 `| x -> ...` 会绑定成匹配到的值，
不是比较是否等于 1；要比较得用常量模式或 `when`。

**拿 `match` 当 `if`。** 单个布尔条件直接 `if ... then ... else ...` 更快，
`match` 的价值在于拆结构。
