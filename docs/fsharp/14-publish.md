---
title: 14 · 发布
---

# 14 · 发布

::: tip 本章场景
把 `Duel.Web` 变成一个可以拷到别的机器上运行的目录，并搞清楚发布产物里都有什么、
F# 的 AOT 到底卡在哪。
:::

## 定义

**1. `build` 产出中间产物，`publish` 产出「可以拷走的东西」。** `dotnet publish` 会把
项目输出与所有依赖复制到一个目录，并生成 `*.deps.json` 与 `*.runtimeconfig.json`——
后者告诉运行时「用哪个框架、什么版本」。

**2. 两种发布形态：**

| 形态 | 命令 | 需要目标机装运行时 | 体积 |
|---|---|---|---|
| 框架依赖 | `dotnet publish -c Release` | 需要对应 .NET 运行时 | 小（几 MB + FSharp.Core） |
| 自包含 | `dotnet publish -c Release -r win-x64 --self-contained` | 不需要 | 大（运行时几十 MB） |

**3. RID（runtime identifier）** 指定目标平台：`win-x64`、`linux-x64`、`osx-arm64`。
自包含必须给 RID；框架依赖可以不给。

**4. 裁剪（trim）与 AOT 是两件事：**

- **裁剪**：删掉没被引用的代码，减体积，但依赖反射的代码可能被误删。
- **AOT**：编译成原生机器码，不经过 JIT，启动快、不需要 JIT，但**反射受限**。

**5. 配置来源的顺序**（后者覆盖前者）：`appsettings.json` → `appsettings.{Environment}.json`
→ 环境变量 → 命令行参数。所以发布后改端口不需要改文件：

```bash
ASPNETCORE_URLS=http://0.0.0.0:8080 ./Duel.Web
# 或
./Duel.Web --urls http://0.0.0.0:8080
```

**6. `ASPNETCORE_ENVIRONMENT`** 决定加载哪个环境配置文件，并影响错误页的详细程度；
生产默认是 `Production`。

## 实际发布

```bash
dotnet publish Duel.Web -c Release -m:1
```

产物目录（`Duel.Web/bin/Release/net10.0/publish/`）：

```text
appsettings.Development.json           127
appsettings.json                       151
Duel.Domain.dll                      31232
Duel.Web.dll                         41472
Duel.Web.exe                        162304
FSharp.Core.dll                    2405672
Duel.Web.deps.json                    2888
Duel.Web.runtimeconfig.json            491
web.config                             494
...（FSharp.Core 的本地化资源 dll）
```

三点观察：

1. **`FSharp.Core.dll` 有 2.4 MB。** 这是 F# 的标准库，框架依赖发布也要带上它——它不在 .NET 运行时里。
2. **`Duel.Web.exe` 只是启动器。** 真正的代码在 `Duel.Web.dll`；exe 负责按 `runtimeconfig.json`
   找到运行时并启动。
3. **`web.config` 是给 IIS 用的**，Linux 上忽略即可。

运行：

```bash
cd Duel.Web/bin/Release/net10.0/publish
./Duel.Web --urls http://127.0.0.1:5301
```

## 一个真实的坑：工作目录

ASP.NET Core 默认把**当前工作目录**当作 content root。发布之后从别的目录启动：

```bash
cd /opt && /opt/duel/Duel.Web --urls http://0.0.0.0:8080
```

`appsettings.json` 就找不到了（它跟着 exe 在 `/opt/duel/`）。本文的示例不读配置，所以看不出差别；
一旦代码开始读 `appsettings.json` 或 `wwwroot`，问题立刻出现。两种修法：

```fsharp
// 在 Program.fs 开头，把工作目录固定到 exe 所在目录
Directory.SetCurrentDirectory(AppContext.BaseDirectory)
```

或者显式指定 content root：

```bash
./Duel.Web --contentRoot /opt/duel --urls http://0.0.0.0:8080
```

（`--contentRoot` 是 ASP.NET Core 的命令行参数，发布后的 exe 直接接受。团队里的服务端项目用的是第一种写法。）

## AOT 在 F# 里的真实状态

F# 代码可以编译成 NativeAOT，但有两类障碍要提前处理：

**1. JSON 序列化。** AOT 会关闭运行时的反射式序列化（`JsonSerializerIsReflectionEnabledByDefault=false`），
于是必须给每个 DTO 写 `JsonSerializerContext`（源生成）。本文用的 `Results.Ok(对象)` 走的是
默认反射路径，**在 AOT 下需要改成显式的源生成上下文**。

**2. F# 类型的形状。** 记录与 DU 在 AOT 下没有额外问题，但第三方转换器
（比如 `FSharp.SystemTextJson`）依赖反射扫描类型，裁剪后可能失效。

本文没有验证 AOT 发布（需要 C++ 链接器与平台 SDK），所以不给出「已验证」的命令。
如果你想试，最小路径是：

```bash
dotnet publish Duel.Web -c Release -r win-x64 \
  -p:PublishAot=true -p:StripSymbols=true -m:1
```

然后把 DTO 序列化改成源生成上下文，再跑一遍本文的 curl 流程——**验证过才算支持**。

## 练习

1. 发布成自包含的 `linux-x64`（需要网络拉取 runtime pack），确认目标机不需要运行时。
2. 给项目加一个 `JsonSerializerContext`，把 `CardDto[]` 与 `MatchDto` 注册进去，
   然后用 `--source-generation` 的思路替换 `Results.Ok(...)` 的默认序列化。
3. 用环境变量改端口与日志级别（`Logging__LogLevel__Default=Debug`），不重新发布。

## 常见错误

**在发布目录之外启动。** 如上：`appsettings.json` 找不到，配置全用默认值，表现为「端口不对 / 日志级别不对」。

**自包含发布离线失败。** `--self-contained` 需要 NuGet 上的 runtime pack；没网就报还原失败，
先在有网环境还原或使用本地缓存。

**忘记 `-m:1`。** 多项目发布同样会踩并行节点的坑，表现仍是「0 个错误但失败」。

**以为发布就等于 AOT。** `dotnet publish -c Release` 只是收集文件，仍然需要 JIT；
AOT 必须显式 `PublishAot=true` 且准备好 C++ 工具链。

**AOT 之后 JSON 变空对象。** 反射被裁掉后，序列化器找不到属性；必须用源生成上下文，
或者给每个 DTO 手写 `JsonConverter`。

**把 `bin/` 整个目录拷走。** 里面混着 Debug/Release 与中间产物；只拷 `publish/` 目录。
