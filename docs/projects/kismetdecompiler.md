---
title: KismetDecompiler —— UE5 蓝图字节码反编译
---

# KismetDecompiler

基于 **UAssetAPI**（`KismetExpression[]` AST）的 Unreal 蓝图反编译工具：
把 `FunctionExport.ScriptBytecode`（已解析的 Kismet 字节码表达式树）渲染为**可读的 C++ 风格伪代码**，
并做结构化控制流还原与语义优化。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 |
| 依赖 | UAssetAPI 1.1.0（NuGet） |
| 仓库 | <https://github.com/CCB-TEAM/KismetDecompiler> |

## 特性

- **表达式渲染**：`ExprRenderer` —— AST → 伪代码字符串（变量路径 / 函数名 / 常量 / 类型）
- **控制流结构化**：CFG 切块与支配关系分析，还原 if、循环与 switch 等结构
- **反 Dispatch**：识别 `ExecuteUbergraph`（`ComputedJump(EntryPoint)` 起手，EntryPoint == 字节偏移），还原为 `switch (EntryPoint)`，case 标注来源事件函数
- **Dispatch 内联**（实验）：把 case 体内联回各事件函数，跳转段栈式追踪
- **语义优化**（实验）：临时量值流内联（含跨纯赋值行传播）、`CallFunc_` 命名简化、常量折叠
- 所有高级特性都是**可叠加的开关**，不覆盖基础路径

## 用法

```
用法: KismetDecompiler --input <蓝图.uasset | 目录> [--usmap <mapping.usmap>] [--out <dir>]
                       [--opt] [--inline] [--jobs N] [--uhtdump <目录>]

  --input   目标 .uasset 文件，或递归处理目录；--uasset 为兼容别名
  --usmap   UE5 unversioned properties 映射文件（.usmap）
  --out     输出目录（默认 ./Decompiled）
  --inline  dispatch case 体内联回事件函数（实验）
  --opt     语义优化：临时量值流内联 / 常量折叠 / 命名简化（实验）
  --jobs    目录模式下的并行度
  --uhtdump UHT 头文件导出目录，用于还原形参信息
  --disasm  显示反汇编视图；--flowdebug / --cfg 用于执行流与 CFG 调试
```

```bash
# 默认：结构化反编译 + ExecuteUbergraph 反 Dispatch
KismetDecompiler --input BP_Card.uasset --usmap mappings.usmap

# 开启全部实验特性
KismetDecompiler --input BP_Card.uasset --usmap mappings.usmap --inline --opt
```

产物默认输出到 `Decompiled/`：每个资产一个 `.cpp` 文件，包含函数索引和函数体；可用 `--ext` 修改扩展名。

## 结构

```
KismetDecompiler/
├── KismetDecompiler.csproj        # net10.0 + UAssetAPI 1.1.0
├── Program.cs                     # 入口：uasset/usmap 加载 + 模式开关
├── ExprRenderer.cs                # 表达式 → 伪代码（含名称解析）
├── StructuredKismetDecompiler.cs  # CFG 结构化 + 反 Dispatch（switch-case）
├── DispatchInliner.cs             # [实验] dispatch 内联回事件函数
├── SemanticOptimizer.cs           # [实验] 行级语义优化（值流）
└── Decompiled/                    # 输出（不入库）
```

## 技术要点

- UAssetAPI 已把字节码解析为 `KismetExpression[]`（`StructExport.ScriptBytecode`），本工具只做渲染 / 结构 / 优化。
- `EX_*` 表达式的字节偏移用 `GetSize(asset)` 累计，与 `CodeOffset` / `EntryPoint` 精确对齐。
- `ExecuteUbergraph` 调用在事件函数中是 `EX_LocalFinalFunction`，通过 `StackNode.Index` 匹配 export。
- UE 函数调用的 out 形参（如 `getSkirmishBP(Temp)`）直接把结果写进引用参数，而非返回赋值，此类不做内联。

## 已知限制

- Dispatch case 内个别跨段 goto 以 label/goto 形式保真保留，不强制结构化。
- 优化会处理符合条件的临时量和控制流；涉及引用形参或不能证明等价的情形可能保留原样。
- 实验性功能可能随输入变化出现边界情况。

## 相关项目

- [KismetReactor](/projects/kismetreactor) —— 同样基于 Kismet 字节码的**图形化查看 / 编辑**工具（WPF）
- [UEBlueprintGraphViewer](/projects/upstream#ueblueprintgraphviewer) —— 上游衍生项目：蓝图反编译 + 调试器 + 引用搜索
