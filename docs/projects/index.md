---
title: 项目总览
---

# 项目总览

CCB-TEAM 的公开工作集中在两条主线：**游戏服务端与协议复刻**（KARDS 客户端协议、私服实现与端到端测试）
以及 **Unreal Engine 资产 / 蓝图工具链**（`.pak`、`AssetRegistry.bin`、`.locres`、Kismet 字节码）。
此外还有逆向工程与图形方向的储备项目，以及一批在上游基础上 Fork 的衍生项目。

## 按方向浏览

### 游戏服务端与客户端

| 项目 | 说明 |
|---|---|
| [fyserver](/projects/fyserver) | C# / .NET 10 写的 KARDS 私服：HTTP + WebSocket 单端口、NativeAOT 单文件发布、自带 Web 后台 |
| [kards-server-go](/projects/kards-server-go) | 同一协议面的 Go 实现：Gin + GORM + JWT + MySQL，附预编译 Windows 二进制 |
| [FyClient](/projects/fyclient) | 虚拟测试客户端：纯 C# 复刻协议，一条命令跑通登录 → 匹配 → 对局 → 结算 |

### UE 资产与蓝图工具链

| 项目 | 说明 |
|---|---|
| [Prism](/projects/prism) | UE4/UE5 `.pak` 模组工具箱（Windows + Android）：浏览预览、贴图替换、pak 合并、**跨平台贴图移植** |
| [UAssetRegistry](/projects/uassetregistry) | `AssetRegistry.bin` 的解析 / 快速枚举 / **语义级回写**库，可脱离引擎批量处理 |
| [AssetRegistryTool](/projects/assetregistrytool) | UE 5.6.1 编辑器插件：用工程资产重建 `AssetRegistry.bin`，另带 List / Merge commandlet |
| [ULocres](/projects/ulocres) | `.locres` 本地化读写库：四种格式版本全覆盖，未修改内容逐字节一致，对齐 UE 的 CityHash / CRC32 实现 |
| [KismetDecompiler](/projects/kismetdecompiler) | 蓝图字节码反编译器：AST → C++ 风格伪代码，CFG 结构化与反 `ExecuteUbergraph` |
| [KismetReactor](/projects/kismetreactor) | WPF 图形化字节码查看 / 编辑器：树视图、跳转可视化、插入表达式与就地修改 |

### 逆向工程与协议分析

| 项目 | 说明 |
|---|---|
| [B64XorDecryption](/projects/b64xordecryption) | 「Base64 + 变长 XOR 密钥」私有协议编解码的逆向成果：C 动态库 + C# API + IDA 伪代码存档 |

### 相关记录

| 内容 | 说明 |
|---|---|
| [安全 QA](/security/) | 对 Kards 后台做的一轮功能 QA + 安全测试：结论、方法、可复现步骤与工具链 |

## 公开仓库清单

<!-- BEGIN:PROJECTS-TABLE -->
<!-- 本表由 `npm run sync` 自动生成，请勿手工编辑。仓库数：18 -->

