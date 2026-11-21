---
title: 05 · 模块、命名空间与文件顺序
---

# 05 · 模块、命名空间与文件顺序

::: tip 本章场景
`Duel` 最后会有五个文件：领域类型、存储、DTO、HTTP 处理、启动。它们之间有明确依赖：
领域不依赖存储，存储不依赖 HTTP。F# 用「文件顺序」把这些依赖写死。
:::

## 定义

**1. 编译单元是文件，且顺序由项目文件决定。** F# 没有「头文件」也没有「先声明后使用」，
一个文件只能看见**在它之前编译**的文件里的东西。顺序写在 `.fsproj` 里：

```xml
<ItemGroup>
  <Compile Include="Domain.fs" />
  <Compile Include="Stores.fs" />
  <Compile Include="Dtos.fs" />
  <Compile Include="Api.fs" />
  <Compile Include="Program.fs" />
</ItemGroup>
```

这就是 F# 与 C# 最大的结构性差异：C# 的编译器收集整个项目再解析，
F# 的编译器按顺序逐文件处理，前面的文件对后面的文件「可见」，反过来不行。

**2. `module` 是命名空间之下的容器，可以放 `let` 绑定。** 模块有两种写法：

```fsharp
// 整个文件是一个模块
module Duel.Web.Api

// 或者在一个文件里开子模块
namespace Duel

module Rules =
    let maxDeck = 30
```

**3. `namespace` 只能放类型与模块，不能直接放 `let`。** 所以「一堆函数」要放进模块，
「一堆类型」可以放命名空间。`namespace Duel` 之下可以定义 `type Faction`，也可以定义 `module Rules`。

**4. `open` 把命名空间或模块里的名字引进当前作用域。** 它只影响名字解析，不改变可见性：

```fsharp
open Duel          // 之后可以直接写 Card、Rules.validateDeck
open System        // Guid、DateTime
```

**5. 访问控制：**

| 修饰 | 作用范围 |
|---|---|
| `let private x` / `member private` | 只在当前模块 / 类型内可见 |
| `private` 模块 | 只在父模块内可见 |
| `internal` | 同一程序集内可见 |
| 默认（不写） | 公开 |

```fsharp
module Hidden =
    let private secret = 42
    let publicValue = secret + 1

printfn "%d" Hidden.publicValue   // 43
```

从模块外访问 `private` 绑定会被拒绝：

```fsharp
printfn "%d" Hidden.secret        // 编译错误：secret 不可见
```

**6. 嵌套模块** 就是模块里再开模块，访问用点号逐层写：

```fsharp
module Outer =
    module Inner =
        let value = 7

printfn "%d" Outer.Inner.value    // 7
```

**7. 互相引用的类型必须写在同一文件**，用 `and` 连接：

```fsharp
type Node = { Value: int; Next: Node option }
```

自引用可以直接写。两个类型互相引用时：

```fsharp
type Player = { Name: string; Deck: Deck }
and Deck = { Name: string; Cards: string list }
```

**8. 模块名与文件名不必一致**，但惯例一致（`Api.fs` 里写 `module Duel.Web.Api`），
因为堆栈、日志、`typeof<>` 的显示名都会用到。

## 这一场景的结构

```text
Duel.Domain/           命名空间 Duel
  Domain.fs            类型（Faction / Card / Deck / Player / MatchStatus / Match）+ module Rules
  Stores.fs            ICardStore / InMemoryCardStore / MatchStore + module Seed
Duel.Web/              命名空间 Duel.Web
  Dtos.fs              DTO 类型 + module Dto（领域 → DTO 的映射）
  Api.fs               module Duel.Web.Api（纯函数：请求 → IResult）
  Program.fs           module Duel.Web.Program（组合根：配置、DI、中间件、路由）
Duel.Tests/            module Duel.Tests（零依赖测试运行器）
```

依赖方向是单向的：

```text
Domain  ←  Web     （Web 引用 Domain）
Domain  ←  Tests   （Tests 引用 Domain）
```

