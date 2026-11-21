---
title: 02 · 数据：记录、联合与 option
---

# 02 · 数据：记录、联合与 option

::: tip 本章场景
把 `Duel` 的领域概念写成类型：阵营只有四种、卡牌有一组固定字段、对局状态只有三种、
卡组是一串卡牌 id。要求是「非法状态写不出来」，而不是「写出来以后再校验」。
:::

## 定义

**1. 记录（record）** 是一组命名字段。字段默认不可变；记录自动获得结构相等、结构比较、
`ToString`，因此可以直接当 `Set` / `Map` 的键。

```fsharp
type Card =
    { Id: string
      Name: string
      Faction: Faction
      Attack: int
      Defense: int }
```

构造时写全部字段（顺序无关）：

```fsharp
let tiger =
    { Id = "g_002"
      Name = "虎式"
      Faction = Germany
      Attack = 5
      Defense = 6 }
```

**2. 复制并修改（copy-and-update）** 产生**新记录**，原记录不变：

```fsharp
let buffed = { tiger with Attack = 8 }    // buffed.Attack = 8，tiger.Attack 仍是 5
```

**3. 判别联合（discriminated union，简称 DU）** 是一组有名字的 case，每个 case 可以携带
零个或多个字段：

```fsharp
type Faction =
    | Germany
    | Britain
    | Soviet
    | Usa
```

带字段的 case 可以给字段命名，读起来更清楚：

```fsharp
type MatchStatus =
    | Waiting
    | Running
    | Finished of winner: string option
```

要点：

- case 是**构造器**，本身是函数：`Some` 的类型是 `'T -> 'T option`；无字段的 case 是值（`Germany`）。
- DU 不等于 C# 的 `enum`：case 没有整数值，带字段的 case 根本无法用整数表示，
  所以「Waiting 等于 0」这种判断在 F# 里写不出来。
- 一个 DU 的 case 集合是**封闭**的：别处不能再添加 case。这一点让 `match` 能做穷尽性检查。

**4. `option`** 是标准库里的一个 DU，定义就是两个字：

```fsharp
type 'T option =
    | None
    | Some of 'T
```

它的用途是表示「可能没有值」，替代 null。常用函数：

| 函数 | 类型 | 作用 |
|---|---|---|
| `Option.map` | `('T -> 'U) -> 'T option -> 'U option` | 有值时变换，`None` 保持 `None` |
| `Option.bind` | `('T -> 'U option) -> 'T option -> 'U option` | 有值时变换成一个新的 option，并压平 |
| `Option.defaultValue` | `'T -> 'T option -> 'T` | 没有值时给默认值 |
| `Option.isSome` / `isNone` | `'T option -> bool` | 判断 |
| `Option.toList` | `'T option -> 'T list` | 0 或 1 个元素的列表 |

**5. `Result`** 也是标准库的 DU，用来表示**可预期的失败**（校验不通过、找不到、冲突），
与异常（程序错误）区分：

```fsharp
type Result<'T, 'TError> =
    | Ok of 'T
    | Error of 'TError
```

常用函数：`Result.map`、`Result.mapError`、`Result.bind`、`Result.isOk` / `isError`、
`Result.defaultValue`、`Result.toOption`。

**6. 类型缩写** 只是给已有类型起别名，不产生新类型：

```fsharp
type CardId = string      // CardId 与 string 完全等价，不能阻止把任意 string 当 CardId
```

想要「不同类型」需要单 case 的 DU 或 `[<Measure>]`，这超出了本章范围。

**7. 递归类型** 直接引用自己即可。`Deck` 里的 `string list` 就是递归定义的不可变单链表；
`Match` 里的 `Move list` 同理。

**8. 可变字段** 用 `mutable` 标出，赋值用 `<-`。默认不可变不是「不能改」，而是「改要显式声明」：

```fsharp
type Counter = { mutable Value: int }
let c = { Value = 0 }
c.Value <- c.Value + 1
```

## 把领域写成类型

