---
title: 速查表
---

# 速查表

一页找完本教程用到的语法、函数与命令。

## 绑定与函数

| 写法 | 含义 |
|---|---|
| `let x = 1` | 不可变绑定 |
| `let mutable x = 1` + `x <- 2` | 可变绑定与赋值 |
| `let f a b = a + b` | 柯里化函数，类型 `int -> int -> int` |
| `let f (a, b) = a + b` | 接收一个元组，类型 `int * int -> int` |
| `let rec f n = ...` | 递归函数 |
| `let f () = ...` | 接收 `unit` 参数的函数 |
| `fun x -> x * 2` | 匿名函数 |
| `f a b` | 应用，左结合：`(f a) b` |
| `f a` | 部分应用，得到新函数 |
| `value |> f` | 管道，等价于 `f value` |
| `f >> g` / `f << g` | 组合，`g (f x)` / `f (g x)` |
| `expr |> ignore` | 显式丢弃返回值 |

## 类型定义

```fsharp
type Faction = Germany | Britain          // 判别联合
type Card = { Id: string; Attack: int }   // 记录
type CardId = string                      // 类型缩写（不是新类型）
type Node = { Next: Node option }         // 递归类型
type A = ... and B = ...                  // 互递归
```

`option` 与 `Result` 是内置 DU，不需要自己定义。

| 操作 | 写法 |
|---|---|
| 构造记录 | `{ Id = "g_001"; Attack = 3 }` |
| 读字段 | `card.Attack` |
| 复制并修改 | `{ card with Attack = 5 }` |
| 构造 DU | `Some 1`、`Finished(Some "甲")` |
| 结构相等 | `a = b` |

## 模式

| 模式 | 例子 |
|---|---|
| 常量 | `\| 0 -> ...` |
| 通配 | `\| _ -> ...` |
| 变量 | `\| x -> ...` |
| DU case | `\| Some v -> ...` |
| 记录 | `\| { Attack = 0 } -> ...` |
| 元组 | `\| (a, b) -> ...` |
| 空列表 / 头尾 / 定长 | `\| [] ->`、`\| x :: rest ->`、`\| [ a; b ] ->` |
| 守卫 | `\| n when n > 0 -> ...` |
| 别名 | `\| Some v as whole -> ...` |
| 类型测试 | `\| :? ArgumentException as ex -> ...` |
| 活动模式 | `\| Even -> ...` |

`function` 是 `fun x -> match x with` 的简写。守卫不参与穷尽性判断。

## 集合

| 需要 | `list` | `array` | `seq` |
|---|---|---|---|
| 字面量 | `[ 1; 2 ]` | `[| 1; 2 |]` | `seq { for i in 1..3 -> i }` |
| 变换 | `List.map` | `Array.map` | `Seq.map` |
| 过滤 | `List.filter` | `Array.filter` | `Seq.filter` |
| 归约 | `List.fold` | `Array.fold` | `Seq.fold` |
| 长度 | `List.length` | `Array.length` | `Seq.length` |
| 转数组 | `List.toArray` | — | `Seq.toArray` |
| 转列表 | — | `Array.toList` | `Seq.toList` |
| 惰性 | 否 | 否 | 是 |

其他常用：`choose`、`tryFind`、`groupBy`、`sortBy`、`distinct`、`sumBy`、`contains`、`isEmpty`；
`Map.ofList` / `Map.tryFind` / `Map.add` / `Map.containsKey`；
`Set.ofList` / `Set.contains` / `Set.add`。

## 运算符

| 运算符 | 含义 |
|---|---|
| `+ - * / %` | 算术（整数除法截断） |
| `**` | 幂（浮点） |
| `=` `<>` `<` `>` | 结构比较 |
| `&&` `\|\|` `not` | 逻辑 |
| `\|>` `<\|` | 管道 / 反向管道 |
| `>>` `<<` | 函数组合 |
| `::` | 列表头插 |
| `@` | 列表拼接 |
| `<-` | 赋值（仅 `mutable`） |
| `^` | 字符串拼接（不推荐，用 `+`） |

## 错误

```fsharp
// Result
Ok 1 |> Result.map ((+) 1)                 // Ok 2
Error "x" |> Result.mapError String.length // Error 1
Result.bind (fun n -> if n > 0 then Ok n else Error "neg") (Ok 1)

// option
Some 1 |> Option.map ((+) 1) |> Option.defaultValue 0
Option.bind (fun x -> Some (x * 2)) (Some 3)
Option.ofObj null                          // None

// 异常
try ... with
| :? ArgumentException as ex -> ...
| ex -> ...
failwith "boom"
invalidArg "name" "reason"
raise (exn "boom")
```

## 计算表达式

| 关键字 | 翻译 |
|---|---|
| `let! x = e` | `builder.Bind(e, fun x -> ...)` |
| `do! e` | `builder.Bind(e, fun () -> ...)` |
| `return e` | `builder.Return(e)` |
| `return! e` | `builder.ReturnFrom(e)` |
| `use x = e` | `builder.Using(e, fun x -> ...)` |

| builder | 返回类型 | 惰性 |
|---|---|---|
| `task { }` | `Task<'T>` | 否（立即开始） |
| `async { }` | `Async<'T>` | 是 |

## .NET 互操作

| 场景 | 写法 |
|---|---|
| 委托（lambda 传参） | `Func<int, int>(fun x -> x + 1)` |
| 委托（函数值） | `Func<int, int>(f)` |
| 接口实现 | `interface IFoo with member _.M() = ...` |
| 临时实现 | `{ new IFoo with member _.M() = ... }` |
| DTO 反序列化 | `[<CLIMutable>]` + 无参构造 |
| null → option | `Option.ofObj value` |
| 固定工作目录 | `Directory.SetCurrentDirectory(AppContext.BaseDirectory)` |

## CLI

```bash
dotnet new console -lang F# -o hello
dotnet new classlib -lang F# -o Duel.Domain
dotnet new web -lang F# -o Duel.Web
dotnet new sln -n Duel                       # .NET 10 生成 Duel.slnx
dotnet sln Duel.slnx add Duel.Web/Duel.Web.fsproj
dotnet add Duel.Web reference Duel.Domain
dotnet build -m:1
dotnet run --project Duel.Web --urls http://127.0.0.1:5201
dotnet publish Duel.Web -c Release -m:1
dotnet fsi                                    # 交互式
```

## 最小 `.fsproj`

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Dtos.fs" />
    <Compile Include="Api.fs" />
    <Compile Include="Program.fs" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\Duel.Domain\Duel.Domain.fsproj" />
  </ItemGroup>
</Project>
```

## 最小 `Program.fs`

```fsharp
[<EntryPoint>]
let main args =
    let builder = WebApplication.CreateBuilder(args)
    builder.Services.AddSingleton<MatchStore>() |> ignore
    let app = builder.Build()
    app.MapGet("/health", Func<IResult>(fun () -> Results.Ok({| status = "ok" |}))) |> ignore
    app.Run()
    0
```

## 常见警告号

| 编号 | 含义 | 处理 |
|---|---|---|
| `FS0020` | 表达式结果被隐式忽略 | `\|> ignore` |
| `FS0025` | 模式匹配不完整 | 补分支或 `_` |
| `FS0041` | 方法重载无法确定 | 加类型注解 |
| `FS0039` | 名字未定义 | 检查 `open`、文件顺序、项目引用 |
