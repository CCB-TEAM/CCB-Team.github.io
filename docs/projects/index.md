---
title: 项目总览
outline: [2, 2]
---

# 项目总览

CCB-TEAM 的公开工作集中在两条主线：**游戏服务端与协议复刻**（KARDS 客户端协议、私服实现与端到端验证）
以及 **Unreal Engine 资产 / 蓝图工具链**（`.pak`、`AssetRegistry.bin`、`.locres`、Kismet 字节码）。
此外还有逆向工程与图形方向的储备项目，以及一批在上游基础上 Fork 的衍生项目。

这一页比一份清单更细一点：每个项目给出 **架构**（分成哪几层、关键依赖、进程与模块边界）
和 **实现细节**（真正决定成败的工程决策），末尾单独标出 **边界**——没做的事写清楚，
比含糊地宣称「已支持」有用。

::: tip 怎么读
- 只想找某个仓库：看下面的[项目索引](#项目索引)，跳到对应小节；完整仓库表在文末[公开仓库清单](#公开仓库清单)。
- 想先看工具之间怎么配合：[工具链全景](#工具链全景)。
- 想看「为什么这么写」：[团队介绍](/about/) 与[研究约定](/lab/conventions)。
:::

## 项目索引

| 方向 | 项目 |
|---|---|
| 服务端与客户端 | [fyserver](#fyserver) · [kards-server-go](#kards-server-go) · [FyClient](#fyclient) · [kards-client-headless](#kards-client-headless) |
| KARDS 模组与文档 | [KMod-Loader-Windows](#kmod-loader-windows) · [KMod-Loader-Android](#kmod-loader-android) · [kmod-docs](#kmod-docs) |
| UE 资产与蓝图工具链 | [Prism](#prism) · [UAssetRegistry](#uassetregistry) · [AssetRegistryTool](#assetregistrytool) · [ULocres](#ulocres) · [KismetDecompiler](#kismetdecompiler) · [KismetReactor](#kismetreactor) · [KardsSim](#kardsim) · [Flora](#flora) · [polaris](#polaris) · [Solstice-winter](#solstice-winter) · [Solstice 工具库](#solstice-工具库) |
| 逆向工程与协议分析 | [B64XorDecryption](#b64xordecryption) · [faction-mobile-so](#faction-mobile-so) |
| 游戏与 Web | [Crown-duel](#crown-duel) · [Solstice](#solstice) |

## 工具链全景

各仓库不是彼此独立的玩具，串起来是一条从「容器」到「语义」的流水线：

```text
容器层                                   语义层
──────────────────────────────────────────────────────────────────
.pak ──► solstice-pak（v3 读写）      ┐
      └► Prism PakTool.Core（真实游戏 pak） ├─► .uasset / .uexp
                                          │
AssetRegistry.bin ──► UAssetRegistry      │    usmap / jmap ──► solstice-jmap
                   ├► solstice-bin         │            （对象表 + 函数签名表）
                   ├► solstice-assetregistry
                   └► AssetRegistryTool（UE 5.6.1 编辑器插件）

.locres ──► ULocres（四种版本，未改动内容逐字节一致，含 CityHash64）

.uasset/.uexp ──► Kismet 字节码
                    ├─ 逆向：KismetDecompiler（字节码 → 结构化伪代码 / CFG）
                    ├─ 正向：solstice-kismet / solstice-cskismet / polaris（C# 或节点模型 → 字节码 → 写回）
                    └─ 执行：KardsSim（直译成 C#，脱离游戏本体跑对局）
```

一句话概括这些工具共同的形状：**先把字节读准，再把语义还原，最后才谈写回**；
每一步都要有可重放的验证（读回、字节比对、签名比对），否则「写出去了」和「跑得对」是两件事。

## 游戏服务端与客户端

两个语言不同、目标相同的服务端实现，加一个虚拟客户端和一个小卡池规则原型。

### fyserver

KARDS 私服服务端，目标是让**未修改的官方客户端**连上自建服务跑完登录 → 卡组 → 匹配 → 对局 → 结算。

**架构**

- 单进程、单端口：一个 Kestrel host 同时承接 HTTP 与 WebSocket 升级请求，`setting.json` 里只有一个 `portHttp`（默认 5231）
- 分层是 `Program.cs`（配置 → DI → 启动）→ `Endpoints/`（minimal API 分组：User / Player / Deck / Lobby / Match / AdminApi）→ `Services/`（UserStore / FasterKv / MatchManager / WebSocketHub / Codec / Auth）→ `Models/`
- 存储：FASTER 本地 KV（`user:username:*` 与 `user:id:*` 双索引），或 MySQL / PostgreSQL
- 后台是 `AdminUi/`（Vue 3 + Vite）源码，构建产物落在 `wwwroot/admin-ui/`，由 ASP.NET Core 当静态资源托管，管理接口是 `/admin/api/*`

**实现细节**

- 序列化走 System.Text.Json **全量源生成**（`FyJsonContext` / `ConfigJsonContext` / `StoreJsonContext`），零反射——这是 NativeAOT 单文件（约 24 MB 原生 exe）能成立的前提
- 编解码是纯 C# 的 Base64 + XOR 查表实现，不拖任何原生 DLL；[FyClient](#fyclient) 复用同一套算法，所以两边不会对不上
- `Middleware/` 做路径归一化（`/fp/`、`//fp` 等价）与 Content-Type 清理，因为客户端发来的路径和头并不总是规范
- 一个真实踩过的 AOT 陷阱固定在 csproj 里：`PublishAot` 会让 SDK 默认打开 `UseWindowsThreadPool`，而 FASTER 的设备异步写依赖托管线程池的 I/O 完成回调，切过去之后检查点永不返回，表现为改名、卡组保存、兑换码领取全部挂起、退出也不落盘
- 踢人 / 封禁的顺序是「先向该玩家的 WebSocket 发 `channel: "disconnect"`，再以 `PolicyViolation` 关闭连接」，让客户端走自己正常的断线逻辑而不是干等超时

**边界**：排行榜、成就、好友、军需箱、抽卡、乱斗、JJC 未实现；物件（头像、桌饰等）部分实现。

[项目页](/projects/fyserver) · [仓库](https://github.com/CCB-TEAM/fyserver)

### kards-server-go

同一个协议面的 Go 实现，选型上刻意与 fyserver 错开：Gin + GORM + MySQL，附预编译的 Windows 二进制。

**架构**

- 入口 `main.go`，业务在 `internal/`：`config`（配置）、`database`（GORM / MySQL）、`handlers`（HTTP 端点）、`middleware`（鉴权、头修复）、`models`（用户 / 卡组 / SDK 类型）、`game`（对局引擎）
- `internal/game` 是这套实现的重心：`manager.go` 管对局生命周期，`match.go` / `match_end.go` 是一局的状态推进与结算，`action_store.go` 记录动作序列，`online.go` 管在线连接，`websocket.go` 是实时通道，`bot.go` / `random.go` / `deal.go` / `cards.go` / `deck_data.go` 是发牌、卡池与 AI
- `pkg/` 放可复用件：`deckcode/parser.go`（卡组码解析，带 `parser_test.go`）、`security/`、`utils/`；`internal/handlers/library_embed.go` 把 `library.json` 这类大表编进二进制

**实现细节**

- 鉴权走 JWT（`middleware/auth.go`），与对局访问控制 `match_access.go` 分开，保证「能连上」不等于「能看这一局」
- `middleware/header_fix.go` 与根目录的 `IPRedirection` 一起说明它处理过客户端连接层面的现实问题：客户端期望的地址与实际监听地址不一致时要重定向
- `stubs.go` 明确把尚未实现的端点做成占位，而不是返回 404 让客户端莫名其妙地卡住
- `release/` 里带一个 `kards-server-go-windows-amd64-*.exe` 与 `.sha256`，不装 Go 也能先跑起来看行为

**边界**：仓库没有 README，功能面与 fyserver 并不一一对应；以代码与实际返回为准。

[项目页](/projects/kards-server-go) · [仓库](https://github.com/CCB-TEAM/kards-server-go)

### FyClient

配合 fyserver 的**虚拟测试客户端**：纯 C# 复刻客户端协议，一条命令跑通「登录 → 匹配 → 对局 → 结算」。

**架构**

- 四个文件各管一件事：`Program.cs`（命令分发与场景编排）、`Player.cs`（单玩家的 HTTP + WebSocket 全部调用）、`Protocol.cs`（DTO 与 JSON 源生成上下文）、`Codec.cs`（编解码）
- 命令是 `login` / `solo` / `duel` / `ws`，外加调试用的 `decode`；`--server`、`--ws` 指定地址

**实现细节**

- 编解码与服务器 `CodecService` 同源：Base64 + XOR、查表密钥、3 字节 `actionId`，全部托管实现
- 对局动作是编码后塞进 `{"a": "<编码串>"}` 提交到 `/matches/v2/{id}/actions`；WS 的认证头是 `codec.Encode(用户名)`，**不带** `JWT ` 前缀——这两处最容易写错
- 请求体 JSON 用 `snake_case`，与服务器的源生成上下文对齐；序列化也走源生成，保持 AOT 友好
- `duel` 用 `battle_code` 让两个账号互相匹配再自动对打，输出双方胜负，本身就是一条可复现的回归用例

**边界**：它验证的是协议与流程，不验证画面与真实客户端的 UI 行为。

[项目页](/projects/fyclient) · [仓库](https://github.com/CCB-TEAM/FyClient)

### kards-client-headless

不需要 UE、不需要 GPU 的小卡池规则与 AI 原型：Rust 核心负责规则与随机数，C# 侧负责网络、HTTP 与命令行。

**架构**

- Rust 核心（`Tools/HeadlessCore`）：`engine.rs`（对局推进）、`ir.rs`（卡牌效果中间表示）、`model.rs`（状态模型）、`advanced.rs`、`lua.rs`（Lua 卡牌脚本宿主）、`ffi.rs`（C ABI 导出）；既是库也是 CLI，带 `tests/aggro.rs`、`tests/effects.rs`
- C# 侧（`Tools/HeadlessKards`，.NET 10）：`FyCodec.cs` / `FyProtocol.cs` / `FyNetwork.cs` 复用客户端协议，`NativeSnapshot.cs` 与 `RustCore.cs` 通过 FFI 把状态搬进搬出，`Randomness/` 下分 `ClientRandom`、`HostShuffleRandom`、`LogicRandom` 三种随机源
- 卡牌定义可以用 C# 写（`Tools/CardAuthoring`）或 Lua 写，导出成数据包后由 Rust 核心解释执行

**实现细节**

- 随机数被拆成三个来源并各自可追踪（`RandomTrace`），因为「同样的种子复现不出同一局」是对局模拟里最难查的一类 bug（见仓库 `RANDOMNESS.md`）
- `RulesParityTest.cs`、`ProtocolTest.cs`、`ProtocolFixtures.cs` 是对照测试：把网络协议与规则行为钉在固定夹具上
- `Tools/HeadlessKards/*.md`（`NETWORK.md` / `AGGRO.md` / `CARD-SCRIPTING.md` / `RANDOMNESS.md`）是这套原型的实际文档，比顶层 README 更有信息量

**边界**：只覆盖已实现的卡包与规则，不是完整客户端；隔离环境下的双机器人测试通过，但**与原版客户端的完整对战未验证**。

[项目页](/projects/kards-client-headless) · [仓库](https://github.com/CCB-TEAM/kards-client-headless)

## KARDS 模组与文档

两个平台的加载器共享同一套 Lua 模组 API、反射层与 C++ 模组头文件，文档单独一个仓库。

### KMod-Loader-Windows

Windows 版 KARDS（UE 5.6）的模组加载器：Lua 模组、C++ 原生模组，以及一个不随发布出去的实验性覆盖层。

**架构**

- `proxy/`：一个 `dwmapi.dll` 代理，转发系统 dwmapi 的**全部导出**，并从**自己的线程**启动核心——绝不在 `DllMain` 里做加载，这是注入类 DLL 最常见的死锁来源
- `core/`：`resolver.cpp` 在 PE 镜像里扫描 `GUObjectArray`、名字池与 `UObject::ProcessEvent`，再用 Zydis 反汇编找蓝图解释器与 `GNatives`——**不写死偏移**
- `core/src/x64.cpp`：自研 inline hook 引擎，负责重定位 RIP 相对操作数与相对跳转
- `core/src/win/overlay.cpp`：基于 `IDXGISwapChain::Present` 的 Dear ImGui 覆盖层（D3D11 / D3D12），`-DKMOD_OVERLAY=ON` 才编进去，用于测试原生模组
- Lua 宿主、`reflect.*` 反射层、模组加载脚本与 `kmod.h` 与 Android 版**同一份源码**

**实现细节**

- 安装方式是把 `dwmapi.dll` 与 `kmod/` 目录放到 `kards-Win64-Shipping.exe` 旁边，不改游戏文件；卸载就是删掉那个 DLL。若目录里已有 UE4SS 的 `dwmapi.dll`，必须先改名
- 模组放进 `kmod/mods/`（文件夹或 `.kmod` 包），日志在 `kmod/logs/kmod.log`
- 原生模组导出 `kmod_start` / `kmod_stop`（`KMOD_MOD(...)` 宏），`mod.json` 里用 `format: 2` + `platform` 数组声明同一份源码的两个平台产物；标了 ANDROID ONLY 的 API 在 Windows 上是空指针，靠 `api->platform` 分支
- `tools/gen_proxy_exports.py` 从系统 `dwmapi.dll` 重新生成导出表；`tools/stage.ps1` / `package.ps1` 负责部署与出包，构建需要 VS C++ 工作负载、CMake、Python 与 Dumper-7 SDK 头

**边界**：覆盖层是实验特性、不进发布包；需要自己准备 Dumper-7 SDK 头与 Lua 源码；KARDS 相关权利归其所有者。

[项目页](/projects/kmod-loader-windows) · [仓库](https://github.com/CCB-TEAM/KMod-Loader-Windows)

### KMod-Loader-Android

Android 版加载器：模组通过 UE 反射读写游戏对象、从 pak 里加载资产，不需要 root，但要把加载器塞进 APK 重新打包签名。

**架构**

- `loader/` → `libkmod.so`，从 `SplashActivity` 被加载；`core/` → `libkmodcore.so`，里面是 ProcessEvent hook、Lua 5.4 VM、反射层与日志
- `core/lua/` 是脚本侧：`modloader.lua`、`modmanager.lua`（游戏内 Mods 页面）、`commands.lua`（控制台命令）
- `tools/`：`DexTool` 改写 `SplashActivity`，`repack.py` 重打包；`build.ps1` 一条命令完成构建 + 重打包 + 签名
- `overlay/` 是开发版的悬浮控制台（Java）

**实现细节**

- 模组是 `.kmod`（一个 zip）加 `mod.json`，支持设置、本地化与**带版本约束的依赖**（`kmod>=0.2.0`、`kards>=1.61`）
- 内置崩溃处理与命令控制台，因为移动端出问题没有控制台可看，日志与崩溃捕获是唯一的诊断途径
- 仓库只有加载器源码：不含游戏、修补后的 APK、游戏的 C++ SDK dump 或任何签名密钥；SDK 要自己用 Dumper-7 / MobileDumper-7 出

**边界**：需要自备官方 APK 与签名密钥；重打包行为可能违反游戏的 ToS/EULA，仅供研究与学习。

[项目页](/projects/kmod-loader-android) · [仓库](https://github.com/CCB-TEAM/KMod-Loader-Android)

### kmod-docs

KMod 的中文文档站：安装（Windows / Android）、模组格式、Lua API、C++ 模组、控制台命令、调试与自行构建。

- mdBook 构建，页面在 `src/`，目录由 `src/SUMMARY.md` 维护，推到 `main` 后由 GitHub Actions 发布
- 文档本身也是使用门槛的一部分：加载器的「怎么装」比「怎么编译」更容易劝退人

[项目页](/projects/kmod-docs) · [技术文档站](https://ccb-team.github.io/kmod-docs/) · [仓库](https://github.com/CCB-TEAM/kmod-docs)

## UE 资产与蓝图工具链

从容器格式（`.pak` / `AssetRegistry.bin` / `.locres`）到语义（Kismet 字节码），再到把它们重新编译回去。

### Prism

UE4/UE5 `.pak` 模组工具箱（Windows + Android）：浏览预览、贴图替换、pak 合并，以及在同游戏的 PC 与移动端构建之间**移植贴图**。

**架构**

- 一个共享库 + 两个外壳：`Prism.Desktop`（Avalonia 界面与逻辑，`net10.0`）被 `Prism.Desktop.Desktop`（Windows 单文件发布）与 `Prism.Desktop.Android`（arm64-v8a APK）复用
- `PakTool.Core`：pak 会话、预览、导出、合并、映射文件、locres；依赖 `external/CUE4Parse`（仓库外提供）
- `UAssetTexture.Core`：贴图解析、mip 编码、替换（UAssetAPI + ImageSharp），**刻意不含 CUE4Parse**；所有需要 pak 会话的部分放在 `UAssetTexture.PakConversion`
- `UAssetCLI` 直接引用 `UAssetTexture.Core`，所以进程内路径与 CLI 路径共用**同一个**贴图解析器、格式表与 mip 写入器
- `UAssetAPI-master/` 是带本地补丁的 vendored 副本；`tools/` 里是 astcenc 与 texconv

**实现细节**（贴图跨平台移植是这套工具的核心）

1. 打开**目标平台**的「母 pak」，读索引；
2. 解开**另一个平台**的来源 pak，按 pak 内部路径配对；
3. 逐个把来源贴图的像素解码，再**重新编码成母 pak 里那个资产的格式**，写回它的字节范围；
4. 打包。

为什么输出格式必须取母 pak：cooked 资产在 `.uasset` 头里声明了像素格式、尺寸与 mip 布局，头本身决定每个 mip 落在 `.uexp` / `.ubulk` 的哪个区间，替换只能覆盖这些区间、改不了头。

- 两种路径自动选择：格式与 mip 布局相同时直接复制压缩数据（`RawCopy`，无损、快、不需要映射文件）；不同时走解码 + 重编码（`ReEncode`，需要 `.usmap`/`.jmap`，桌面端还要 astcenc/texconv）
- 四种输出模式：默认 `ReplacedOnly` 只装这次改动过的资产（实测 7 GB 母 pak + 1 张贴图 → 685 KB 产物、3.2 s），`MergeSourceFiles` 额外带上来源 pak 里与平台无关的文件（蓝图、`.locres`、数据表），`FullRepack` / `MergeAll` 则是整包重建
- 转换前先做资产分类探测（只构造主导出、不解码像素），音频 / 字体 / 蓝图被识别为「平台无关，原样搬运」而不是报成贴图解码失败
- 集成测试 455 条断言，覆盖两种转换路径、四种输出模式、合并优先级、locres 往返、非 ASCII pak 路径、音频与媒体替换、真实 `UAssetCLI` 替换运行等

**边界**：不分发 Oodle；`external/CUE4Parse` 与 Android 的 `.so` 需要自己补；没有映射文件的 unversioned 资产在重编码路径上会被标记为跳过并给出原因。

[项目页](/projects/prism) · [仓库](https://github.com/CCB-TEAM/Prism)

### UAssetRegistry

`AssetRegistry.bin` 的解析、快速枚举与**语义级回写**库，基于 UAssetAPI，可脱离引擎批量处理。

**架构**

- 读侧：`AssetRegistryLoader` → `FAssetRegistryReader` / `FNameTableArchiveReader` / `FAssetRegistryArchive`，产出 `FAssetRegistryState`（或只读核心字段的 `FPartialAssetRegistryState`）
- 写侧：`FAssetRegistryWriter` 重建 name 表与全局 `FStore`
- 文件布局：header（GUID + version + bFilterEditorOnly）→ name batch（count / numStringBytes / hashVersion / hashes / 2 字节头 / 字符串池）→ 全局 FStore（magic + nums[11] + AnsiString/WideString 表 + Pairs + EndMagic）→ `FAssetData[]` → 依赖段 → 包数据段

**实现细节**

- 补齐了 UAssetAPI 1.1.0 缺失的 `FAssetRegistryVersion` 18~24（前 18 个值与上游枚举一致）
- 回写是**语义级**的：tag 值统一按 `AnsiString` 编码重建，读回后全部资产与 tags 逐字段一致，但**字节与原文件不同**；要字节级一致得在解析时额外保留原始 `FValueId` 类型
- 校验说明写得很直白：`AssetRegistry.bin` 没有文件级或资产级校验和，存在的 magic 只约束结构边界；`FAssetPackageData` 里的 `CookedHash`(MD5) / `ChunkHashes`(FIoHash) 是包内容哈希，不是这张表的校验
- 提供「从零构造 / 追加 / 改字段与 Tags / 删条目」四条教程式用法，把 `FAssetData` 的构造参数讲清楚

**边界**：语义级回写的字节与原文件不同；需要字节级一致请用 [solstice-bin](#solstice-工具库) 那条「不动就原样返回」的路线。

[项目页](/projects/uassetregistry) · [仓库](https://github.com/CCB-TEAM/UAssetRegistry)

### AssetRegistryTool

UE 5.6.1 编辑器插件：拿一份基础注册表 + 当前工程里的资产，生成新的 `AssetRegistry.bin`。

- 编辑器入口是 `Tools > Asset Registry Tool`，选基础 bin、选输出路径，再从 Content Browser 选资产或直接「全部 `/Game` 资产」
- cooked 资产导入走 UE 5.6 原生的 `FPackageReader`，从最近的 `Content` 目录反推 `/Game/...` 路径，并检查同名 `.uexp` / `.ubulk` 是否存在；还能顺着 cooked 的软包引用来一起登记依赖
- 保留了旧 flow 的两个 commandlet：`List`（导出 JSON）与 `Merge`（按 `-FilterPaths` 选路径、可 `-OverwriteExistingAssets`）
- cooked 覆盖选项与「覆盖基础注册表同名项」是两个独立开关，避免互相打架

**边界**：只写注册表元数据，不会把 cooked 包变成编辑器可编辑资产；生成结果必须在目标游戏里实测——有些游戏依赖 cooked 包元数据或自定义加载行为，无法只从编辑器资产推断。

[项目页](/projects/assetregistrytool) · [仓库](https://github.com/CCB-TEAM/AssetRegistryTool)

### ULocres

UE 本地化资源 `.locres` 的读写库，覆盖四种格式版本，未修改的内容**逐字节一致**。

- 四种版本：`Legacy(v0)` / `Compact(v1)` / `Optimized_CRC32(v2)` / `Optimized_CityHash64_UTF16(v3)`
- 读入时保留原 hash 与 LUT 引用计数；只改文本、不动 key，就能写回与原文件完全相同的字节（实测 KARDS `Game.locres`：v3 / 60 命名空间 / 13471 条目 / 1 909 867 字节全等）
- 新增或改名 key 时自己算哈希：v3 逐行移植 UE 的 `CityHash.cpp`（含 bswap 版 `HashLen33to64`），再按 `TextKeyUtil::HashString` 折叠成 `(u32)low + (u32)high * 23`；v2 用对齐 `FCrc::StrCrc32` 的 UTF-16 逐字符低 8 位运算
- 13 471 组 `(namespace, key, hash)` 全量对照验证过；对外是 `file[namespace, key]` 索引器，读写都用 UAssetAPI 的 UE 类型
- 顺带成了 Solstice 系列的哈希来源：[solstice-bin](#solstice-工具库) 的 name batch 与 [solstice-assetregistry](#solstice-工具库) 都复用它的 CityHash64 实现，不另起一套

[项目页](/projects/ulocres) · [仓库](https://github.com/CCB-TEAM/ULocres)

### KismetDecompiler

蓝图 Kismet 字节码 → C++ 风格伪代码，重点是**控制流结构化**（反 `ExecuteUbergraph`）而不只是逐条翻译。

**架构**

```text
ScriptBytecode（UAssetAPI 已解析成 KismetExpression[]）
  │ FlowStackResolver        EX_PushExecutionFlow / EX_PopExecutionFlow → 静态跳转
  ▼
BuildStatements → SplitBlocks → BuildEdges → MarkReachable(+DCE) → Compact
  │ FunctionSignatures        从 LoadedProperties 还原真实签名（参数名/类型/in-out/局部变量）
  ▼
支配树 + 后支配树 + 自然循环（ComputeDominators / ComputePostDominators / FindLoops）
  ▼
EmitRegion                    if / if-else / while / do-while / switch
  │ EmitPendingGotoTargets    结构化不了的地方才落 goto + 缩进 label
  ▼
ReadabilityPasses            文本级等价改写，按趟迭代到不动点
  ▼
SemanticOptimizer（--opt）   值流内联 + 常量折叠 + 临时量改名 + 循环还原
```

**实现细节**（几条都是实测出来的，不是猜的）

- 执行流栈语义：`EX_PushExecutionFlow(a)` 压入绝对目标 `a`，`EX_PopExecutionFlow()` 无条件跳转，`EX_PopExecutionFlowIfNot(c)` **仅在 c 为假时**跳转；宏的 `continue` / `break` / 作用域退出都走这三条指令，必须先静态解析才能认出循环
- 后支配树必须补虚拟出口（给无后继块补 `succ[i].Add(exit)` 并清空 `succ[exit]`），否则整张表退化成全 1
- 自然循环的最内层块要用 worklist 从回边源点反向扩散；预先把源点放进集合会漏块
- **反 Dispatch 的 case 入口必须当可达性根**：`ExecuteUbergraph` 的每个 case 只能经 `EX_ComputedJump` 到达，CFG 里没有这条边；只从块 0 做可达性分析会把整个 case 体当死代码删掉——kards 语料里 1541 个 ubergraph 有 712 个中招
- `float` 在 C++ 侧是 `double`，隐式转换由 `EX_PrimitiveCast` 承担，token 3 = double→float、token 4 = float→double（用 `SetApplicationScale(const float)`、`MakeVector2D(double,double)` 等 UHT 签名交叉验证过）
- 蓝图函数名可能带空格（`Update Operable Color`），要收敛成合法标识符；`--inline` 仍是实验特性，会把产物膨胀数十倍，不是默认路径

**效果**：在 kards 语料（34 个资产 / 945 个函数）上做过完整导出，仓库里贴了前后对照。

[项目页](/projects/kismetdecompiler) · [仓库](https://github.com/CCB-TEAM/KismetDecompiler)

### KismetReactor

WPF 图形化字节码查看与就地修改工具，配合 KismetDecompiler / UAssetRegistry 用。

- `net10.0-windows` + AdonisUI 主题 + UAssetAPI；`MainWindow` 是主工作区
- 从窗口清单能看出功能切分：`InsertBytecodeWindow`（插入表达式）、`InsertPropertyWindow`（插入属性）、`AutoImportWindow`（自动补 import）、`ImportViewerWindow`（查看 import 表）、`InputDialogWindow`
- 面向的典型场景是「知道要改哪，但不想手算偏移」：在树上定位、插入或修改节点，再交给 UAssetAPI 序列化

**边界**：仓库没有 README，也没有发布包；属于内部实验性工具，行为以源码为准。

[项目页](/projects/kismetreactor) · [仓库](https://github.com/CCB-TEAM/KismetReactor)

### KardsSim

把蓝图 Kismet **直译成 C#** 的本地对局模拟器：不启动 UE、不进游戏，就能跑完一局并暴露状态给 AI 后端。

**架构**

- 直译器把蓝图函数（包括 ubergraph 的 case 体）翻成 C# 方法，保留原始的调用约定与 `out`/`in` 参数语义
- 对 AI 侧暴露本地 HTTP 接口：状态是 204 维向量，动作空间 299 维，另有 `actions` / `indices` / `mask` / `allActions` 与 `pendingChoice`（等待抉择的预览）
- 自己的卡组码解析器（格式解剖 + 三个踩过的坑写在仓库 `deck code` 一节）

**实现细节**

- 直译最容易静默出错的是 `out` 参数：两类情况会被误当成纯 out（见仓库的 `by-ref 形参` 与 `out 参数：两类静默失败`），所以专门做了 **九种审计模式**，用不同假设重跑同一批对局来对账
- 触发点体系（事件、光环、持续站场效果、撤退、选择点）逐个接回引擎；光环加成按**来源登记**而不是按 changeType 记账，否则存活期会算错
- 缺资产时用「从已生成产物反向重建」的方式保证重新生成的结果仍然正确

**边界**：模拟器覆盖的是已直译的部分；它证明的是「规则层面自洽」，不证明与原版客户端逐帧一致。

[项目页](/projects/kardsim) · [设计专题](/kismet-sim/) · [仓库](https://github.com/CCB-TEAM/kards-sim)

### Flora

FModel 的定制分支：把资产浏览、蓝图节点图、UMG 预览、LLM 代理编辑与 pak 打包塞进一个可停靠的工作区。

**架构**

- `FModel/`（WPF 应用、视图模型、停靠布局、蓝图查看器视图）、`FModel.BlueprintGraph/`（蓝图反编译、图模型、控件布局与属性）、`FModel/AgentUI/`（Vite + React + TypeScript，跑在 WebView2 里）
- `.claude/skills/flora-blueprint-bytecode/` 既是给 Claude Code 的工作流技能，也是内置代理的系统提示词
- 依赖本地的 CUE4Parse 与 UAssetAPI 副本；打包用内置的 repak writer

**实现细节**

- 停靠面板可以浮成**真正的 Windows 窗口**（有系统标题栏、Aero Snap、可选「总在最前」与「独立任务栏按钮」），也能再拖回去；布局存 `%AppData%\FModel\DockLayout.xml`
- 节点图本身**只读**，蓝图由语言模型通过代理工具改：代理支持 Claude（Anthropic API）或任意 OpenAI 兼容端点（DeepSeek、Qwen、Ollama…），改动以「高亮引脚与连线 + Changes 列表 + 撤销」的形式待你审阅
- 支持以**字节码对象**（JSON + 符号引用：`import:/Script/...`、属性路径、`@offset` / `#label` 跳转目标）表达编辑，Flora 负责补名字与 import、重排全部偏移；每次保存前都验证偏移、大小、CUE4Parse 读回与重新反编译
- 上下文压缩：请求超阈值（默认 100k tokens）时代理先给自己写一份摘要，Flora 再把当前打开的蓝图与 pak 状态附上、用摘要替换历史
- UMG 设计器的属性「试改」只在内存里，标黄、可逐项或整体重置，**绝不写回资产**
- pak packer 支持从已加载游戏、其他 pak 或文件夹拖入文件，能做贴图替换、`.locres` 改串、音频替换（BINKA 编码），工程存成 `.florapack`

**边界**：Windows only（WPF）；BINKA 编码依赖外部 `binka_encode.exe`（不随仓库分发）；上游 FModel 的许可与版权照旧。

[项目页](/projects/flora) · [仓库](https://github.com/CCB-TEAM/Flora)

### polaris

用 C# 写 KARDS（UE 5.6）蓝图：字段就是蓝图成员，方法就是蓝图函数，Roslyn 编译回 Kismet 字节码，写回 `.uasset`/`.uexp`，再打成 mod `.pak`。

**架构**

```text
jmap（纯）──► JmapFileReader ──► SdkEmitter ──► UHT 风格 C# SDK
                                                  ├─ CLI `polaris sdk`
                                                  └─ SdkSourceGenerator（编译期增量源生成）

用户 C# mod ──► Roslyn ──► Translator ──► BytecodeBuilder ──► BytecodeCheck
                                            ├─ AssetImportTable（类/函数 → FPackageIndex）
                                            ├─ FunctionWriter（替换 ScriptBytecode）
                                            ├─ CardAsset.Save（.uasset / .uexp）
                                            └─ ModPak（mod.pak，v3 / store / mount ../../../kards/Content/）
```

- 三个刻意的设计选择：SDK 是 **UHT 风格**（真实继承、`[UProperty]` 字段、`[UFunction]` 方法）；**不经过私有中间模型**（没有 `KArg`/`KNode`，直接从 C# 语法树发射 `KismetExpression`）；字节码层自研，UAssetAPI 只负责资产与表达式序列化
- 从纯 jmap 生成过 484 文件 / 4356 类 / 5349 结构 / 1876 枚举 / 12617 方法

**实现细节**

- 每次写盘都自校验：序列化 → 读回 → 跳转落点检查，并要求其余函数字节的 SHA-256 不变
- `polaris apply` 一条命令完成「函数 + CDO 字段 + 出 pak」：多个资产时每卡一个 pak，参数名 / 返回值 / `out` 参数不匹配直接报错，输出目录写 `mod.json` 清单
- 支持 `[PolarisAsset]` / `[PolarisReplace]` / `[PolarisPatch]` 数据注解把「改哪个资产、哪个函数」放进 mod 源码
- 反编译 → 回编译字节一致性在全量 Cards 语料上验过 6492 / 6492 个函数
- **G1 已在真实游戏内验证**：`card_unit_t_70eot` 的 mod pak（CDO `kredits` 2→0 + `OnPlayedFromHand` 字节码替换）实机生效

**边界**：只覆盖 KARDS / UE 5.6 实测过的格式；编译器是 C# 子集（struct 常量、ubergraph 事件体重排仍在做）；不做新卡、不做可视化编辑器；静态闸全绿不等于所有路径运行正确。

[项目页](/projects/polaris) · [仓库](https://github.com/CCB-TEAM/polaris)

### Solstice-winter

UE cooked 蓝图的**读写工作台**，目标形态是仿编辑器的节点视图。当前只读渲染可用，编辑未接。

| 模块 | 能干什么 | 实测 |
|---|---|---|
| `SolsticeWinter.Pak` | 读真实 pak（v11 / AES 加密索引 / Oodle） | 33808 条目；4274 个文件与 FModel 导出逐字节一致 |
| `SolsticeWinter.Index` | 扫资产建跨资产索引（类 / 函数签名 / 变量 / 引用） | 2137 资产 / 9303 函数；建 6.6 s、载 296 ms |
| `SolsticeWinter.App` | WPF + Nodify 节点视图（只读） | 打开 `BP_Logic / DrawTopCardFromDeck`：52 节点 / 46 连线 |
| `SolsticeWinter.Cli` | 命令行 `pak` / `index` / `profile` | 见仓库 `docs/INDEX.md` |

- 一个值得抄的工程细节：本机 MSBuild 并行节点会失败（表现为「生成失败 / 0 个错误」，日志里连 error 都没有），所以 `run.ps1` 固定带 `-m:1`
- 明确不做三件事：不还原原作者节点布局（cooked 资产里没有，布局是算出来的）、不把「序列化成功」当「运行时正确」、不在仓库里放游戏资产或解包产物

[项目页](/projects/solstice-winter) · [仓库](https://github.com/CCB-TEAM/Solstice-winter)

### Solstice 工具库

六个小库，一个库只做一件事，彼此靠子模块串起来：

| 库 | 职责 | 关键事实 |
|---|---|---|
| [solstice-pak](/projects/solstice-pak) | `.pak`（magic `0x5A6F12E1` / version 3）读写 | 零依赖、可跑在 Blazor WASM；对一份真实 66 520 字节 / 2 条目 pak 做过逐字节复现 |
| [solstice-bin](/projects/solstice-bin) | `AssetRegistry.bin`（v21）**容器层**：分段布局、name batch、tag store、末尾追加 | 没有待追加内容时 `Save()` 直接返回原字节副本，绝不重新序列化 |
| [solstice-assetregistry](/projects/solstice-assetregistry) | `AssetRegistry.bin` 的读取与**追加**（语义层） | 在 6 459 113 字节 / 16 250 资产的真实 bin 上验证：追加 2 个卡牌资产后 store 段与原文件逐字节一致 |
| [solstice-jmap](/projects/solstice-jmap) | 合并 jmap 活对象转储与 `AssetRegistry.bin`，出对象表与函数签名表 | 输出对象路径、函数标志、参数方向；继承链与结构成员需另查 usmap |
| [solstice-kismet](/projects/solstice-kismet) | 平铺节点模型 → Kismet 字节码，经 UAssetAPI 写回 | 只验证过 UE 5.6；另带结构还原（反编译）能力 |
| [solstice-cskismet](/projects/solstice-cskismet) | C# 源码层前端（Roslyn）→ 节点模型 → 字节码 | 不支持的语法**明确报错**而不是静默产出错字节；SDK 生成 1159 类 / 12478 方法 / 526 结构 |

几条从这些库里长出来的格式细节，都被写进 README 当「必须知道」：

- **跳转操作数是字节偏移，不是表达式下标**；`EX_Context.Offset` 是 `ContextExpression` 的序列化长度
- UE5.6 的 `KismetPropertyPointer` 必须用 `New`（`FFieldPath`）形态；`EX_Let` 要两份操作数，`EX_LetBool` 只要一份；import 链是三级、索引 1 基负数
- `.pak` v3 里数据不在 `offset` 处而在 `offset + 53`（每个条目前内嵌一份 `FPakEntry`）；`FString` 长度包含结尾 `\0`
- name batch 结束后**没有对齐填充**，`FStore` 的 `BeginMagic(0x12345679)` 紧接其后，结束标记 `0x87654321` 应落在预期位置
- name batch 的哈希必须与 UE 逐位一致（CityHash64），所以直接复用 [ULocres](#ulocres) 的实现，不自己造

**边界**：全部只验证过各自那一个 UE 版本；只支持末尾追加，不支持删除或修改既有条目；不压缩、不加密、不签名、不碰 IoStore。

## 逆向工程与协议分析

### B64XorDecryption

对局消息 codec 的独立逆向成果：一套「Base64 + 变长 XOR 密钥」的私有编码。

- 三个实现并排放在仓库里：`codec.c`（C 动态库）、`Class1.cs` / `.csproj`（C# API）、`破解加密易如反掌.cpp`（IDA 伪代码存档）
- 与 fyserver / FyClient 里的 `CodecService` 是同一套算法的不同落点；之所以单独成库，是为了在没有服务端的环境里也能验证编解码
- 用法上的关键是「查表密钥 + 变长」：密钥长度本身参与编码，不能当固定 XOR 处理

[项目页](/projects/b64xordecryption) · [仓库](https://github.com/CCB-TEAM/B64XorDecryption)

### faction-mobile-so

把 Windows 版的「盟国扩展」DLL 移植到 KARDS Android arm64 的研究工作区：只有逆向结论和骨架，**没有可用产物**。

- 已确认：安卓与 Windows 的 `FEnumParams` ABI 完全一致（48 字节、`count` 在偏移 44、13 个条目名字与值逐项相同），所以上游的 `static_assert` 与整段校验逻辑可以原样复用
- 已定位：`Enumerator[13]`、`FEnumParams`、`"EFactionEnum"` 字符串、GOT 槽等地址，都写在版本化的 profile 里（只对 1.57.26587 有效）
- 一个关键坑：`.data.rel.ro` 里的指针在文件里是 0，真实值只存在于 `.rela.dyn`（145 万条重定位），直接扫文件**什么都扫不到**，必须走重定位表还原——`tools/find_faction_enum.py` 就是干这个的
- 未完成：三个国家转换函数（`NameToEnum` / `Encode` / `Decode`）尚未定位，入口时机、`Singleton`、hook 后端（Dobby / ShadowHook）、「怎么被加载」都还开着
- 从 Windows 版继承的语义不能丢：匹配成功也要调用原函数（它拥有并释放 by-value `FString`）、`Encode` 复用原分配器只改一个字符、失败要完整回滚、枚举注册后不能卸载

[项目页](/projects/faction-mobile-so) · [仓库](https://github.com/CCB-TEAM/faction-mobile-so)

## 游戏与 Web

### Crown-duel

「皇冠决斗」：把卡兹游戏圈的事件与人物抽象成牌，做成一个能在浏览器里直接玩的决斗游戏。

- 全部内容在一个 `duel_merge.html` 里：页面、样式、卡牌数据与对战脚本都内联，打开即玩，没有构建步骤
- 也正因为是单文件，没有 README 与版本说明，玩法以源码为准

[项目页](/projects/crown-duel) · [仓库](https://github.com/CCB-TEAM/Crown-duel)

### Solstice

不是工具，是一份**技术概念仓库**：架构记录、实施计划、实验与给编码代理的提示词，围绕浏览器端的 cooked 资产检查与单向 Kismet 字节码生成。

- 五条原则写得很清楚：单向生成（不承诺反编译回来能往返）、资产本地引用（`FPackageIndex` 属于具体包，全局元数据不能替代当前资产的 Import/Export 表）、先取证再实现、安全写回（写到独立输出、验证、再读回）、诚实报告能力边界
- `docs/`（架构、路线图、兼容性矩阵、字节码生成规则）、`prompts/`（master prompt 与阶段任务模板）、`snippets/`、`experiments/`、`docs/decisions/`（ADR）
- 状态表坦率地写着「概念 / 早期工程计划」，不宣称已实现

[项目页](/projects/solstice) · [仓库](https://github.com/CCB-TEAM/Solstice)

## 相关记录

| 内容 | 说明 |
|---|---|
| [安全 QA](/security/) | 对 Kards 后台做的一轮功能 QA + 安全测试：结论、方法、可复现步骤与工具链 |
| [Kismet 直译模拟器](/kismet-sim/) | KardsSim 的设计与心得：为什么直译 AST、调用约定、触发点体系、推荐 hook 点、发射器实现特性、审计方法论与坑清单 |
| [自己写私服](/private-server/) | 从零实现 Kards 服务端的系列教程（TS + C# 双语代码）：协议取证、会话、codec、卡组码、匹配开局、对局动作、WebSocket 部署 |
| [UE5 运行时逆向](/ue5-re/) | 手动定位 GObjects / GNames / GWorld / ProcessEvent 与 AOB 特征码，逐条标注出处 |
| [UE5 蓝图逆向](/ue5-bp/) | Kismet 字节码怎么读、怎么反编译、怎么改回去：操作码表、有损性的实测证据、逐游戏魔改实例与工具全景 |
| [杂项与随笔](/lab/) | 术语表、工具箱、问答、阅读路径、写作约定与本站的搭建记录 |

## 公开仓库清单

<!-- BEGIN:PROJECTS-TABLE -->
<!-- 本表由 `npm run sync` 自动生成，请勿手工编辑。仓库数：36 -->

| 仓库 | 方向 | 语言 | Star | 最近推送 | 说明 |
|---|---|---|---|---|---|
| [fyserver](/projects/fyserver) | 服务端 / 客户端 | C# | 14 | 2026-11-17 | C# / .NET 10 私服服务端：HTTP + WebSocket 单端口，NativeAOT 单文件发布，自带 Web 后台 |
| [kards-server-go](/projects/kards-server-go) | 服务端 / 客户端 | Go | 5 | 2026-11-03 | Gin + GORM + MySQL 实现的 KARDS 私服，附预编译 Windows 二进制 |
| [FyClient](/projects/fyclient) | 服务端 / 客户端 | C# | 0 | 2026-08-25 | 纯 C# 虚拟测试客户端，端到端验证登录 / 匹配 / 对局 / 结算 |
| [Prism](/projects/prism) | UE 工具链 | C# | 5 | 2026-11-14 | UE4/UE5 .pak 工具箱（Windows + Android）：浏览预览、贴图替换、pak 合并、跨平台贴图移植 |
| [UAssetRegistry](/projects/uassetregistry) | UE 工具链 | C# | 1 | 2026-08-17 | AssetRegistry.bin 解析 / 快速枚举 / 语义级回写库（基于 UAssetAPI） |
| [AssetRegistryTool](/projects/assetregistrytool) | UE 工具链 | C++ | 1 | 2026-11-13 | UE 5.6 编辑器插件：用工程资产重建 AssetRegistry.bin，含 List / Merge commandlet |
| [ULocres](/projects/ulocres) | UE 工具链 | C# | 0 | 2026-09-06 | .locres 本地化读写库：四种格式版本全覆盖，未修改内容逐字节一致 |
| [KismetDecompiler](/projects/kismetdecompiler) | UE 工具链 | C# | 1 | 2026-09-25 | 蓝图 Kismet 字节码反编译器：AST → C++ 风格伪代码，含反 Dispatch 与 CFG 结构化 |
| [KismetReactor](/projects/kismetreactor) | UE 工具链 | C# | 1 | 2026-08-25 | WPF 图形化蓝图字节码查看 / 编辑器：跳转可视化与就地修改 |
| [kards-sim](/projects/kardsim) | UE 工具链 | C# | 5 | 2026-09-26 | 把蓝图 Kismet 直译成 C# 的本地对局模拟器，可用于训练和评测 AI |
| [B64XorDecryption](/projects/b64xordecryption) | 逆向 / 协议 | C++ | 0 | 2026-07-20 | Base64 + 变长 XOR 私有协议编解码的逆向实现（C 动态库 / C# API） |
| [Ruri.ShaderDecompiler](/projects/upstream#ruri-shaderdecompiler)（Fork） | Fork | — | 0 | 2026-09-12 | 通用 Shader 反编译库：把 Shader 二进制还原为带符号的 HLSL |
| [iced](/projects/upstream#iced)（Fork） | Fork | — | 0 | 2026-09-09 | x86/x64 反汇编 / 汇编 / 编解码库，含 Rust / .NET / Java / Python / Lua 绑定 |
| [FractalMiner](/projects/upstream#fractalminer)（Fork） | Fork | — | 0 | 2026-09-08 | Unity ShaderLab 分形渲染实验 |
| [VapeV4.21](/projects/upstream#vapev4-21)（Fork） | Fork | — | 0 | 2026-08-24 | Vape 4.21 Java 层与 Windows x64 原生桥接层的研究性恢复工程 |
| [OpenVape](/projects/upstream#openvape)（Fork） | Fork | — | 0 | 2026-08-14 | Vape 4.21 客户端 / 启动器 / 本地服务的研究性恢复工程 |
| [gerouke-bot](/projects/upstream#gerouke-bot)（Fork） | Fork | — | 0 | 2026-08-23 | 面向 macOS 的「割肉可 Bot 0.18.0」源码级重建与扩展 |
| [UEBlueprintGraphViewer](/projects/upstream#ueblueprintgraphviewer)（Fork） | Fork | — | 0 | 2026-08-20 | 查看 UE4 / UE5 编译后蓝图代码的工具，含资产引用搜索 |
| [CCB-Team.github.io](/projects/site) | 本站 | JavaScript | 0 | 2026-11-19 | 本站源码：VitePress 构建，GitHub Actions 部署到 Pages |
| [kards-client-headless](/projects/kards-client-headless) | 服务端 / 客户端 | C# | 0 | 2026-10-28 | 无需运行 UE 或 GPU 的小卡池规则与 AI 原型；原版客户端对战尚未验证 |
| [faction-mobile-so](/projects/faction-mobile-so) | 逆向 / 协议 | C++ | 0 | 2026-10-03 | KARDS Android arm64 盟国扩展移植：libUnreal.so 逆向结论 + 地址表 + 重定位扫描工具 + 移植骨架（未在真机验证） |
| [Crown-duel](/projects/crown-duel) | 游戏 | HTML | 0 | 2026-10-11 | 皇冠决斗是一款基于卡兹游戏圈中事件和人物抽象而成的决斗游戏。 |
| [Solstice](/projects/solstice) | Web | C# | 0 | 2026-10-11 | UE cooked 资产与 Kismet 字节码工具的概念与早期规划 |
| [Flora](/projects/flora) | UE 工具链 | C# | 7 | 2026-11-15 | FModel 定制版本：资产浏览、蓝图图形查看与 pak 打包 |
| [solstice-pak](/projects/solstice-pak) | UE 工具链 | C# | 0 | 2026-10-24 | 最小 UE .pak (v3) 读写库，零依赖，可在浏览器内生成 |
| [solstice-assetregistry](/projects/solstice-assetregistry) | UE 工具链 | C# | 0 | 2026-10-24 | AssetRegistry.bin (UE v21) 读取与末尾追加库 |
| [solstice-jmap](/projects/solstice-jmap) | UE 工具链 | C# | 0 | 2026-11-07 | 从 jmap 与 AssetRegistry.bin 合成对象表与函数签名表 |
| [solstice-bin](/projects/solstice-bin) | UE 工具链 | C# | 0 | 2026-10-24 | AssetRegistry.bin (UE v21) 容器层：分段解析与末尾追加 |
| [solstice-kismet](/projects/solstice-kismet) | UE 工具链 | C# | 0 | 2026-11-07 | 从平铺节点模型生成 UE 蓝图 Kismet 字节码 |
| [solstice-cskismet](/projects/solstice-cskismet) | UE 工具链 | C# | 0 | 2026-11-07 | 用 C# 写 Kismet 修改：Roslyn 源码层 → Solstice.Kismet 节点模型 → 蓝图字节码 |
| [Solstice-winter](/projects/solstice-winter) | UE 工具链 | C# | 0 | 2026-11-08 | UE cooked 蓝图工作台：节点图查看与跨资产索引 |
| [AssetRegistryTools-](/projects/assetregistrytools-)（Fork） | Fork | — | 0 | 2026-08-17 | 支持导入Cooked资产 |
| [polaris](/projects/polaris) | UE 工具链 | C# | 0 | 2026-11-14 | 面向 UE 5.6 的 C# SDK 与 Kismet 编译工具 |
| [KMod-Loader-Android](/projects/kmod-loader-android) | 模组 / 文档 | C++ | 3 | 2026-11-17 | KARDS Android 模组加载器，通过 UE 反射运行 Lua 模组 |
| [kmod-docs](/projects/kmod-docs) | 模组 / 文档 | CSS | 0 | 2026-11-18 | KMod Windows / Android 安装、开发与 API 文档 |
| [KMod-Loader-Windows](/projects/kmod-loader-windows) | 模组 / 文档 | C++ | 0 | 2026-11-18 | KARDS Windows 模组加载器，支持 Lua 与 C++ 原生模组 |

<!-- END:PROJECTS-TABLE -->

## Fork 与上游项目

标注「（Fork）」的仓库系在上游基础上 Fork，**主要贡献与著作权属于上游作者**，
团队在其上做过本地修改、扩展或研究性留存。项目介绍见 [上游衍生项目](/projects/upstream)，
另有 [AssetRegistryTools-](/projects/assetregistrytools-)（支持导入 cooked 资产）。

## 私有仓库

除公开仓库外，组织内还有若干私有仓库（测试数据集、内部 QA 工作区与未公开的引擎源码镜像等），
不在本站展开，仅按需在团队内部共享。

## 维护本页

清单表格由脚本生成，请勿手工编辑：

```bash
npm run sync     # 读取 CCB-TEAM 公开仓库，重写上表并提示缺少介绍页的仓库
```

数据来源是 GitHub 公开 API；可选设置 `GITHUB_TOKEN` 以提高请求额度。表格是运行同步命令时的快照，不会随仓库变化实时更新。
没有站内介绍页的项目会直接链接到 GitHub。需要添加介绍页时，可创建 `docs/projects/<项目>.md`，并在 `.vitepress/config.mjs` 的侧边栏中登记。