```fsharp
type Deck =
    { Name: string
      Cards: string list }

type Player = { Name: string; Deck: Deck }

type Move =
    { Turn: int
      Player: string
      Card: string }

type Match =
    { Id: Guid
      First: Player
      Second: Player
      Status: MatchStatus
      Turn: int
      Log: Move list }
```

这几行已经排除了几类错误：

- `Status` 只能是 `Waiting` / `Running` / `Finished` 之一，不存在「第四种状态」或者「状态为 null」。
- `Finished` 一定带一个 `string option`，所以「谁赢了」可能是 `None`（例如中止），
  但「Finished 却没有胜者字段」这种结构不存在。
- 卡组是一串卡牌 id，不是一串卡牌对象——想拿卡牌信息必须去卡牌库查，这决定了存储层的形状。

## 相等、比较与哈希

记录与 DU 默认按**结构**比较：

```fsharp
let tigerCopy = { Id = "g_002"; Name = "虎式"; Faction = Germany; Attack = 5; Defense = 6 }
tiger = tigerCopy      // true：字段逐个相等
```

- `=` 是结构相等；引用相等要用 `obj.ReferenceEquals(a, b)`。
- 结构比较（`<`、`>`）也自动可用，前提是字段都支持比较。
- 因为实现了 `IEquatable` 与 `IComparable`，记录可以直接作为 `Set<'T>` 与 `Map<'K, 'V>` 的键。

## 实际运行

```fsharp
printfn "buffed.Attack = %d, tiger.Attack = %d" buffed.Attack tiger.Attack
printfn "structuralEqual = %b" structuralEqual
printfn "tigerAttack = %d" tigerAttack
```

```text
buffed.Attack = 8, tiger.Attack = 5
structuralEqual = true
tigerAttack = 5
```

## 编译成什么（决定了 JSON 与互操作）

F# 的记录与 DU 会编译成普通的 .NET 类型，形状可以用反射直接看到（下面都是实测输出）：

| 定义 | 编译结果 |
|---|---|
| `type Card = { Id: string; Attack: int }` | 一个 **sealed class**，每个字段是一个只读属性（`Id`、`Attack`），构造器接收全部字段 |
| `type Shape = Circle of float \| Square of float` | 一个 **abstract 基类**，每个 case 是一个嵌套子类（`Circle`、`Square`），`Circle 2.0` 的运行时类型就是 `Shape+Circle` |
| `type Faction = Germany \| Britain`（全部 case 无字段） | 一个 **sealed class**，不产生子类；case 是静态值，用 tag 区分 |
| `let add a b = a + b` | 一个静态方法 `add(a, b)`；**当它被当作值传递时**，编译器另外生成 `FSharpFunc<int, FSharpFunc<int, int>>` 的闭包对象 |

结论：

- **记录可以直接给任何 .NET 序列化器用**，因为它就是「带只读属性的类」。
- **DU 需要转换器**：`System.Text.Json` 看到的是「抽象基类 + 子类」，它不知道 `Tag` 与字段的对应关系，
  所以要么转成 DTO（本文的做法），要么引入支持 F# 的转换器。
- **柯里化只影响「把函数当值用」的场景**：直接调用时，C# 侧看到的是多参数静态方法
  （实测 `Rules.play` 编译成 `play(Match, String, String)`）；把它赋给变量或传给高阶函数时，
  才会出现 `FSharpFunc`。

## 用类型挡住错误

这一节是本章真正的目的：**让非法状态在编译期就写不出来，而不是在运行期校验**。

**① 单 case DU 做「严格 id」。** `type CardId = string` 只是别名，任何 string 都能混进去；
单 case DU 才是新类型：

```fsharp
type CardId = private CardId of string

module CardId =
    let create (raw: string) =
        if System.String.IsNullOrWhiteSpace raw then Error "空的卡牌 id"
        else Ok(CardId raw)

    let value (CardId raw) = raw
```

