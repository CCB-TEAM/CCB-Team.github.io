---
title: 团队介绍
---

# 关于 CCB-TEAM

CCB-TEAM 是一个小规模、松散的技术小组。我们做的事用一句话说：**把游戏里已经编译好的东西重新读懂，
再把读懂的结果做回能跑的东西**——客户端发什么、服务端为什么这么回、资产里存了什么、
这段字节码在算什么、以及怎么把它写回去而不弄坏。

围绕这个目标，公开工作分成四条线：**KARDS 协议与私服**、**Unreal Engine 资产与蓝图工具链**、
**KARDS 模组加载器**、**逆向与格式研究**。它们不是四个爱好，而是同一件事的四个切面：
协议研究要读蓝图和 UHT，蓝图工具要读 pak 与资产注册表，模组加载器要的是同一套反射知识。

## 我们在做什么

### 一、游戏服务端与协议逆向

结合抓包、蓝图反编译和 UHT 头文件研究 HTTP 与 WebSocket 协议，并提供两个服务端实现：

| 项目 | 语言 | 说明 |
|---|---|---|
| [`fyserver`](/projects/fyserver) | C# / ASP.NET Core | 单端口 HTTP + WebSocket，提供协议编解码、对局调度和结算等功能 |
| [`kards-server-go`](/projects/kards-server-go) | Go / Gin | JWT 鉴权、卡组码、对局状态机与独立 WS 端口 |
| [`FyClient`](/projects/fyclient) | C# | 虚拟测试客户端，一条命令跑完登录 → 匹配 → 对局 → 结算 |
| [`B64XorDecryption`](/projects/b64xordecryption) | C / C# | 对局消息 codec 的独立逆向成果（含 IDA 伪代码存档） |

配套的教程系列《[自己写私服](/private-server/)》把这些成果整理成了从零实现的步骤，另有客户端产物注解（[附录 A](/private-server/appendix/uht-structs) / [B](/private-server/appendix/decompile-notes) / [C](/private-server/appendix/client-flow) / [D](/private-server/appendix/smoke-test)）。

### 二、UE 资产与蓝图工具链

| 项目 | 语言 | 说明 |
|---|---|---|
| [`Prism`](/projects/prism) | C# | UE4/UE5 .pak 修改工具：浏览、预览、导出、替换纹理，合并 pak，PC 与移动端纹理包互转 |
| [`KismetDecompiler`](/projects/kismetdecompiler) | C# | 把蓝图字节码还原成可读伪代码，支持批量与 UHT 签名索引 |
| [`KismetReactor`](/projects/kismetreactor) | C# | 蓝图字节码的图形化查看与就地修改 |
| [`KardsSim`](/projects/kardsim) | C# | 把蓝图 Kismet 直译成 C# 的本地对局模拟器（[设计专题](/kismet-sim/)） |
| [`UAssetRegistry`](/projects/uassetregistry) | C# | 资产注册表读写 |
| [`AssetRegistryTool`](/projects/assetregistrytool) | C++ | UE5.6 资产注册表修改插件 |
| [`ULocres`](/projects/ulocres) | C# | 本地化资源（.locres）处理 |
| [`Flora`](/projects/flora) | C# | FModel 定制版本，提供资产浏览、蓝图图形查看与 pak 打包 |
| [`polaris`](/projects/polaris) | C# | 面向 UE 5.6 的 SDK 生成与 Kismet 编译工具 |
| [`Solstice-winter`](/projects/solstice-winter) | C# | cooked 蓝图工作台，提供只读节点图与跨资产索引 |

更多资产与字节码工具，包括 Solstice 系列（[pak](/projects/solstice-pak) / [bin](/projects/solstice-bin) / [assetregistry](/projects/solstice-assetregistry) / [jmap](/projects/solstice-jmap) / [kismet](/projects/solstice-kismet) / [cskismet](/projects/solstice-cskismet)），见[项目总览](/projects/)。

### 三、客户端与运行环境

| 项目 | 语言 | 说明 |
|---|---|---|
| [`kards-client-headless`](/projects/kards-client-headless) | Rust / C# | 无 UE 或 GPU 的小卡池规则与 AI 原型，原版客户端对战尚未验证 |
| [`KMod-Loader-Windows`](/projects/kmod-loader-windows) | C++ / Lua | KARDS Windows 模组加载器（`dwmapi` 代理 + 自研 inline hook） |
| [`KMod-Loader-Android`](/projects/kmod-loader-android) | C++ / Lua | KARDS Android 模组加载器（APK 重打包 + ProcessEvent hook） |
| [`kmod-docs`](/projects/kmod-docs) | 文档 | KMod 安装、开发与 API 文档 |
| [`faction-mobile-so`](/projects/faction-mobile-so) | C++ | 安卓 arm64 的盟国扩展移植研究（结论 + 骨架，未在真机验证） |

