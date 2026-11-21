---
title: 选型与风格
---

# 选型与风格

这一页不写访谈，只写**从公开代码里能直接读出来的东西**：用了什么、怎么组织、
哪些写法反复出现。样本是组织下的一部分仓库，没读过的代码不猜。

::: tip 口径
下文的每条判断都对应一个能打开的文件。仓库多为多人协作，所以这里说的是**产物上看得见的风格**，
不是某个人的偏好全貌——那需要本人来写。
:::

## 一张总表

| 语言 / 平台 | 主要用在 | 代表仓库 | 看得见的选择 |
|---|---|---|---|
| C# / .NET 10 | 服务端与几乎所有工具 | fyserver、Prism、polaris、Solstice 系列 | `net10.0` + `Nullable` + `ImplicitUsings` 全开；`UAssetAPI` 固定 1.1.0 |
| Go + Gin | 第二套服务端 | kards-server-go | `gin.New()` 而非 `Default()`，中间件与路由分组全部手写 |
| Rust | 规则核心 | kards-client-headless | `serde` 做 JSON 边界、`sha2` 算目录指纹 |
| C++20 + CMake | 注入 / hook / 编辑器插件 | KMod 两个加载器、AssetRegistryTool | 构建选项即特性开关（`-DKMOD_DEV` / `-DKMOD_OVERLAY`） |
| TypeScript + Vue | 服务端后台界面 | fyserver `AdminUi/` | 只产出静态页，由宿主当静态资源托管 |
| Markdown | 文档 | 本站、kmod-docs | VitePress / mdBook，构建产物纯静态 |

## 共同口味

这几条在不同语言、不同项目里反复出现，基本可以当组内默认值：

1. **.NET 10 全线，依赖版本写死。** `UAssetAPI 1.1.0` 在 solstice-kismet、solstice-cskismet、polaris 里是同一个版本号——不是懒得升，是「行为已验证过」的版本才有价值。
2. **能 AOT 就 AOT，能源生成就源生成。** fyserver 的 csproj 直接把 `JsonSerializerIsReflectionEnabledByDefault` 关成 `false`，逼所有序列化走源生成上下文。
3. **能零依赖就零依赖。** [solstice-pak](/projects/solstice-pak) 只碰 BCL（`BinaryWriter` + `SHA1`），因此能跑进 Blazor WASM。
4. **容器层与语义层分开。** [solstice-bin](/projects/solstice-bin) 只认字节怎么排，[solstice-assetregistry](/projects/solstice-assetregistry) 才认「资产是什么」；前者能做到「不动就逐字节不变」，后者做不到。
5. **一个库一件事，靠子模块拼。** Solstice 系列六个仓库，每个只负责一段格式。
6. **写回必须自校验。** 序列化 → 读回 → 比对跳转落点 / 其余函数字节不变，三步缺一不可。
7. **先有 CLI，再有 UI。** KismetDecompiler、solstice-*、polaris、Solstice-winter 都有命令行入口；界面是后加的壳。
8. **重复劳动脚本化。** 仓库里到处是 `.ps1`：`run.ps1`、`build.ps1`、`stage.ps1`、`package.ps1`、`Smoke-Test.ps1`。
9. **数据内嵌进二进制。** Go 侧是 `library_embed.go` + `go:embed`；C# 侧是把 `library/*.json` 标成 `CopyToOutputDirectory=Always` 随产物发。目的都一样：分发时只有一个文件加一个配置。
10. **中文注释写「为什么」，英文留给日志与标识符。** 注释里出现的是「不设这项会挂」这种因果关系；`log.Printf("server initializing")` 这种一行日志是英文。

## 按语言看写法

### C#：至少三种写法并存

不是不统一，是三种场景各用一套：

- **fyserver 的 `Program.cs`**：顶格 top-level statements，用 `// ==================== 配置与共享服务 ====================` 这种横幅分段；所有服务**先手工 `new` 出来**（初始化顺序由人控制：先存储、再编解码、再匹配），然后逐个 `services.AddSingleton(实例)` 注册进去——容器只负责取，不负责构造。注释写的是「为什么这么写 + 历史上踩过什么」，csproj 里甚至留了历史备注：Razor Pages 版后台在 AOT 下启动会抛 `TypeLoadException`，所以改成了纯静态后台。
- **Prism 的 `PakTool.Core`**：`namespace PakTool.Core;` 文件级命名空间、`public sealed class`、私有字段 `_provider`、常量带可读的数量级（`const long MaxInlineMediaPreviewBytes = 96L * 1024 * 1024;`）。
- **polaris 的编译器**：`public sealed record CheckReport(...)` 位置记录当返回值，中文 `<summary>` 直接写清「序列化 → 读回 → 比对 → 检查跳转目标」，错误信息里带 `@{offset}`。

共同点：可空引用类型当真在用（`DefaultFileProvider? _provider`），集合表达式（`List<BPNode> Nodes = [];`）已经替代了 `new List<BPNode>()`。

### Go：把「显式」写在脸上

- `main.go` 里没有魔法：`gin.New()` + 一条条 `r.Use(...)`，路由按 `auth.Group(...)` 分块（连 `{ }` 都写出来），`http.Server` 的四个超时（Header / Read / Write / Idle）全部显式给值，最后 `signal.Notify` + 阻塞等退出。
- 查表和逻辑分开：`pkg/deckcode/parser.go` 顶部先摆三张 `map`（国家代码、阵营→代码、默认总部），解析函数在下面引用它们。
- 日志与错误消息是英文小写开头，`log.Fatalf("failed to initialize config: %v", err)` 这种标准写法；面板与文档是中文。