| 仓库 | 方向 | 语言 | Star | 最近推送 | 说明 |
|---|---|---|---|---|---|
| [fyserver](/projects/fyserver) | 服务端 / 客户端 | C# | 4 | 2026-09-18 | C# / .NET 10 私服服务端：HTTP + WebSocket 单端口，NativeAOT 单文件发布，自带 Web 后台 |
| [kards-server-go](/projects/kards-server-go) | 服务端 / 客户端 | Go | 2 | 2026-05-28 | Gin + GORM + MySQL 实现的 KARDS 私服，附预编译 Windows 二进制 |
| [FyClient](/projects/fyclient) | 服务端 / 客户端 | C# | 0 | 2026-08-25 | 纯 C# 虚拟测试客户端，端到端验证登录 / 匹配 / 对局 / 结算 |
| [Prism](/projects/prism) | UE 工具链 | C# | 1 | 2026-09-12 | UE4/UE5 .pak 工具箱（Windows + Android）：浏览预览、贴图替换、pak 合并、跨平台贴图移植 |
| [UAssetRegistry](/projects/uassetregistry) | UE 工具链 | C# | 0 | 2026-08-17 | AssetRegistry.bin 解析 / 快速枚举 / 语义级回写库（基于 UAssetAPI） |
| [AssetRegistryTool](/projects/assetregistrytool) | UE 工具链 | C++ | 0 | 2026-08-17 | UE 5.6 编辑器插件：用工程资产重建 AssetRegistry.bin，含 List / Merge commandlet |
| [ULocres](/projects/ulocres) | UE 工具链 | C# | 0 | 2026-09-06 | .locres 本地化读写库：四种格式版本全覆盖，未修改内容逐字节一致 |
| [KismetDecompiler](/projects/kismetdecompiler) | UE 工具链 | C# | 1 | 2026-09-06 | 蓝图 Kismet 字节码反编译器：AST → C++ 风格伪代码，含反 Dispatch 与 CFG 结构化 |
| [KismetReactor](/projects/kismetreactor) | UE 工具链 | C# | 0 | 2026-08-25 | WPF 图形化蓝图字节码查看 / 编辑器：跳转可视化与就地修改 |
| [B64XorDecryption](/projects/b64xordecryption) | 逆向 / 协议 | C++ | 0 | 2026-07-20 | Base64 + 变长 XOR 私有协议编解码的逆向实现（C 动态库 / C# API） |
| [Ruri.ShaderDecompiler](/projects/upstream#ruri-shaderdecompiler)（Fork） | Fork | C# | 0 | 2026-09-12 | 通用 Shader 反编译库：把 Shader 二进制还原为带符号的 HLSL |
| [iced](/projects/upstream#iced)（Fork） | Fork | Rust | 0 | 2026-09-09 | x86/x64 反汇编 / 汇编 / 编解码库，含 Rust / .NET / Java / Python / Lua 绑定 |
| [FractalMiner](/projects/upstream#fractalminer)（Fork） | Fork | ShaderLab | 0 | 2026-09-08 | Unity ShaderLab 分形渲染实验 |
| [VapeV4.21](/projects/upstream#vapev4-21)（Fork） | Fork | Java | 0 | 2026-08-24 | Vape 4.21 Java 层与 Windows x64 原生桥接层的研究性恢复工程 |
| [OpenVape](/projects/upstream#openvape)（Fork） | Fork | Batchfile | 0 | 2026-08-14 | Vape 4.21 客户端 / 启动器 / 本地服务的研究性恢复工程 |
| [gerouke-bot](/projects/upstream#gerouke-bot)（Fork） | Fork | TypeScript | 0 | 2026-08-23 | 面向 macOS 的「割肉可 Bot 0.18.0」源码级重建与扩展 |
| [UEBlueprintGraphViewer](/projects/upstream#ueblueprintgraphviewer)（Fork） | Fork | C# | 0 | 2026-08-20 | 查看 UE4 / UE5 编译后蓝图代码的工具，含资产引用搜索 |
| [CCB-Team.github.io](/projects/site) | 本站 | JavaScript | 0 | 2026-09-18 | 本站源码：VitePress 构建，GitHub Actions 部署到 Pages |

<!-- END:PROJECTS-TABLE -->

## Fork 与上游项目

标注「（Fork）」的仓库系在上游基础上 Fork，**主要贡献与著作权属于上游作者**，
团队在其上做过本地修改、扩展或研究性留存。逐项说明见 [上游衍生项目](/projects/upstream)。

## 私有仓库

除公开仓库外，组织内还有若干私有仓库（测试数据集、内部 QA 工作区与未公开的引擎源码镜像等），
不在本站展开，仅按需在团队内部共享。

## 维护本页

清单表格由脚本生成，请勿手工编辑：

```bash
npm run sync     # 读取 CCB-TEAM 公开仓库，重写上表并提示缺少介绍页的仓库
```

数据来源是本机已登录的 `gh` CLI（或 `GITHUB_TOKEN` 环境变量）。
新增项目时，请同时补一个 `docs/projects/<项目>.md` 介绍页，并在 `.vitepress/config.mjs` 的侧边栏中登记。
