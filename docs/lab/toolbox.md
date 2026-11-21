---
title: 工具箱
---

# 工具箱

做这些事用到的工具，按「在哪一环」分组。标 **自研** 的是组织内仓库；
其余是第三方，注明它补的是哪块短板、以及我们为什么没自己写。

## 静态分析与调试

| 工具 | 用来做什么 | 备注 |
|---|---|---|
| IDA Pro / Ghidra | 反汇编、交叉引用、伪代码；找「谁引用了这个字符串」这类问题的首选 | [B64XorDecryption](/projects/b64xordecryption) 里存了一份 IDA 伪代码当证据 |
| Frida | 运行期 hook 与内存读写，验证静态分析结论 | 移动端尤其顺手 |
| **Zydis** | x86/x64 反汇编库，用来在运行时找解释器 | [KMod-Loader-Windows](/projects/kmod-loader-windows) 用它定位蓝图解释器与 `GNatives` |
| **MinHook** | Windows 上的 inline hook 库 | [UE5 运行时逆向 · MinHook 上手](/ue5-re/09-minhook) |
| **Dobby / ShadowHook** | arm64 的 inline hook | [faction-mobile-so](/projects/faction-mobile-so) 的 hook 后端候选 |
| **Dumper-7 / MobileDumper-7** | 从运行中的游戏导出 C++ SDK 头 | KMod 的构建依赖；不随仓库分发 |
| **UE4SS** | 现成的 Lua 模组框架，也是「别人怎么做的」的参考实现 | [UE5 运行时逆向 · UE4SS Lua 模块](/ue5-re/10-ue4ss-lua) |

## 资产与容器

| 工具 | 用来做什么 | 备注 |
|---|---|---|
| **UAssetAPI** | 读写 `.uasset` / `.uexp`，并把字节码解析成 `KismetExpression[]` | 几乎所有 C# 工具的底座；UE5 新版本支持要靠自己补 |
| **CUE4Parse** | pak 与资产的读取实现 | [Prism](/projects/prism) 需要仓库外提供匹配的树，上游 API 会漂移 |
| **FModel** | 现成的资产浏览器 | [Flora](/projects/flora) 是它的定制分支 |
| **astcenc / texconv** | ASTC / BC 贴图编解码 | Prism 跨平台贴图移植的桌面端依赖 |
| **repak** | pak 写出 | Flora 的 pak packer 与 Prism 的 Android 侧都用到 |
| **Oodle** | 压缩解压 | 不分发；需要自备并遵守 UE EULA |
| **自研 · [solstice-pak](/projects/solstice-pak)** | 最小 `.pak` v3 读写，零依赖、可在 WASM 里跑 | 因为在浏览器里也要能出包 |
| **自研 · [ULocres](/projects/ulocres)** | `.locres` 四种版本读写 + CityHash64 / CRC32 | 哈希必须与 UE 逐位一致，自己造不出来就抄不对 |

## 字节码与写回

| 工具 | 用来做什么 | 备注 |
|---|---|---|
| **自研 · [KismetDecompiler](/projects/kismetdecompiler)** | 字节码 → 结构化伪代码（CFG 结构化、反 ubergraph） | 读的工具 |
| **自研 · [solstice-kismet](/projects/solstice-kismet)** | 节点模型 → 字节码 | 写的工具 |
| **自研 · [solstice-cskismet](/projects/solstice-cskismet)** | C#（Roslyn）→ 节点模型 → 字节码 | 只想改一行逻辑时最省事 |
| **自研 · [polaris](/projects/polaris)** | UHT 风格 C# SDK + 自研编译器 → 写回 → mod pak | 端到端最完整的一条 |
| **自研 · [KardsSim](/projects/kardsim)** | 字节码直译成 C#，脱离游戏跑对局 | 读的工具，但目标是执行 |
| **自研 · [solstice-jmap](/projects/solstice-jmap)** | jmap + 注册表 → 对象表与函数签名表 | 给上面几个当输入 |

## 桌面与服务端

| 工具 | 用来做什么 | 备注 |
|---|---|---|
| **.NET 10 / NativeAOT** | 主力语言与发布方式 | 单文件、零反射；源生成是前提 |
| **Avalonia** | 跨平台桌面 UI（Prism） | Windows 与 Android 共用一份界面逻辑 |
| **WPF + AdonisUI / Nodify** | Windows 专用 UI 与节点图（Solstice-winter、KismetReactor、Flora） | 节点图用 Nodify，省掉自己写画布 |
| **Dear ImGui** | 游戏内覆盖层 | KMod 的实验特性；不在发布包里 |
| **ASP.NET Core minimal API + FASTER** | fyserver 的运行时与本地 KV | [fyserver](/projects/fyserver) |
| **Gin + GORM** | kards-server-go | 同一协议面的另一种选型 |

## 文档与站点

| 工具 | 用来做什么 | 备注 |
|---|---|---|
| **VitePress** | 本站 | 见[本站是怎么搭的](/lab/colophon) |
| **mdBook** | [KMod 文档](/projects/kmod-docs) | 纯文档站，不需要前端 |
| **GitHub Actions** | 构建与发布（本站、mdBook） | 推到 `main` 就出站 |
| **Mermaid / ASCII 图** | 画流水线 | 本站统一用 `text` 代码块里的 ASCII，省一个插件 |

## 一个不太工具的建议

工具选型上我们只有一个偏好：**尽量让每一步都能在命令行里重放**。
图形界面用来找方向很好，但结论要能落成一条别人能跑的命令——否则下次游戏更新，
你自己也复现不出来。