`private` 把构造器藏起来，外部只能通过 `create` 得到值——于是「空 id」不可能进入系统。
实测输出：`CardId.create "g_001"` 得到 `Ok (CardId "g_001")`，`CardId.create " "` 得到
`Error "空的卡牌 id"`。

**② 状态机写成 DU。** 用的是三个 case 的联合，而不是「枚举 + 若干个可能为 null 的字段」：

```fsharp
type MatchStatus =
    | Waiting
    | Running
    | Finished of winner: string option
```

`Finished` 一定带胜者字段，`Running` 一定不带——不存在「Running 但有胜者」这种中间状态。

**③ 同名 case 加限定。** 两个 DU 都有 `Running` 时，用 `[<RequireQualifiedAccess>]` 强制写
`Status.Running`，避免 `open` 之后名字打架：

```fsharp
type [<RequireQualifiedAccess>] Side = Left | Right

Side.Left      // 必须带限定
```

**④ 性能敏感的地方用结构体记录。** `[<Struct>]` 让记录变成值类型，避免堆分配：

```fsharp
[<Struct>]
type Point = { X: int; Y: int }
```

代价是复制语义与大结构体的拷贝开销；只在热点路径、字段少、生命周期短时用。

## C# 视角

| C# 里的直觉 | F# 里的定义 | 结果 |
|---|---|---|
| `class` + 属性 + 构造器 | 记录 = 字段全在构造器里 | 不存在「半初始化」对象 |
| 属性 `{ get; set; }` | 字段默认只读；要改就 `mutable` 或写 `with` | 改值要显式 |
| `enum` | 判别联合 | 可带数据、无整数值、封闭 |
| `record`（C# 9） | 记录 | 概念接近；F# 的还带结构比较 |
| `T?` / `null` | `option` | 缺失进类型 |
| `abstract class` + 子类 | DU（封闭）/ 接口（开放） | 按「要不要允许外部扩展」选 |
| `GetHashCode`/`Equals` 手写 | 自动生成；要自定义用 `[<CustomEquality>]` 等 | 默认就正确 |

注意 C# 的 `record` 与 F# 的记录**不是一回事**：C# 的 `record` 是引用类型、位置属性是 `init`-only
（用 `with` 复制），相等性按属性；F# 的记录是 sealed、只读属性、不可继承，但它同时实现了
结构比较（`<`、`>`），可以直接当 `Map` 的键。

## 练习

1. 给 `Card` 加一个 `Rarity` 字段（`Common | Rare | Elite`），并写一个函数把它转成字符串。
2. 写 `type DeckResult = ValidDeck of Deck | InvalidDeck of string list`，再用它替换
   `Result<Deck, string list>`，比较两种写法在读代码时的差别。
3. 写一个函数 `cardOrZero: Card option -> int`，没有卡牌时返回 0，否则返回攻击力。

## 常见错误

**构造记录时漏字段。** 编译器会报「字段未赋值」，并且列出缺的字段名。注意不能用「部分初始化」。

**以为 `{ tiger with ... }` 改了原值。** 它是新对象；如果原值被别的结构持有，那里仍然是旧值。

**把 DU 当 enum 用整数比较。** `int Germany` 不存在这种用法；要转成数字（比如协议里的编码）
必须在函数里显式映射。

**忘记 `option` 的类型。** `None` 在上下文里推不出类型参数时会报错，给个注解即可：
`let empty: Card option = None`。

**用 `null` 表示「没有」。** F# 自定义类型（记录、DU）默认不接受 `null`，所以自己的模型里应该用
`option`。但 .NET 的引用类型（`string`、`Task`、C# 库的返回值）仍可能是 `null`，
接进来时要么用 `String.IsNullOrWhiteSpace` / `isNull` 检查，要么在边界上转成 `option`。

**把 `Result` 和异常混着用。** 约定是：**可预期、调用方应该处理的失败**用 `Result`；
**不该发生的程序错误**（参数空引用、配置缺失）用异常。这一条在
[06 错误处理](/fsharp/06-errors)里展开。
