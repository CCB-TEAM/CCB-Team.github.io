---
title: 团队介绍
---

# 关于 CCB-TEAM

CCB-TEAM 是一个小规模的技术小组，做两件事：**把 Kards（1939 Games）的客户端—服务端协议摸清楚并重写服务端**，以及**给 Unreal Engine 的资产与蓝图做一套能用的工具链**。

这两件事在我们的仓库里是连着的：为了搞懂协议要读蓝图和 UHT，于是有了反编译与资产工具；工具好用了，协议研究又能走得更深。

## 我们在做什么

### 一、游戏服务端与协议逆向

从抓包、蓝图反编译、UHT 头文件三路取证，把整套 HTTP + WebSocket 协议还原出来，并给出两个可运行的实现：

| 项目 | 语言 | 说明 |
|---|---|---|
| [`fyserver`](/projects/fyserver) | C# / ASP.NET Core | 单端口 HTTP + WS，codec、对局调度与结算完整 |
| [`kards-server-go`](/projects/kards-server-go) | Go / Gin | JWT 鉴权、卡组码、对局状态机与独立 WS 端口 |
| [`B64XorDecryption`](/projects/b64xordecryption) | C / C# | 对局消息 codec 的独立逆向成果（含 IDA 伪代码存档） |

配套的教程系列《[自己写私服](/private-server/)》把这些成果整理成了从零实现的步骤，另有客户端产物注解（[附录 A](/private-server/appendix/uht-structs) / [B](/private-server/appendix/decompile-notes) / [C](/private-server/appendix/client-flow) / [D](/private-server/appendix/smoke-test)）。

### 二、UE 资产与蓝图工具链

| 项目 | 语言 | 说明 |
|---|---|---|
| [`Prism`](/projects/prism) | C# | UE4/UE5 .pak 修改工具：浏览、预览、导出、替换纹理，合并 pak，PC 与移动端纹理包互转 |
| [`KismetDecompiler`](/projects/kismetdecompiler) | C# | 把蓝图字节码还原成可读伪代码，支持批量与 UHT 签名索引 |
| [`KismetReactor`](/projects/kismetreactor) | C# | 蓝图相关实验工具 |
| [`UAssetRegistry`](/projects/uassetregistry) | C# | 资产注册表读写 |
| [`AssetRegistryTool`](/projects/assetregistrytool) | C++ | UE5.6 资产注册表修改插件 |
| [`ULocres`](/projects/ulocres) | C# | 本地化资源（.locres）处理 |

### 三、客户端与运行环境

| 项目 | 语言 | 说明 |
|---|---|---|
| [`FyClient`](/projects/fyclient) | C# | 配合服务端研究的客户端工具 |

### 四、文档与测试

| 项目 | 说明 |
|---|---|
| [CCB-Team.github.io](/projects/site) | 本站：项目文档、安全 QA 报告、私服教程（VitePress） |
| [安全 QA](/security/) | 针对相关服务端的测试方法、缺陷清单与回放工具 |

## 成员与分工

团队共 9 位成员。下表列出在**公开仓库**中有可见工作记录的成员及其方向（其余成员的工作集中在内部分支与私有仓库，按隐私优先原则不在此列举账号）。

| 成员 | 主要方向 | 公开仓库中的工作 |
|---|---|---|
| [vekolyram](https://github.com/vekolyram) | 协议逆向 / C# 服务端 | [`fyserver`](/projects/fyserver)（主要作者）、[`B64XorDecryption`](/projects/b64xordecryption)、[`UAssetRegistry`](/projects/uassetregistry)、本站 |
| [kardswalker](https://github.com/kardswalker) | Go 服务端 / UE 打包工具 | [`kards-server-go`](/projects/kards-server-go)、[`Prism`](/projects/prism)、[`AssetRegistryTool`](/projects/assetregistrytool)、[`fyserver`](/projects/fyserver) |
| [Xuewu-awa](https://github.com/Xuewu-awa) | UE 资产工具 | [`Prism`](/projects/prism)（主要作者） |
| [OhMinecraftLauncher](https://github.com/OhMinecraftLauncher) | 游戏服务端 | [`fyserver`](/projects/fyserver) |
| [moshuidefenshi](https://github.com/moshuidefenshi) | 逆向与工具验证 | 参与内部逆向与验证工作（相关仓库未公开） |

::: tip 关于分工的说明
上表依据各公开仓库的提交记录整理，**不代表全部工作量**——协议逆向过程中的大量验证、抓包与文档工作往往不留提交痕迹。此外，各仓库也合并过非组织成员的贡献，详见各仓库的 Contributors 页面。
:::

## 工作原则

- **研究导向、非盈利。** 公开仓库均为协议研究与工具实现，不涉及游戏本体的分发；使用时请遵循各仓库声明的许可。
- **尊重上游。** fork 自上游的项目保留原始许可与来源标注，我们的改动以适配与修复为目的。
- **证据优先。** 结论尽量给出出处：能实测就实测，不能实测就明确标注为推断（这一原则贯穿[私服教程](/private-server/)与[安全 QA](/security/)的全部内容）。
- **隐私优先。** 成员账号仅在本人有公开工作可见时列出，不以团队名义公开个人身份信息。

## 参与与联系

- 组织主页：<https://github.com/CCB-TEAM>
- 问题反馈、勘误与改进建议：欢迎在对应仓库开 Issue 或 PR。
- 本站内容（含私服教程）的纠错尤其欢迎——协议细节以实测为准，文中已尽量标注实测与推断的区别。

## 数据说明

本页统计截至 **2026-09-25**：组织共有 **18 个公开仓库**（11 个自建 + 7 个上游 fork），另有若干个私有仓库（仅用于内部研究与验证，不在此列举）。

::: warning 免责
本站与 CCB-TEAM 的所有公开内容均与 1939 Games 及任何游戏发行商无关，不是官方文档或官方实现。相关内容仅供协议研究与学习，请勿用于商业用途或任何侵权场景。
:::
