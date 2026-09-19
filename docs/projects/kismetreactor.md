---
title: KismetReactor —— 蓝图字节码图形化编辑器
---

# KismetReactor

WPF 桌面工具：**图形化查看与原地修改 UE 蓝图的 Kismet 字节码**。
与 [KismetDecompiler](/projects/kismetdecompiler) 的“输出伪代码文本”路线互补——它把字节码渲染成可交互的树，
并允许直接在树上插入表达式、改常量、改跳转目标，然后写回 `.uasset`。

| 项 | 值 |
|---|---|
| 语言 / 框架 | C# · WPF（桌面）· Newtonsoft.Json |
| 底层 | UAssetAPI（`UAsset` / `ExportTypes` / `Kismet.Bytecode`） |
| 仓库 | <https://github.com/CCB-TEAM/KismetReactor> |
| 备注 | 仓库无 README，以下能力整理自源码 |

## 主要能力

**双模式浏览**

- **Mode 1（内联展开）**：把 `ExecuteUbergraph` 的 case 内联回各事件函数，隐藏 UberGraph，按事件视角阅读。
- **Mode 2（原始字节码）**：显示原始结构，保留 UberGraph 函数本身。

**树节点信息**

- 每个节点带**字节偏移头**（`OffsetHeader`），与 `CodeOffset` / `EntryPoint` 对齐。
- 变量引用解析（`ResolveVariable` / `ResolveOwner` / `ResolveImportFullName`），显示所属类与完整导入名。
- 选中节点即显示**伪代码**（`ToPseudoCode` / `StatementText`），并有 `CallFunc_` 等命名简化（`MathFunctionCleaner`）。
- 常量节点用彩色标题区分（`ColorizedHeader`）。

**编辑操作（右键菜单）**

| 操作 | 说明 |
|---|---|
| 修改常量 | 就地改 `EX_*` 常量值，带类型解析与安全写入判断（`CanWriteSafely`） |
| 设置跳转偏移 | 修改 `EX_ComputedJump` 等跳转目标偏移 |
| 插入字节码 | 从表达式类型列表选择并插入到目标节点旁（`InsertBytecodeWindow`） |
| 插入属性 | 需要属性引用的表达式走专门窗口（`InsertPropertyWindow`） |
| 自动导入 | 自动补齐表达式所需的 Import 项（`AutoImportWindow`） |
| 查看导入表 | 浏览与编辑 Import 列表（`ImportViewerWindow`） |

**跳转可视化**

- **跳转锚点** `JumpAnchor`：标记跳转与其目标节点，可在树上高亮配对。
- **收集跳转块**：按 `EntryPoint` 切块并给不同跳转块循环配色（`JumpPalette`，One Dark 主色半透明），
  快速看出 `switch (EntryPoint)` 的分支归属。
- 支持深拷贝表达式（`DeepClone` / `RemapOffsets`），保证内联与插入后偏移重算正确。

## 适用场景

- 研究 cooked 蓝图的实际字节码结构，验证反编译结果。
- 对没有源码的蓝图做**外科手术式修改**：改一个常量、换一个跳转目标、补一条表达式。
- 与 `AssetRegistry` / `.pak` 工具链配合，做打包前的资产级调整。

## 相关项目

- [KismetDecompiler](/projects/kismetdecompiler) —— 批量把蓝图字节码转成结构化伪代码文本