### 四、文档与测试

| 项目 | 说明 |
|---|---|
| [CCB-Team.github.io](/projects/site) | 本站：项目文档、安全 QA 报告、私服教程（VitePress） |
| [UE5 游戏手动逆向](/ue5-re/) | 公开资料整理：手动定位 GObjects / GNames / GWorld / ProcessEvent 与 AOB 特征码，逐条标注出处（[出处清单](/ue5-re/appendix/sources)） |
| [UE5 蓝图逆向](/ue5-bp/) | Kismet 字节码与蓝图反编译：操作码表、反编译有损性的实测证据、逐游戏操作码魔改实例、工具全景（[出处清单](/ue5-bp/appendix/sources)） |
| [安全 QA](/security/) | 针对相关服务端的测试方法、缺陷清单与回放工具 |
| [杂项与随笔](/lab/) | 术语表、工具箱、问答、阅读路径、写作约定与本站搭建记录 |

## 我们反复在回答的四个问题

如果你只看一页就想知道这个组在干嘛，看这四个问题就够了——它们是所有仓库的共同动机：

1. **「这个客户端到底在跟谁说话？」**
   抓包能拿到字节，但拿不到语义。于是有了 fyserver / kards-server-go 两个实现、FyClient 这条回归链路、
   以及[自己写私服](/private-server/)那份把每一步都写下来的教程。
2. **「这个资产里到底存了什么？」**
   `.pak` 是容器，`AssetRegistry.bin` 是目录，`.locres` 是文案表。三个格式各有一个库，
   加一个编辑器插件，做的都是同一件事：让字节可读、可改、且改完还能被游戏接受。
3. **「这段字节码到底在算什么？」**
   Kismet 是把蓝图编译成的栈式字节码，控制流靠执行流栈而不是直接跳转。
   [KismetDecompiler](/projects/kismetdecompiler) 负责把它还原成结构化的伪代码，
   [KardsSim](/projects/kardsim) 干脆把它直译成 C# 拿去跑。
4. **「怎么把它写回去而不弄坏？」**
   这是最难的一步，也是我们投入最多的地方：写回前算偏移、写完读回、其余函数字节做 SHA-256 比对、
   对不上就报错而不是「大概能跑」。

## 工作方式

这些原则不是口号，基本都是从踩坑里长出来的，也写进了各仓库的 README：

- **证据优先。** 能实测就实测；不能实测就明确写成「推断」。这一条贯穿[私服教程](/private-server/)、
  [安全 QA](/security/)与两个逆向专题的每一节。
- **先写边界。** 仓库 README 里「不支持什么」比「支持什么」写得更早也更细。一个诚实的缺口，
  比一个含糊的「已支持」对使用者有用得多。
- **不发明 API 与偏移。** 不猜结构体布局、不猜操作数含义、不猜兼容性；先拿真实夹具验，再写代码。
- **写回必读回。** 「序列化成功」不等于「运行时正确」，更不等于「语义等价」。所以我们反复做读回比对、
  字节级复现（[solstice-pak](/projects/solstice-pak) 拿真实 pak 重建到逐字节相同、
  [ULocres](/projects/ulocres) 让未修改的 locres 回写后一字节不差）与「其余函数字节不变」的硬闸。
- **小步纵向切片。** 先打通一条最窄的端到端路径（一个资产、一个函数、一张卡），
  验证链路成立再横向扩，而不是先写一个没人验证过的大框架。
- **重复劳动脚本化。** 导出、重打包、生成导出表、刷新仓库表——能写成脚本的一律写成脚本，
  因为手敲第 30 次一定出错。

## 我们的工程口味

技术选型上有些偏好，熟悉的人一眼能认出来：

- **C# 是主力胶水。** UE 的资产读写生态（UAssetAPI、CUE4Parse、FModel）都在 .NET 上，
  所以大部分工具用 C# / .NET 10 写；同一套语言也顺手承担了服务端与桌面 UI。
- **能 AOT 就 AOT，能源生成就源生成。** fyserver 与 FyClient 都是零反射 + NativeAOT 单文件；
  这不是洁癖，是为了「拷一个 exe 到别的机器上就能跑」。
- **能零依赖就零依赖。** Solstice 的几个库只碰 BCL，`solstice-pak` 甚至能跑在 Blazor WASM 里，
  在浏览器内直接产出 pak。
- **该用别的语言就用别的语言。** 对局引擎与状态机用 Go（kards-server-go），
  规则原型用 Rust（kards-client-headless），注入与 hook 用 C++（KMod）。
