---
title: 时间线
---

# 时间线

一条粗线条的公开工作记录，用来回答「这个组大概是什么节奏」。

::: warning 关于日期的口径
下面的日期取自**公开仓库的推送记录**（组织仓库列表里的 `pushed_at`）与站内文档的上线批次，
它们说明「这个月有什么东西出现在公众视野里」，**不代表开发从那天开始**——
协议逆向、抓包、验证这些工作往往在仓库出现之前就进行了很久。私有仓库的进展不在此列。
:::

## 2026 年 7 月：从编解码开始

| 出现的东西 | 说明 |
|---|---|
| [B64XorDecryption](/projects/b64xordecryption) | 「Base64 + 变长 XOR」私有编解码的逆向成果：C 动态库 + C# API + IDA 伪代码存档 |

协议研究的第一步通常是「这条消息到底怎么编码的」。这个仓库是整条线最早的一块拼图，
后来的 [fyserver](/projects/fyserver) 与 [FyClient](/projects/fyclient) 里的 codec 与它同源。

## 2026 年 8 月：服务端与资产库的雏形

| 出现的东西 | 说明 |
|---|---|
| [UAssetRegistry](/projects/uassetregistry) | `AssetRegistry.bin` 的解析与语义级回写 |
| [FyClient](/projects/fyclient) | 虚拟测试客户端，把协议验证自动化 |
| [KismetReactor](/projects/kismetreactor) | WPF 的字节码查看 / 就地修改工具 |
| 一批 fork（[UEBlueprintGraphViewer](/projects/upstream#ueblueprintgraphviewer)、[VapeV4.21](/projects/upstream#vapev4-21)、[OpenVape](/projects/upstream#openvape) 等） | 研究性留存的参考实现 |

这个阶段的主线是「让协议能端到端跑通」：服务端 + 虚拟客户端 + 一份能读写的注册表。

## 2026 年 9 月：工具链成型

| 出现的东西 | 说明 |
|---|---|
| [ULocres](/projects/ulocres) | 四种 `.locres` 版本，未修改内容逐字节一致 |
| [KismetDecompiler](/projects/kismetdecompiler) | 字节码 → 结构化伪代码（CFG 结构化、反 ubergraph） |
| [KardsSim](/projects/kardsim) | 把蓝图 Kismet 直译成 C# 的本地对局模拟器 |

从「能读」到「能反编译、能执行」，是这一阶段的转折点。

## 2026 年 10 月：拆解与概念化

| 出现的东西 | 说明 |
|---|---|
| [solstice-pak](/projects/solstice-pak) · [solstice-bin](/projects/solstice-bin) · [solstice-assetregistry](/projects/solstice-assetregistry) | 把「pak / 注册表」拆成只做一件事的小库 |
| [Solstice](/projects/solstice) | 概念仓库：单向字节码生成的原则、路线图与 ADR |
| [faction-mobile-so](/projects/faction-mobile-so) | 安卓 arm64 的盟国扩展移植研究（结论 + 骨架） |
| [kards-client-headless](/projects/kards-client-headless) | 小卡池规则与 AI 原型（Rust 核心 + C# 网络层） |
| [Crown-duel](/projects/crown-duel) | 单 HTML 的浏览器决斗游戏 |

这个月的气质是「把大问题拆小」：一个库一个职责，一条结论一条边界。

## 2026 年 11 月：写回闭环与使用者工具

| 出现的东西 | 说明 |
|---|---|
| [solstice-jmap](/projects/solstice-jmap) · [solstice-kismet](/projects/solstice-kismet) · [solstice-cskismet](/projects/solstice-cskismet) | 对象表 → 节点模型 → 字节码；C# 源码层前端 |
| [Solstice-winter](/projects/solstice-winter) | cooked 蓝图工作台（只读节点图 + 跨资产索引） |
| [AssetRegistryTool](/projects/assetregistrytool) | UE 5.6.1 编辑器插件：从工程资产重建注册表 |
| [polaris](/projects/polaris) | UHT 风格 C# SDK + 自研编译器，**在真实游戏内验证过 G1** |
| [Flora](/projects/flora) | FModel 定制分支：可停靠工作区、蓝图图、LLM 代理编辑、pak 打包 |
| [Prism](/projects/prism) | `.pak` 工具箱：跨平台贴图移植、合并、替换 |
| [KMod-Loader-Windows](/projects/kmod-loader-windows) · [KMod-Loader-Android](/projects/kmod-loader-android) · [kmod-docs](/projects/kmod-docs) | 两个平台的模组加载器与文档 |
| [fyserver](/projects/fyserver) 大更新 | 单端口 HTTP + WS、NativeAOT 单文件、完整后台 |
| 本站改版 | 项目总览重构、团队页重写、新增[杂项](/lab/)一栏 |

写回不再只是「序列化成功」：自校验、字节比对、实机验证，一条链走完。

## 站内专题的上线批次

文档不是一次写完的，大致按这个顺序补：

1. 《[自己写私服](/private-server/)》—— 13 章 + 8 个附录，从协议取证写到部署坑
2. 《[安全 QA](/security/)》—— 测试方法、上传与目录穿越、缺陷清单、镜像与回放工具
3. 《[UE5 运行时逆向](/ue5-re/)》—— 对象模型到 MinHook / UE4SS Lua
4. 《[UE5 蓝图逆向](/ue5-bp/)》—— 资产形态、字节码、反编译、结构详解、操作码、虚拟机
5. 《[Kismet 直译模拟器](/kismet-sim/)》—— 设计与审计方法论，含推荐 hook 点
6. 《[杂项与随笔](/lab/)》—— 你现在看的这一栏

## 接下来

不承诺日期。能确定的方向都写在[项目总览](/projects/)每个项目的「边界」里——
没做完的事就是接下来要做的事。
