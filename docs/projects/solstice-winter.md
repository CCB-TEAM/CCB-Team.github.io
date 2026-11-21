---
title: Solstice-winter
---

# Solstice-winter

[Solstice-winter](https://github.com/CCB-TEAM/Solstice-winter) 是面向 UE cooked 蓝图的工作台，目标是提供类似引擎编辑器的节点视图。

## 功能与现状

- 读取 pak 并建立跨资产索引，包含类、函数签名、变量和引用。
- WPF 界面展示蓝图节点和连线，并提供命令行工具。
- 当前节点渲染可用，但**编辑尚未接入**；节点布局由工具计算，不是原作者的编辑器布局。

仓库 README 提供运行脚本、构建要求和各模块验证记录。使用前请查阅 [项目 README](https://github.com/CCB-TEAM/Solstice-winter#readme)。

## 架构

四个工程，按数据流单向依赖：`Pak` → `Index` → `App` / `Cli`。

| 模块 | 职责 | README 记录的数字 |
|---|---|---|
| `SolsticeWinter.Pak` | 读真实 pak：v11、AES 加密索引、Oodle | 33808 条目；4274 个文件与 FModel 导出逐字节一致 |
| `SolsticeWinter.Index` | 扫资产建跨资产索引：类、函数签名、变量、引用 | 2137 资产 / 9303 函数；6.6 s 建、296 ms 载 |
| `SolsticeWinter.App` | WPF + Nodify 节点视图（只读） | `BP_Logic / DrawTopCardFromDeck`：52 节点 / 46 连线 |
| `SolsticeWinter.Cli` | 命令行 `pak` / `index` / `profile` | 见 `docs/INDEX.md` |

```text
.pak ──► SolsticeWinter.Pak（解容器 / 解密索引 / 解压）
              └─► SolsticeWinter.Index（扫资产 → 类·函数签名·变量·引用 → 落盘一份索引）
                        ├─► SolsticeWinter.App：WPF + Nodify 渲染节点与连线
                        └─► SolsticeWinter.Cli：pak / index / profile 子命令
```

`run.ps1` 把整条链路串成三步：`dotnet build -m:1` → 索引不存在就建 → 启动 UI。索引是磁盘产物，因此第二次启动只付载入成本（296 ms 量级），不重扫 2137 个资产。

## 实现细节

- **`-m:1` 不是可选优化。** 本机 MSBuild 的并行节点会失败，且失败形态是「生成失败 / 0 个错误」——连一条 `error` 都不留。`run.ps1` 已带上该参数，直接敲 `dotnet build` / `dotnet run` 时必须自己加。
- **先跑通只读渲染，编辑后接。** 当前 UI 只消费索引与字节码结构，不回写资产；「编辑未接」是已知缺口，不是待验证项。
- **布局是算出来的。** cooked 资产不保存原作者在编辑器里的节点位置，节点视图的位置来自工具自身的布局计算，与原作者布局无关，也不打算还原。
- **pak 兼容性靠逐字节比对确认**，而不是「能打开」：4274 个文件与 FModel 导出对齐后，才认为 v11 / AES / Oodle 这条路径可信。
- **「序列化成功」不等于「运行期正确」。** 项目明确不把前者当后者，验证记录逐模块写明各自证明了什么、没证明什么。
- **仓库不含游戏资产、密钥与解包产物**，索引与 pak 都需在本地自行生成。

相关：[KismetReactor](/projects/kismetreactor) · [项目总览](/projects/)
