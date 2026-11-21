---
title: F# 入门：从函数到 ASP.NET Core 项目
---

# F# 入门：从函数到 ASP.NET Core 项目

这是一条**单一场景**走到底的教程：从最简单的函数写起，最后做出一个能跑的 ASP.NET Core
服务——一个卡牌对局服务 `Duel`，有卡牌库、卡组校验、开局、出牌、结算和 JSON 接口。

::: tip 这份教程的口径
- 每个概念先给**定义**，再给这一场景里的用法；类比只在能减少误解时出现，不拿比喻代替定义。
- 所有代码都在 **.NET 10 SDK 自带的 F#** 上编译并运行过；文中出现的输出就是实际输出。
- 代码按「能直接粘进文件」的完整形态给，不写伪代码。
:::

## 为什么用 F# 写这个服务

不说「函数式更优雅」这种话，只说三条与这个场景直接相关的：

1. **领域模型可以直接写成类型。** 阵营是四个 case、对局状态是三个 case、卡组是「名字 + 卡牌 id 列表」，
   在 F# 里这三件事分别对应判别联合、判别联合、记录，不需要额外的校验层来保证「状态只能是这三种」。
2. **错误是返回值，不是控制流。** 校验卡组会失败、出牌会失败，这些在类型上写成 `Result<_, _>`，
   编译器会要求你处理失败分支。
3. **与 .NET 完全互通。** 用的是同一个运行时、同一套 ASP.NET Core、同一个 `System.Text.Json`；
   F# 只是换了语法与默认值（不可变、表达式优先），不是另一个平台。

代价也要说清楚：F# 的编译顺序是**文件顺序**，不能用「先写 Program 再补类」；生态里 C# 的示例更多，
遇到问题常常要把 C# 的写法翻译过来。这两点在[坑与校准](/fsharp/15-pitfalls)里单独讲。

## 环境

```bash
dotnet --version    # 10.0.x
```

只需要 .NET SDK，不需要额外装 F# 工具链（编译器随 SDK 提供）。本教程用到的命令：

```bash
dotnet new console -lang F# -o hello     # 控制台项目
dotnet new classlib -lang F# -o Duel.Domain
dotnet new web -lang F# -o Duel.Web      # ASP.NET Core 空项目
dotnet new sln -n Duel                   # 生成解决方案（.NET 10 默认是 .slnx）
dotnet run                               # 编译并运行
dotnet fsi                               # F# 交互式（脚本 / 试验语法）
```

## 这条线怎么走

| 阶段 | 页面 | 到这里你会 |
|---|---|---|
| 语言核心 | [01 函数](/fsharp/01-functions) | 知道 F# 的函数是什么、怎么组合、为什么参数是空格分隔 |
| | [02 数据](/fsharp/02-data) | 用记录、判别联合、`option` 把领域模型写成类型 |
| | [03 模式匹配](/fsharp/03-pattern-matching) | 用 `match` 拆解所有类型，并知道什么时候编译器会报「不完整」 |
| | [04 集合与管道](/fsharp/04-collections) | 分清 `list` / `array` / `seq`，用管道运算符串起数据处理 |
| | [05 模块与文件顺序](/fsharp/05-modules) | 组织命名空间与模块，理解为什么 `.fsproj` 的顺序不能乱 |
| | [06 错误处理](/fsharp/06-errors) | 用 `Result` 表达可预期的失败，用异常表达程序错误 |
| | [07 计算表达式](/fsharp/07-computation-expressions) | 读懂 `task { }` / `async { }`，并能自己写一个 builder |
| 与 .NET 打交道 | [08 互操作](/fsharp/08-dotnet-interop) | 调用 C# 库、把 F# 类型交给 `System.Text.Json`、用委托对接框架 |
| 工程 | [09 测试](/fsharp/09-testing) | 给纯函数写零依赖测试，并让它以退出码报告结果 |
| | [10 项目骨架](/fsharp/10-project-skeleton) | 三层项目结构（Domain / Web / Tests）与 `.fsproj` 的正确写法 |
| Web | [11 路由与 JSON](/fsharp/11-routing-and-json) | 用 F# 函数做 minimal API 的 handler，并控制 JSON 形状 |
| | [12 DI 与中间件](/fsharp/12-di-middleware) | 注册服务、注入 handler、写日志与异常中间件 |
| | [13 完整项目](/fsharp/13-complete-project) | 把上面全部拼成一个能 `curl` 的服务 |
| | [14 发布](/fsharp/14-publish) | 产出可分发的文件，并知道 AOT 在 F# 里的真实限制 |
| 收尾 | [15 坑与校准](/fsharp/15-pitfalls) | 避开 12 个最常见的误解 |
| | [速查表](/fsharp/cheatsheet) | 一页查完语法与命令 |

## 场景：Duel

一个最小的卡牌对局服务。它的全部领域概念只有六个：

```text
Faction    阵营：Germany | Britain | Soviet | Usa
Card       卡牌：Id, Name, Faction, Attack, Defense
Deck       卡组：Name, Cards（卡牌 id 的列表）
Player     玩家：Name, Deck
MatchStatus 对局状态：Waiting | Running | Finished of winner
Match      对局：Id, First, Second, Status, Turn, Log
```

对外暴露八个端点：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/cards` | 全部卡牌 |
| GET | `/cards/{id}` | 单张卡牌，不存在返回 404 |
| POST | `/decks/validate` | 校验卡组，返回 `valid` 与 `errors` |
| POST | `/matches` | 开局，返回 201 与对局 id |
| GET | `/matches/{id}` | 对局状态与出牌记录 |
| POST | `/matches/{id}/play` | 出牌，返回新的对局状态 |
| POST | `/matches/{id}/finish` | 结算 |

::: warning 关于「为什么先讲语言再讲框架」
F# 的框架代码（尤其是 ASP.NET Core 的 handler）到处是函数值、柯里化、模式匹配和委托转换。
先花七页把这些讲清楚，后面两页 Web 代码才不需要「照抄就行」。如果你已经会 F#，
直接从[项目骨架](/fsharp/10-project-skeleton)开始。
:::
