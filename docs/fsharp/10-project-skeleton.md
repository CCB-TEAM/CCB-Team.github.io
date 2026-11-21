---
title: 10 · 项目骨架
---

# 10 · 项目骨架

::: tip 本章场景
把前九章的东西装进一个真实的解决方案：一个领域库、一个 Web 项目、一个测试项目。
后面三章都基于这个骨架，所以这一章的命令要能原样跑通。
:::

## 定义

**1. 解决方案（solution）是一个项目清单，不参与编译。** .NET 10 的 `dotnet new sln` 默认生成
`.slnx`（XML 格式），比老的 `.sln` 更短；两者都有时以你传给 `dotnet build` 的文件为准。

**2. 项目（`.fsproj`）是编译单位。** 它声明四件事：

| 声明 | 作用 |
|---|---|
| `TargetFramework` | 目标框架，本文统一 `net10.0` |
| `<Compile Include=...>` 顺序 | **编译顺序**，决定谁能看见谁 |
| `<ProjectReference>` | 依赖另一个项目（会传递） |
| `<PackageReference>` | NuGet 依赖（本文没有） |

**3. 项目引用是有方向的。** `Duel.Web` 引用 `Duel.Domain` 表示「Web 能看见 Domain」，
反过来不行。这既是编译约束，也是分层约束——依赖方向画错，编译不过。

**4. 输出类型。** Web 模板与 console 模板是 `Exe`（需要一个 `[<EntryPoint>]`），
classlib 是库（没有入口点）。F# 的 `[<EntryPoint>] let main args = ...` 返回 `int`，
这个 `int` 会成为进程退出码。

**5. 生成物在 `bin/` 与 `obj/`**，都可以删掉重建。`obj/` 里是还原结果与中间产物，
`bin/` 里是编译输出。

## 命令

以下命令在空目录里按顺序执行（本教程实际使用的就是这一组）：

```bash
dotnet new sln -n Duel
dotnet new classlib -lang F# -o Duel.Domain
dotnet new web -lang F# -o Duel.Web
dotnet new console -lang F# -o Duel.Tests

dotnet sln Duel.slnx add Duel.Domain/Duel.Domain.fsproj Duel.Web/Duel.Web.fsproj Duel.Tests/Duel.Tests.fsproj
```

项目之间的引用可以手改 `.fsproj`，也可以用 CLI：

```bash
dotnet add Duel.Web reference Duel.Domain
dotnet add Duel.Tests reference Duel.Domain
```

## 三个 `.fsproj`

```xml
<!-- Duel.Domain/Duel.Domain.fsproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Domain.fs" />
    <Compile Include="Stores.fs" />
  </ItemGroup>
</Project>
```

```xml
<!-- Duel.Web/Duel.Web.fsproj -->
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

```xml
<!-- Duel.Tests/Duel.Tests.fsproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Program.fs" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\Duel.Domain\Duel.Domain.fsproj" />
  </ItemGroup>
</Project>
```

注意 `Microsoft.NET.Sdk.Web` 与 `Microsoft.NET.Sdk` 的区别：前者多引用了 ASP.NET Core 框架，
并提供 `WebApplication`、`IHost` 这些类型；领域库不需要它。

## 目录

```text
Duel/
├── Duel.slnx
├── Duel.Domain/
│   ├── Domain.fs          # 类型 + Rules
│   ├── Stores.fs          # 存储 + Seed
│   └── Duel.Domain.fsproj
├── Duel.Web/
│   ├── Dtos.fs            # 线上格式 + Dto 映射
│   ├── Api.fs             # 处理器（请求 → IResult）
│   ├── Program.fs         # 组合根
│   ├── appsettings.json   # 模板生成
│   └── Duel.Web.fsproj
└── Duel.Tests/
    ├── Program.fs
    └── Duel.Tests.fsproj
```

## 构建设置

`Program.fs` 的入口点（来自 Web 模板）：

```fsharp
[<EntryPoint>]
let main args =
    let builder = WebApplication.CreateBuilder(args)
    // ...
    app.Run()
    0
```

`args` 会送给 `CreateBuilder`，所以命令行参数（`--urls`、`--environment`）能生效：

```bash
dotnet run --project Duel.Web --urls http://127.0.0.1:5201
```

`appsettings.json` 由 Web 模板生成，`CreateBuilder` 默认会读它 + 环境变量 + 命令行参数。
本文没有用到配置项，但结构在那里，需要时用 `builder.Configuration["Key"]` 或
`GetSection(...).Get<T>()`。

## 一个真实的构建坑

在多项目解决方案上，`dotnet build` 可能失败成这样：

```text
生成失败。
    0 个警告
    0 个错误
```

**没有错误、没有警告，但就是失败。** 这是 MSBuild 并行节点在某些环境下的问题；加 `-m:1`
串行构建即可：

```bash
dotnet build -m:1
```

这不是 F# 的问题（C# 同样会遇到），但在 F# 项目里最容易被误认为「编译器没报错所以代码没问题」。
团队内部的其他项目也踩过同一个坑。

## 练习

1. 把 `Duel.Tests` 改成 `dotnet new xunit -lang F#`，把 `Rules` 的断言搬过去。
2. 给 `Duel.Domain` 加一个 `Directory.Build.props`，统一 `TargetFramework`。
3. 用 `dotnet build Duel.Web -m:1` 单独构建 Web 项目，观察它是否会自动带上 Domain。

## 常见错误

**`.sln` 与 `.slnx` 混用。** `dotnet sln add` 默认写进同目录的解决方案文件；两个都存在时
要显式指定文件名，否则项目加进去的不是你以为的那个。

**项目没加进解决方案。** `dotnet build`（不带参数）在解决方案目录下只构建清单里的项目；
新项目忘了 `sln add` 就会出现「我明明改了代码但没生效」。

**项目引用方向反了。** `Domain` 引用 `Web` 会导致「Web 里的类型未定义」——因为它排在后面。
依赖方向应当是「上层引用下层」。

**在 Domain 里 `open Microsoft.AspNetCore.*`。** 一旦这样做，领域库就绑死了 Web 框架，
测试、控制台复用都要拖框架进来；`Microsoft.NET.Sdk` 也不会替你加那份引用，编译直接报错。

**把 `Program.fs` 放在 `.fsproj` 第一条。** 它会看不见 `Api.fs`，报「未定义」。
编译顺序是文件顺序，不是字母顺序。
