---
title: 团队介绍
---

# 关于 CCB-TEAM

CCB-TEAM 是一个小规模的技术小组，围绕 **KARDS 客户端与服务端协议**、**Unreal Engine 资产与蓝图工具**，以及 **KARDS 模组加载与开发**开展研究和开发。

这些方向在仓库中相互关联：协议研究需要理解蓝图和 UHT，资产与反编译工具也为进一步研究提供支持。

## 我们在做什么

### 一、游戏服务端与协议逆向

结合抓包、蓝图反编译和 UHT 头文件研究 HTTP 与 WebSocket 协议，并提供两个服务端实现：

| 项目 | 语言 | 说明 |
|---|---|---|
| [`fyserver`](/projects/fyserver) | C# / ASP.NET Core | 单端口 HTTP + WebSocket，提供协议编解码、对局调度和结算等功能 |
| [`kards-server-go`](/projects/kards-server-go) | Go / Gin | JWT 鉴权、卡组码、对局状态机与独立 WS 端口 |
| [`B64XorDecryption`](/projects/b64xordecryption) | C / C# | 对局消息 codec 的独立逆向成果（含 IDA 伪代码存档） |

配套的教程系列《[自己写私服](/private-server/)》把这些成果整理成了从零实现的步骤，另有客户端产物注解（[附录 A](/private-server/appendix/uht-structs) / [B](/private-server/appendix/decompile-notes) / [C](/private-server/appendix/client-flow) / [D](/private-server/appendix/smoke-test)）。

### 二、UE 资产与蓝图工具链

| 项目 | 语言 | 说明 |
|---|---|---|
| [`Prism`](/projects/prism) | C# | UE4/UE5 .pak 修改工具：浏览、预览、导出、替换纹理，合并 pak，PC 与移动端纹理包互转 |
| [`KismetDecompiler`](/projects/kismetdecompiler) | C# | 把蓝图字节码还原成可读伪代码，支持批量与 UHT 签名索引 |
| [`KismetReactor`](/projects/kismetreactor) | C# | 蓝图相关实验工具 |
| [`KardsSim`](/projects/kardsim) | C# | 把蓝图 Kismet 直译成 C# 的本地对局模拟器（[设计专题](/kismet-sim/)） |
| [`UAssetRegistry`](/projects/uassetregistry) | C# | 资产注册表读写 |
| [`AssetRegistryTool`](/projects/assetregistrytool) | C++ | UE5.6 资产注册表修改插件 |
| [`ULocres`](/projects/ulocres) | C# | 本地化资源（.locres）处理 |
| [`Flora`](/projects/flora) | C# | FModel 定制版本，提供资产浏览和蓝图图形查看 |
| [`polaris`](/projects/polaris) | C# | 面向 UE 5.6 的 SDK 生成与 Kismet 编译工具 |
| [`Solstice-winter`](/projects/solstice-winter) | C# | cooked 蓝图工作台，提供只读节点图与跨资产索引 |

更多资产与字节码工具，包括 Solstice 系列，见[项目总览](/projects/)。

### 三、客户端与运行环境

| 项目 | 语言 | 说明 |
|---|---|---|
| [`FyClient`](/projects/fyclient) | C# | 配合服务端研究的客户端工具 |
| [`kards-client-headless`](/projects/kards-client-headless) | Rust / C# | 无 UE 或 GPU 的小卡池规则与 AI 原型，原版客户端对战尚未验证 |
| [`KMod-Loader-Windows`](/projects/kmod-loader-windows) | C++ / Lua | KARDS Windows 模组加载器 |
| [`KMod-Loader-Android`](/projects/kmod-loader-android) | C++ / Lua | KARDS Android 模组加载器 |
| [`kmod-docs`](/projects/kmod-docs) | 文档 | KMod 安装、开发与 API 文档 |

### 四、文档与测试

| 项目 | 说明 |
|---|---|
| [CCB-Team.github.io](/projects/site) | 本站：项目文档、安全 QA 报告、私服教程（VitePress） |
| [UE5 游戏手动逆向](/ue5-re/) | 公开资料整理：手动定位 GObjects / GNames / GWorld / ProcessEvent 与 AOB 特征码，逐条标注出处（[出处清单](/ue5-re/appendix/sources)） |
| [UE5 蓝图逆向](/ue5-bp/) | Kismet 字节码与蓝图反编译：操作码表、反编译有损性的实测证据、逐游戏操作码魔改实例、工具全景（[出处清单](/ue5-bp/appendix/sources)） |
| [安全 QA](/security/) | 针对相关服务端的测试方法、缺陷清单与回放工具 |

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

## 工作原则

- **研究导向、非盈利。** 项目以研究和工具开发为主；使用代码与资料时请遵循各仓库声明的许可及相关第三方权利。
- **尊重上游。** fork 自上游的项目保留原始许可与来源标注，我们的改动以适配与修复为目的。
- **证据优先。** 结论尽量给出出处：能实测就实测，不能实测就明确标注为推断（这一原则贯穿[私服教程](/private-server/)与[安全 QA](/security/)的全部内容）。
- **隐私优先。** 成员账号仅在本人有公开工作可见时列出，不以团队名义公开个人身份信息。

## 参与与联系

- 组织主页：<https://github.com/CCB-TEAM>
- 问题反馈、勘误与改进建议：欢迎在对应仓库开 Issue 或 PR。
- 本站内容（含私服教程）的纠错尤其欢迎——协议细节以实测为准，文中已尽量标注实测与推断的区别。

## 数据说明

公开仓库与项目分类请查看[项目总览](/projects/)；其中的仓库清单由脚本从 GitHub 获取，是最近一次同步时的快照。组织的私有仓库不在本站列举。

::: warning 免责
本站与 CCB-TEAM 的项目均非 1939 Games 或其他游戏发行商的官方文档或官方实现。本站文章供研究与学习；项目代码的使用条件以各仓库许可证为准，游戏数据及其他第三方资源的权利按其各自声明处理。
:::
