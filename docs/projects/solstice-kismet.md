---
title: solstice-kismet
---

# solstice-kismet

[solstice-kismet](https://github.com/CCB-TEAM/solstice-kismet) 将平铺节点模型编译为 UE 蓝图函数的 Kismet 字节码，并通过 UAssetAPI 写回资产。

## 架构

生成方向从平铺节点模型出发，还原方向从字节码出发，共用同一套节点与参数模型：

| 类型 | 职责 |
|---|---|
| `KNode` / `KArg` | 平铺节点与参数，不带控制流图 |
| `KismetCompiler` | 节点 → `KismetExpression`，负责跳转偏移与序列化布局 |
| `KismetDecompiler` | 字节码 → 节点；结果必是「树形 / ubergraph 展开 / 基本块图」之一 |
| `KismetWorkspace` | 门面：打开资产、反编译、改、生成、`Save` |
| `FunctionCatalog` / `ObjectCatalog` | jmap 产物，提供签名、`flags`、归属类与引脚 |
| `UbergraphBaker` | 重烘 `ExecuteUbergraph_*`，产出段偏移与调用点入口表 |

数据流是「资产进、资产出」，校验夹在每一步之间：

```text
.uasset + .uexp + .usmap
   ↓ KismetWorkspace.Open（UAssetAPI 只能按路径构造，内部写临时文件）
KNode 列表 ←→ 表达式树
   ↓ Generate → 逐字节校验 → Save
.uasset + .uexp（两半，缺一不可）
```

`AttachCatalog` / `AttachObjects` 是可选输入：前者用于自动构造插销与推断调用形态，后者让 `ResolveFunction` 接受类短名。

## 功能与边界

- 提供节点到字节码的生成、布局和校验，以及对已有字节码的结构还原。
- 对不认识的表达式可保留原始节点；结构还原不保证与原始源码逐节点语义等价。
- 仅覆盖部分指令，README 标明只验证过 UE 5.6；新增变量及名称表处理需要特别注意。

## 实现细节

**跳转操作数是字节偏移，不是表达式下标**：

```text
EX_Jump        = token(1) + uint32 偏移          共 5 字节
EX_JumpIfNot   = token(1) + uint32 偏移 + 内嵌条件表达式
EX_EndOfScript = token(1)                        值 0x53
```

条件表达式内嵌在 `EX_JumpIfNot` 里，不是数组里的独立一项。所以跳转目标必须两遍算：先按每条指令的实际序列化长度累加出字节偏移，再回填；`CompileToExpressions` 接受 `measure` 回调（`Func<KismetExpression, uint>`）做这件事。

| 项 | 事实 |
|---|---|
| `EX_Context.Offset` | 取 `ContextExpression` 的序列化长度（对象为 null 时要跳过的字节数），不是 vtable 偏移 |
| `KismetPropertyPointer` | UE5.6 必须用 `New`（`FFieldPath`）形态；`Old` 形态会 `NullReferenceException`，因为序列化走 `ShouldSerializeNew` 分支 |
| `EX_Let` / `EX_LetBool` | `EX_Let` 的 `Value`（指针）与 `Variable`（表达式）都要给；`EX_LetBool` 只有 `VariableExpression`，赋值源是 `EX_True` / `EX_False` |
| Import 链 | 三级 Package → Class → Function，索引是 1 基负数（负数 = Import，正数 = 本包导出）；新增条目克隆同类现有导入，只替换 `ObjectName` 与 `OuterIndex` |

**调用形态由签名推断**：本资产导出的函数发 `EX_LocalVirtualFunction`（按 FName），签名含 `FUNC_Static` 发 `EX_FinalFunction`（StackNode 指向 Import），非静态发 `EX_Context`（需要一个对象表达式）。

ubergraph 的入口偏移不烘在 `ExecuteUbergraph_*` 里，而是烘在调用点（`LocalFinal ExecuteUbergraph_X(<IntConst>)`）。`UbergraphCallSites` 扫调用点、`CheckUbergraphEntryPoints` 校验，编辑后错位会自动回滚，`Save` 前再拦一次。实测 `BP_Chat` 的 `ExecuteUbergraph_BP_Chat` 重烘后有 4 个入口、尾声偏移 1565。

验证方式：一个含 56 条表达式的函数读出再写出，与原 `.uexp` 对应区段逐字节相同；写出的资产重新加载、再写出，两半字节保持一致。

支持范围、示例和自检方式见 [项目 README](https://github.com/CCB-TEAM/solstice-kismet#readme)。

相关：[solstice-cskismet](/projects/solstice-cskismet) · [KismetDecompiler](/projects/kismetdecompiler)