- **文档是产物的一部分。** 我们不太写「欢迎 star」式的 README，更愿意把格式表、偏移、
  踩坑记录、验证数据直接放进仓库——因为下一个接手的人（往往是我们自己）需要的是这些。

## 协作与流程

- **公开仓库即工作记录。** 提交信息尽量写清楚「改了什么、为什么、验证到什么程度」。
- **一切能跑 CI 的都跑。** 本站由 GitHub Actions 构建并发布到 Pages，KMod 的文档用 mdBook 也是同样的路子。
- **PR 与 Issue 都欢迎**，尤其是勘误：协议细节以实测为准，文中已尽量区分实测与推断，
  但错误一定还有。
- **不公开的部分不假装公开。** 测试数据集、内部 QA 工作区、未公开的引擎源码镜像都放在私有仓库里，
  本站不列、也不暗示它们存在的内容。

## 成员与分工

下表列出团队此前整理的部分成员及其工作方向，不代表完整或实时的成员名单。公开仓库之外的工作不在此详列。

| 成员 | 主要方向 | 公开仓库中的工作 |
|---|---|---|
| [vekolyram](https://github.com/vekolyram) | 协议逆向 / C# 服务端 | [`fyserver`](/projects/fyserver)（主要作者）、[`B64XorDecryption`](/projects/b64xordecryption)、[`UAssetRegistry`](/projects/uassetregistry)、本站 |
| [kardswalker](https://github.com/kardswalker) | Go 服务端 / UE 打包工具 | [`kards-server-go`](/projects/kards-server-go)、[`Prism`](/projects/prism)、[`AssetRegistryTool`](/projects/assetregistrytool)、[`fyserver`](/projects/fyserver) |
| [Xuewu-awa](https://github.com/Xuewu-awa) | UE 资产工具 | [`Prism`](/projects/prism)（主要作者） |
| [OhMinecraftLauncher](https://github.com/OhMinecraftLauncher) | 游戏服务端 | [`fyserver`](/projects/fyserver) |
| [moshuidefenshi](https://github.com/moshuidefenshi) | 逆向与工具验证 | 参与内部逆向与验证工作（相关仓库未公开） |

::: tip 关于分工的说明
上表结合公开仓库的提交记录与团队此前整理的分工，**不代表全部工作量**——协议逆向过程中的大量验证、抓包与文档工作往往不留提交痕迹。此外，各仓库也合并过非组织成员的贡献，详见各仓库的 Contributors 页面。
:::

## 公开工作的形状

从外部能看到的痕迹大致是这样的（按公开仓库最早的推送记录，2026 年 7 月起逐步展开）：

- **2026 年 7–8 月**：编解码逆向（B64XorDecryption）打出第一个可用件，随后是服务端（fyserver）
  与资产库（UAssetRegistry）的雏形。
- **2026 年 9–10 月**：工具链成型——KismetDecompiler 的结构化反编译、KardsSim 的直译路线、
  Solstice 系列「一个库只做一件事」的拆解，以及移动端移植研究（faction-mobile-so）。
- **2026 年 11 月**：写回方向闭环（solstice-cskismet / polaris 在真实游戏内验证），
  以及 Prism / Flora 这类面向使用者的桌面工具与两个平台的模组加载器。

更细的节点见[时间线](/lab/timeline)。这里没有发布日期承诺，只有「已经发生的事」。

## 我们不做的事

说清楚不做什么，比列一堆目标更有用：

- 不发布补丁后的游戏安装包、不提供签名密钥、不代做「一键注入」——[faction-mobile-so](/projects/faction-mobile-so)
  与 KMod 的仓库里都明确写着这些。
- 不把破解在线服务、刷分或破坏公平性当作目标；私服工作面向的是本地研究与自建环境。
- 不宣称兼容没测过的版本。每个库的 README 都写着只验证过哪一个 UE / 游戏版本。
- 不代替官方文档，也不代表任何游戏发行商。

## 参与与联系

- 组织主页：<https://github.com/CCB-TEAM>
- 问题反馈、勘误与改进建议：欢迎在对应仓库开 Issue 或 PR。
- 本站内容（含私服教程）的纠错尤其欢迎——协议细节以实测为准，文中已尽量标注实测与推断的区别。
- 想快速了解我们从哪读起：[阅读路径](/lab/reading-path)；常见疑问：[问答](/lab/faq)。

## 数据说明

公开仓库与项目分类请查看[项目总览](/projects/)；其中的仓库清单由脚本从 GitHub 获取，是最近一次同步时的快照。组织的私有仓库不在本站列举。

::: warning 免责
本站与 CCB-TEAM 的项目均非 1939 Games 或其他游戏发行商的官方文档或官方实现。本站文章供研究与学习；项目代码的使用条件以各仓库许可证为准，游戏数据及其他第三方资源的权利按其各自声明处理。
:::
