---
title: solstice-jmap
---

# solstice-jmap

[solstice-jmap](https://github.com/CCB-TEAM/solstice-jmap) 合并 jmap 活对象转储与 `AssetRegistry.bin`，生成可查询的对象表和函数签名表，供蓝图工具使用。

## 架构

两份输入、四份输出，中间没有额外状态：

```text
jmap.json（/Script 对象）+ AssetRegistry.bin（/Game、/Engine 与插件根）
   ↓ 合成
objects.json / objects.kards.json
   ↓ 按对象完整路径组织
functions.json / functions.kards.json
```

| 文件 | 内容 |
|---|---|
| `objects.json` | 对象表；`/Script` 来自 jmap，`/Game`、`/Engine` 与插件根来自 AssetRegistry |
| `objects.kards.json` | 只保留 Kards 相关包，用于缓存 |
| `functions.json` | 以对象完整路径为 key，函数嵌在对象里，含 `flags` 与 `params` |
| `functions.kards.json` | 同上，只保留 Kards 包（体积约为完整版的 1/10） |

`metadata` 段记录来源与计数，便于核对。转储来自 `kards-Win64-Shipping.exe`，`build` 记为 `++UE5+Release-5.6-Fork-CL-0`，`engine` 为 5.6：

```json
{
  "metadata": {
    "extractor": "Solstice.Tools.JmapExtractor",
    "counts": { "objects": 47311, "fromJmap": 29675, "fromRegistry": 17636 }
  }
}
```

## 输出与边界

- 生成对象路径、函数标志及参数方向等 JSON 元数据。
- 继承链与结构成员不能从这些表完整获得，需要查阅 usmap 或资产自身的数据。
- jmap 转储需要另行获得；本仓库不包含运行时导出部分或游戏资源。

## 实现细节

**两层 key，别搞混**：

| 层 | key 形态 |
|---|---|
| 对象层 | 对象完整路径，如 `/Script/Engine.KismetSystemLibrary` |
| 函数层 | 短名，取自对象路径最后一个 `:` 之后 |

例外：outer 是 `Package` 的对象，路径用 `.` 分隔、没有 `:`，短名提取会退化成完整路径。实测 47311 条对象里有 447 个这样的函数 key，全部是 `__DelegateSignature`；按短名索引时要额外按后缀匹配一遍，否则会静默漏掉所有 delegate 签名。

**参数方向不能只看 `dir`**。每个顶层参数另带 `ref` / `const` 两个布尔位，直接转录 `CPF_ReferenceParm` / `CPF_ConstParm`：

| `dir` | `ref` | `const` | 含义 |
|---|---|---|---|
| `return` | — | — | 返回值 |
| `out` | `false` | — | 真输出，调用方写回 |
| `out` | `true` | `false` | 可读写引用 |
| `out` | `true` | `true` | 按引用只读入参（`UPARAM(ref)` 的 const 引用） |
| `in` | `false` | — | 值传递 |
| `in` | `true` | `true` | const 引用入参 |

`dir` 是 `CPF_OutParm` 的折叠视图，而 `CPF_OutParm` 也会被 `UPARAM(ref)` 的按引用入参置上。实测 `Array_Add` 的 `TargetArray` 与 `NewItem` 都是 `dir=out` 且 `ref` / `const` 为 true，实际是入参；`Array_Get` 的 `Item` 是 `dir=out, ref=false`，才是真输出。KARDS 5.6 的 26811 个顶层参数里：值传递与只读入参 14894、返回值 6674、按引用只读入参 2766、真输出 2271、可读写引用 206。`ref` / `const` 只写在顶层参数上，`inner` / `key` / `value` 这类元素类型没有传参方向。

**`flags` 不足以决定调用形态**：`FUNC_Static` 只是必要条件之一。引擎在 `EX_FinalFunction` / `EX_LocalFinalFunction` / `EX_CallMath` / `EX_VirtualFunction` / `EX_Context` 之间选哪个，是六个条件的合取，其中一个（调用目标兼容性）在 jmap 里不存在，无法完整复现。

提取命令、输出格式及已知边界见 [项目 README](https://github.com/CCB-TEAM/solstice-jmap#readme)。

相关：[solstice-kismet](/projects/solstice-kismet) · [solstice-cskismet](/projects/solstice-cskismet)
