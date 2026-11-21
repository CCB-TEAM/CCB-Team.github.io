---
title: 外部资源与致谢
---

# 外部资源与致谢

我们的工具几乎全部站在别人的肩膀上。这一页把常用的上游项目列出来，方便读者顺着往下读，
也算一份致谢。

::: tip 说明
下面都是**第三方项目**，各自遵循自己的许可。我们 fork 或 vendored 的部分保留原始许可与来源标注；
本站不为这些项目的正确性背书，也不代表它们认可我们。
:::

## 资产与容器

| 项目 | 用途 |
|---|---|
| [UAssetAPI](https://github.com/atenfyr/UAssetAPI) | 读写 `.uasset` / `.uexp`，解析 Kismet 字节码。本站多数 C# 工具的底座 |
| [CUE4Parse](https://github.com/FabianFG/CUE4Parse) | pak 与资产读取实现；Prism 与 Flora 都依赖它 |
| [FModel](https://github.com/4sval/FModel) | 资产浏览器；[Flora](/projects/flora) 是它的定制分支 |
| [repak](https://github.com/trumank/repak) | pak 写出（Flora 打包、Prism Android 侧） |
| [ImageSharp](https://github.com/SixLabors/ImageSharp) | 图像解码 / 编码（Prism 的贴图路径） |
| [astc-encoder](https://github.com/ARM-software/astc-encoder) | ASTC 编解码（移动端贴图格式） |
| [DirectXTex / texconv](https://github.com/microsoft/DirectXTex) | BC 系列贴图转换 |
| [CityHash](https://github.com/google/cityhash) | UE 的字符串哈希基础；[ULocres](/projects/ulocres) 里有一份逐行移植 |

## 运行时与 hook

| 项目 | 用途 |
|---|---|
| [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) | Lua 模组框架，也是「别人怎么定位引擎」的重要参考 |
| [Dumper-7](https://github.com/Encryqed/Dumper-7) | 从运行中的游戏导出 C++ SDK 头（KMod 的构建依赖） |
| [Zydis](https://github.com/zyantific/zydis) | x86/x64 反汇编库（KMod 用它找解释器与 `GNatives`） |
| [MinHook](https://github.com/TsudaKageyu/minhook) | Windows inline hook（[MinHook 上手](/ue5-re/09-minhook)） |
| [Dobby](https://github.com/jmpews/Dobby) | arm64 inline hook |
| [ShadowHook](https://github.com/bytedance/android-inline-hook) | 字节跳动的 arm64 inline hook 方案 |

## 桌面与服务端框架

| 项目 | 用途 |
|---|---|
| [Avalonia](https://avaloniaui.net/) | 跨平台桌面 UI（Prism 的 Windows / Android 共用界面） |
| [Nodify](https://github.com/miroiu/nodify) | WPF 节点编辑器控件（Solstice-winter、Flora 的节点图） |
| [AdonisUI](https://github.com/benruehl/adonis-ui) | WPF 主题（KismetReactor） |
| [FASTER](https://github.com/microsoft/FASTER) | 本地 KV 存储（fyserver） |
| [Dear ImGui](https://github.com/ocornut/imgui) | 游戏内覆盖层（KMod 的实验特性） |

## 文档与站点

| 项目 | 用途 |
|---|---|
| [VitePress](https://vitepress.dev/) | 本站 |
| [mdBook](https://github.com/rust-lang/mdBook) | [KMod 文档站](https://ccb-team.github.io/kmod-docs/) |

## 上游研究

| 项目 | 关系 |
|---|---|
| [KardsFactionToolkit](https://github.com/mdzz195/KardsFactionToolkit) | [faction-mobile-so](/projects/faction-mobile-so) 的 Windows 基线（MIT，vendored） |
| [binkaenc](https://github.com/595554963github/binkaenc) | Flora 的 BINKA 音频编码依赖（需自行构建） |
| [AssetRegistryTool（上游）](https://github.com/killmyworld/AssetRegistryTool) | [AssetRegistryTools-](/projects/assetregistrytools-) 的 fork 来源 |

## 关于游戏本身

KARDS 及其客户端、美术、音频、卡牌数据的权利属于其所有者（1939 Games）。
本站与所有项目**均非官方**，与其没有隶属、授权或合作关系。
本站不包含也不分发任何游戏数据、密钥或修改后的游戏包；示例一律使用合成数据或读者自备的合法输入。

## 想补充

漏掉了重要的上游项目，或者某个许可标注写错了，欢迎在
[本站仓库](https://github.com/CCB-TEAM/CCB-Team.github.io)指出。