### Rust：压行压到极限

kards-client-headless 的 `engine.rs` 是另一种极端：

```rust
pub struct Core {pub defs:BTreeMap<String,Definition>,pub hash:String}
pub fn hash<T:Serialize>(value:&T)->String {format!("{:X}",Sha256::digest(serde_json::to_vec(value).unwrap()))}
```

`=` 与 `:` 两侧不空格、多个语句挤一行、校验和构造塞在同一个 `impl` 里。读起来密，但换来的是「一个文件能整屏看完」。同时它把 JSON 当跨语言边界，用 SHA-256 指纹保证「卡牌定义变了但产物没重生成」能被发现。

### C++：一模块一对文件

KMod 的 `core/src/` 是典型的小模块拼装：`kmod_log`、`lua_host`、`lua_worker`、`native_mods`、`net_conn`、`net_redirect`、`reflect`、`http`，每组一对 `.h` / `.cpp`。

- 头文件 `#pragma once`，顶部一段注释先交代清楚事实：日志目录、保留几份、每行格式、级别过滤规则。
- 枚举与前缀配套：`KLOG_DEBUG`…、`KLogInit` / `KLog` / `KLogMsg` / `KLogDir`，函数后面对齐行尾注释说明可重复调用与否。
- 反射字段表用「字符串名 → 偏移变量」的静态数组集中在 `namespace Rf { namespace { ... } }` 里，改版时只需要改一张表。

### UI：能算的就不问用户

- WPF + Nodify（Solstice-winter、Flora）、Avalonia（Prism）、AdonisUI（KismetReactor）。
- Prism 的节点图用 Microsoft.Msagl 做自动分层布局，节点位置是算出来的——这也正是「不还原原作者布局」的底气：cooked 资产里本来就没有位置信息。

## 架构惯例

| 惯例 | 具体形态 | 出处 |
|---|---|---|
| 单进程单端口 | 一个 Kestrel host 同时接 HTTP 与 WS 升级请求 | fyserver |
| 后台做成静态页 | Vue 构建到 `wwwroot/admin-ui/`；Go 侧是 `adminui/static/*.html` 七个模板页 | fyserver / kards-server-go |
| 小库靠子模块组合 | `external/UAssetRegistry`、`external/ULocres` | solstice-assetregistry |
| 写回三闸 | 序列化 → 读回 → 其余函数字节 SHA-256 不变 | polaris / solstice-kismet |
| 配置 + schema | `config/serverOptions.schema.json` 与 `flags.json` 同置 | fyserver |
| 拿提交短哈希当版本 | `kards-server-go-windows-amd64-8ba6ea4.exe` | kards-server-go |
| 离线可用 | polaris 的编译器工程直接引用 MSBuild 自带的 Roslyn（`$(MSBuildToolsPath)\Roslyn\bincore`），不走 NuGet | polaris |

## 成员技术轮廓

只列公开可见的部分：能对应到仓库与产物的语言面。**不推断个人偏好**，也不代表全部工作量。

| 成员 | 公开可见的语言 / 栈 | 可观察的产物 | 备注 |
|---|---|---|---|
| [vekolyram](https://github.com/vekolyram) | C#（.NET 10 / ASP.NET Core）、C / C++、Markdown | [fyserver](/projects/fyserver)、[B64XorDecryption](/projects/b64xordecryption)、[UAssetRegistry](/projects/uassetregistry)、本站 | 编解码逆向与服务端是同一条线；文档也自己做 |
| [kardswalker](https://github.com/kardswalker) | Go、C#、C++ | [kards-server-go](/projects/kards-server-go)、[Prism](/projects/prism)、[AssetRegistryTool](/projects/assetregistrytool) | 同一协议面写了第二套实现；从 Go 服务端到桌面工具再到 UE 插件 |
| [Xuewu-awa](https://github.com/Xuewu-awa) | C#（贴图 / 资产管线、Avalonia） | [Prism](/projects/prism) | `UAssetTexture.Core` 保持不依赖 CUE4Parse，让进程内与 CLI 共用一个解析器 |
| [OhMinecraftLauncher](https://github.com/OhMinecraftLauncher) | C# 服务端 | [fyserver](/projects/fyserver) | 服务端侧 |
| [moshuidefenshi](https://github.com/moshuidefenshi) | — | 无公开仓库 | 参与内部逆向与验证 |

## 这一页的出处

读过的样本（都来自公开仓库）：

- `fyserver/fyserver.csproj`、`fyserver/Program.cs`
- `kards-server-go/main.go`、`kards-server-go/pkg/deckcode/parser.go`
- `Prism/PakTool.Core/PakArchiveSession.cs`、`Prism/BlueprintGraph/BPGraph.cs`
- `polaris/src/Polaris.Compiler/BytecodeCheck.cs`、`Polaris.Compiler.csproj`
- `solstice-kismet/src/Solstice.Kismet/Solstice.Kismet.csproj`
- `kards-client-headless/Tools/HeadlessCore/src/engine.rs`
- `KMod-Loader-Windows/core/src/kmod_log.h`、`core/src/reflect.cpp`

样本有限，写错的地方欢迎直接改：见[写作与取证约定](/lab/conventions)。
