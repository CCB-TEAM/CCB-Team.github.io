---
title: 00 · 从 C# 过来：思维转换
---

# 00 · 从 C# 过来：思维转换

这一页写给「会写 C#、但 F# 怎么写怎么别扭」的人。

别扭的根源不是语法，是**默认值不一样**：C# 的默认是「类 + 可变字段 + 语句 + 异常」，
F# 的默认是「记录/联合 + 不可变 + 表达式 + 错误值」。用 C# 的默认去写 F#，
代码能编译，但会一直和语言打架。

下面每一条都是「C# 的直觉是什么 → F# 的定义是什么 → 具体哪里会疼」。

## 1. 从「对象 + 方法」到「数据 + 函数」

**C# 直觉**：行为属于类型。校验卡组的逻辑写在 `Deck.Validate()` 或 `DeckService` 里，
状态与操作绑在一起。

**F# 定义**：类型只描述**数据**，行为是**以它为参数的函数**，成组放在模块里。
`Card` 是记录，`Rules.validateDeck` 是函数，两者通过参数关联，不通过 `this`。

```fsharp
type Deck = { Name: string; Cards: string list }

module Rules =
    let validateDeck (known: Set<string>) (deck: Deck) : Result<Deck, string list> = ...
```

**哪里会疼**：

- 想写 `deck.Validate()` 时，F# 的做法是 `Rules.validateDeck known deck`；
  如果要「管道友好」，就把参数顺序排成「数据最后」：`deck |> Rules.validateDeck known`。
- 想加扩展方法时，改成模块里的普通函数；F# 也支持扩展成员（type extension），
  但只在需要 C# 风格调用时才用。
- 依赖一个服务时，不是构造函数注入字段，而是**把它作为参数**传进来（见第 12 章的 DI）。

类在 F# 里仍然存在，用于三种情况：需要 `IDisposable` 生命周期、需要实现 .NET 接口给框架用、
需要隐藏内部可变状态（比如 `MatchStore` 里的 `ConcurrentDictionary`）。

## 2. 从「语句序列」到「表达式」

**C# 直觉**：`if`、`switch`、`try` 是语句，靠 `return` 从方法里提前退出。

**F# 定义**：`if`、`match`、`try` 都是**表达式**，有值；函数体的值就是最后一个表达式的值。
没有 `return`、没有 `break`、没有 `continue`。

| C# | F# |
|---|---|
| `if (c) { return a; } return b;` | `if c then a else b` |
| `switch (x) { case 1: return "a"; ... }` | `match x with \| 1 -> "a" \| _ -> ...` |
| `return;`（void 方法提前结束） | `()` 或把剩余逻辑放进 `if` |
| `for` + `break` | 递归、`Seq.takeWhile`、或 `while` + 条件 |
| 方法体里的临时变量 | 表达式内的 `let` 绑定（仍然可以有多条） |

**哪里会疼**：

- 没有 `return`，所以「提前返回」要写成 `if ... then ... else ...` 或 `match`。
  ASP.NET Core 的处理器里那种 `if (x == null) return BadRequest();` 在 F# 里写成
  `match x with | None -> ... | Some v -> ...`（见第 6、11 章）。
- `if` 必须有 `else`，除非它的值是 `unit`（两边都返回 `unit` 时 `else` 可省）。
- 想「赋值一下接着写」的地方，通常是 `let` 绑定链；F# 的 `let` 可以反复出现，
  每条都可以依赖上一条。

## 3. 从「null 与默认值」到「类型即契约」

**C# 直觉**：`null` 表示没有；`enum` 表示一组取值；非法状态用自定义异常或注释约束。

**F# 定义**：自定义类型默认**不接受 null**；「可能没有」用 `option`；
「只能是这几种」用判别联合；**非法状态在类型层面写不出来**。

```fsharp
type MatchStatus =
    | Waiting
    | Running
    | Finished of winner: string option
```

这段定义排除了 C# 里要靠约定维持的所有情况：
`Status = 3`（越界）、`Status = Running` 但同时 `Winner != null`（自相矛盾）、
`Status = null`（忘赋值）。

更进一步的用法是**私有构造 + 校验函数**（智能构造器），让「非法值根本造不出来」：

```fsharp
type CardId = private CardId of string

module CardId =
    let create (raw: string) =
        if System.String.IsNullOrWhiteSpace raw then Error "空的卡牌 id"
        else Ok(CardId raw)

    let value (CardId raw) = raw
```