`Duel.Domain` 里没有 `Microsoft.AspNetCore`，所以它可以在控制台、测试、其它服务里复用；
`Duel.Web` 里没有业务规则，只有「把 HTTP 翻译成领域调用」。

## 为什么这样切

| 文件 | 放什么 | 判据 |
|---|---|---|
| `Domain.fs` | 类型 + 纯函数规则 | 不引用任何 IO / 框架 |
| `Stores.fs` | 状态与并发容器 | 只有存储实现依赖 BCL 集合 |
| `Dtos.fs` | 线上格式 + 映射 | 依赖领域，不依赖 HTTP |
| `Api.fs` | `IResult` 的构造 | 依赖 HTTP 抽象，不依赖启动 |
| `Program.fs` | 组装 | 唯一知道「具体实现是谁」的地方 |

这个判据可以概括成一句：**越靠下的文件越不应该知道上层的东西**。

## 签名文件：只暴露你想暴露的

F# 允许给一个源文件配一个**签名文件**（`.fsi`），声明「这个文件对外只有这些」。没写进签名的
绑定，外部一律看不见——即使它是公开的。

`Lib.fsi`：

```fsharp
module Lib

/// 把数字翻倍。
val double: x: int -> int

/// 公开的常量。
val MaxSize: int
```

`Lib.fs`：

```fsharp
module Lib

let double x = x * 2
let internalSecret () = 42
let MaxSize = 30
```

项目文件里签名必须写在源文件**之前**：

```xml
<ItemGroup>
  <Compile Include="Lib.fsi" />
  <Compile Include="Lib.fs" />
  <Compile Include="Program.fs" />
</ItemGroup>
```

实测：外部调用 `Lib.internalSecret ()` 会编译失败——

```text
error FS0039: 未定义值、构造函数、命名空间或类型“internalSecret”。
```

签名文件的价值是把「公开面」变成需要显式维护的东西：加一个函数而忘了写进 `.fsi`，
它就不会泄漏出去。代价是每改一次公共 API 都要同步改两处，所以小项目通常不写。

## 模块属性

| 属性 | 作用 |
|---|---|
| `[<RequireQualifiedAccess>]`（在 DU / 模块上） | 强制写 `Side.Left`，防止 `open` 后同名 case 打架 |
| `[<AutoOpen>]`（在模块上） | 引用包含它的命名空间时自动 `open` 它；慎用，会让名字来源变模糊 |
| `[<CompiledName("X")>]` | 改编译后的 .NET 名字，给 C# 侧一个更顺的名字 |
| `[<Literal>]` | 编译期常量，可用于 `[<Literal>]` 参数与特性参数（`Rules.MaxDeckSize` 就用了它） |

## 练习

1. 把 `Seed.cards` 从 `Stores.fs` 挪到单独的 `Seed.fs`，想想它应该排在哪个位置。
2. 给 `Rules` 加一个 `private` 辅助函数，确认 `Api.fs` 里调用它会编译失败。
3. 把 `Dto` 模块改名 `Wire`，观察哪些文件需要跟着改（以及哪些不需要）。

## 常见错误

**文件顺序写反。** 把 `Program.fs` 放在 `Api.fs` 前面，后者就看不见前者——编译器会说
「未定义」。这不是命名问题，是编译单元顺序问题。

**在 `namespace` 下直接写 `let`。** 会报语法错误；要么放进 `module`，要么整个文件用 `module`。

**循环依赖。** A 文件用 B、B 文件用 A 在 F# 里不可能。解决办法只有两个：
把公共部分抽到第三个文件（更下层），或者把两个类型放进同一个文件并用 `and`。

**项目引用漏了。** 文件顺序对但跨项目时仍然要 `<ProjectReference>`；否则同样报「未定义」，
但报错位置在项目层面，容易被误认为命名空间写错。

**以为 `open` 能跨越文件顺序。** `open` 只解决名字前缀，不解决可见性；
被引用的东西还是得在**更早编译**的文件里。