`private` 让外部只能通过 `CardId.create` 得到值，于是「空 id」在系统里不存在。

**哪里会疼**：

- 从 C# 库拿到的 `string` 仍可能是 null；边界上要么检查，要么 `Option.ofObj`。
- `option` 会让签名变长（`string option`），但这是把「可能没有」写在类型上，
  不是额外负担。
- 序列化边界上 `option` 会变成 `null`（见[第 8 章](/fsharp/08-dotnet-interop)）。

## 4. 从「异常控制流」到「错误值」

**C# 直觉**：参数不对就 `throw new ArgumentException(...)`，调用方 `try/catch`。

**F# 定义**：**可预期、调用方应该处理**的失败是返回值 `Result<'T,'E>`；
**程序错误**（bug、配置缺失、第三方抛的异常）才用异常。

区别不在于「F# 不喜欢异常」，而在于：异常**不出现在类型里**，调用方无从知道要处理什么；
`Result` 会出现在签名里，编译器会逼你把分支写全。

```fsharp
let validateDeck (known: Set<string>) (deck: Deck) : Result<Deck, string list> = ...
```

**哪里会疼**：

- 想「抛出去让上层统一处理」时，先问：这是 bug 还是业务失败？业务失败应该进 `Result`。
- C# 的 `TryParse` 模式在 F# 里是元组 + `Result`：
  `match Int32.TryParse text with | true, n -> Ok n | _ -> Error "不是整数"`。
- 异常仍然要在中间件、`use`/`IDisposable`、以及对第三方库的调用处处理。

## 5. 从「可变状态」到「值 + 转换」

**C# 直觉**：`list.Add(x)` 就地改；对象字段随便改。

**F# 定义**：默认不可变；「改」产生新值（记录用 `{ x with ... }`，列表用 `x :: xs`）。
需要就地改时显式选可变类型：`mutable` 字段、`ResizeArray<'T>`（就是 `List<T>`）、`Dictionary`。

**哪里会疼**：

- 循环里 `list.Add` → 改成 `List.map` / `List.fold` / 列表推导；确实需要频繁尾部追加时用
  `ResizeArray`，最后 `Seq.toList` 收口。
- 「先建空对象再逐个填」→ 改成一次构造（记录必须一次给全字段）。这是好事：
  不存在「半初始化」对象。
- 性能敏感的热路径（大量小对象、逐元素循环）不要为了「函数式」硬转；
  F# 完全允许 `for` 循环 + `mutable` + 数组，写法与 C# 一样直白。

## 6. 从「继承与多态」到「联合类型 + 模式匹配」

**C# 直觉**：一组行为用接口 + 多个实现类，`switch` 派发要靠类型判断。

**F# 定义**：取值集合**封闭**时用判别联合，用 `match` 一次写完全部分支；
取值集合**开放**（第三方要扩展）时用接口。

| 场景 | 选择 |
|---|---|
| 对局状态、阵营、错误种类、消息类型 | 判别联合（封闭，穷尽性检查） |
| 插件、可替换的存储/日志/HTTP 客户端 | 接口（开放，运行时可替换） |
| 「传一个策略」 | 函数参数（`('T -> 'U)`），不需要接口 |

**哪里会疼**：

- 想在别处给 DU 加一个 case —— 做不到，这正是它的价值（加了就要改所有 `match`）。
- 想在 DU 上写方法 —— 可以，但通常写成模块函数更自然；
  需要 C# 侧调用时再补成员。

## 7. 从「项目内任意顺序」到「文件顺序」

**C# 直觉**：编译器收集整个项目，类型可以互相引用，文件顺序无所谓。

**F# 定义**：按文件顺序编译，**只能看见前面的文件**。项目之间用 `<ProjectReference>` 显式声明。

**哪里会疼**：

- 「先写 Program，再补一个类」行不通；`Program.fs` 必须排最后。
- 互相引用的类型必须放同一个文件（`type A = ... and B = ...`）。
- 目录结构不再自动等于命名空间；两者要手动保持一致（见[第 5 章](/fsharp/05-modules)）。

好处是：依赖方向写在项目文件里，编译不过就是分层画错了。

## 8. 一张对照表

| C# | F# | 关键差异 |
|---|---|---|
| `class` + 属性 | `type X = { ... }` | 不可变、结构相等、无 `this` |
| `enum` | 判别联合 | 可带数据、无整数值、封闭 |
| `string` + `null` | `string option` | 缺失显式化 |
| `throw` / `catch` | `Result<'T,'E>` | 失败进类型 |
| `switch` 语句 | `match` 表达式 | 有值、可解构、穷尽性检查 |
| `List<T>` | `'T list`（链表）/ `ResizeArray<'T>` | 默认不可变 |
| `for` / `while` 循环 | `map` / `fold` / 推导，或 `for`+`mutable` | 先想「转换」，再想「循环」 |
| 扩展方法 | 模块函数 | 管道 `\|>` 代替链式调用 |
| 构造函数注入 | 函数参数 / DI 容器 | 依赖显式化 |
| `async`/`await` | `task { let! ... }` | 语义接近，写法是 CE |
| 文件顺序无关 | 文件顺序即依赖 | 结构性约束 |

## 9. 同一个需求的两种写法

**需求**：校验卡组——名字非空、不为空、不超过 30 张、卡牌都在库里，**一次返回全部错误**。

C#（示意；`Result<,>` 是示意用的自定义类型，C# 里通常用异常或自定义返回结构）：

```csharp
public static Result<Deck, string[]> Validate(Deck deck, ISet<string> known)
{
    var errors = new List<string>();
    if (string.IsNullOrWhiteSpace(deck.Name)) errors.Add("卡组需要一个名字");
    if (deck.Cards.Count == 0) errors.Add("卡组不能为空");
    if (deck.Cards.Count > 30) errors.Add("卡组最多 30 张");
    foreach (var id in deck.Cards.Distinct())
        if (!known.Contains(id)) errors.Add($"未知卡牌：{id}");
    return errors.Count == 0
        ? Result<Deck, string[]>.Ok(deck)
        : Result<Deck, string[]>.Error(errors.ToArray());
}
```

F#（本文的实际代码）：

```fsharp
let validateDeck (known: Set<string>) (deck: Deck) : Result<Deck, string list> =
    let unknown =
        deck.Cards
        |> List.filter (fun id -> not (Set.contains id known))
        |> List.distinct

    let errors =
        [ if String.IsNullOrWhiteSpace deck.Name then "卡组需要一个名字"
          if List.isEmpty deck.Cards then "卡组不能为空"
          if List.length deck.Cards > MaxDeckSize then sprintf "卡组最多 %d 张" MaxDeckSize
          for id in unknown do
              sprintf "未知卡牌：%s" id ]

    if List.isEmpty errors then Ok deck else Error errors
```

差异不在长度，而在三处：

1. F# 用**列表推导**把「条件成立才产生一条错误」写成列表的一部分，不需要先声明容器再 `Add`；
2. 返回类型 `Result<Deck, string list>` 把失败写进了签名，调用方必须 `match`；
3. 没有可变状态——`errors` 建好就是最终值，不存在「忘了某个分支又没 `Add`」的中间状态。

## 10. 十个自检问题

写 F# 卡住时，按顺序问自己：

1. 这个值真的需要变吗？（不需要 → 记录 + 纯函数）
2. 这组取值是封闭的吗？（是 → DU；否 → 接口）
3. 失败是调用方应该处理的吗？（是 → `Result`；否 → 异常）
4. 这个函数有隐藏输入吗？（读时钟、随机、全局状态 → 变成参数）
5. 我在用 `for` 循环模拟 `map` / `fold` 吗？
6. 我在用 `null` 表达「没有」吗？
7. 这个 `if` 需要 `else` 吗？（需要返回值就必须有）
8. 依赖是从构造函数来的，还是从参数来的？（F# 优先参数）
9. 文件顺序能体现依赖方向吗？
10. 我在照抄 C# 的写法，还是在用 F# 的默认值？

## 什么时候别硬转

- **热路径**：每帧执行的逻辑里，`List` 的分配与装箱要换成数组 + 循环 + 结构体。
- **大量 C# 互操作**：给 C# 用的公共 API 用元组参数（C# 无法部分应用柯里化函数）、
  返回 `Task` 而不是 `Async`、避免 `option`/DU 跨边界。
- **团队习惯**：强行在一个 C# 团队里推行 F# 的写法，收益通常小于摩擦；
  F# 更适合「新写的、边界清晰的模块」。

后面 15 章的内容都是这三条的具体版本。
