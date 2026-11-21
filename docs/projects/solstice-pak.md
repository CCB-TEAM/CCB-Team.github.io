---
title: solstice-pak
---

# solstice-pak

[solstice-pak](https://github.com/CCB-TEAM/solstice-pak) 是一个最小的 Unreal Engine `.pak` 读写库，针对 version 3 格式变体，使用 .NET 基础类库，可在 Blazor WASM 中运行。

## 架构

读写各一个入口，共用同一套布局定义：

| 类型 | 方向 | 职责 |
|---|---|---|
| `PakWriter.Build` | 写 | 接收 mount point 与 `PakEntry` 列表，返回完整 pak 字节 |
| `PakArchive.Read` | 读 | 从 footer 反推 index 与条目边界，校验后暴露 `Entries` |
| `PakEntry` | 数据 | 条目名 + 数据，名字是相对 mount point 的正斜杠路径 |

文件是「条目区 → index → footer」三段顺序拼接：

```text
[条目0 内嵌 FPakEntry (53B)][条目0 数据]
[条目1 内嵌 FPakEntry (53B)][条目1 数据]
...
[index]
[footer (44B)]
```

写方向按这条顺序拼出整文件；读方向反向定位：先用 footer 的 `indexOffset` / `indexSize` 取 index，再由每个条目在 index 里的 `offset` 定位数据。

## 功能与边界

- 构建和读取未压缩的 pak，并校验索引与条目的 SHA-1。
- 仓库提供使用合成数据的自检；README 也记录了一份真实 pak 的逐字节重建结果。
- 不支持压缩、加密索引、签名或 IoStore；其他 pak 版本未验证。

## 实现细节

**footer 固定 44 字节**（`4 + 4 + 8 + 8 + 20`）：

| 字段 | 类型 | 值 |
|---|---|---|
| magic | uint32 | `0x5A6F12E1` |
| version | int32 | `3` |
| indexOffset | int64 | index 起始位置 |
| indexSize | int64 | index 长度 |
| indexHash | byte[20] | index 的 SHA-1 |

**FPakEntry 固定 53 字节**（`8 + 8 + 8 + 4 + 20 + 5`）：`offset` int64、`size` int64、`uncompressedSize` int64、`compressionMethod` int32（0 = 不压缩）、`hash` byte[20]、`reserved` byte[5]。

两个决定成败的点：

1. 数据不在 `offset` 处，而在 `offset + 53`。每个条目前面都有一份内嵌的 `FPakEntry` 副本，`offset` 指向这份副本；内嵌副本自己的 `offset` 恒为 0，只有 index 里那份写真实偏移。
2. FString 的长度包含结尾的 `\0`：`"abc"` 写成 `int32(4) + "abc\0"`。

`reserved` 5 字节用途未确认，实测全 0，实现照抄。整个库只依赖 BCL 的 `BinaryWriter` 与 `SHA1`。

`PakArchive.Read` 的校验顺序：footer 边界 → index 的 SHA-1 → 每个条目的数据 SHA-1 → 索引是否被完全消费。实现曾对一份真实 pak（66,520 字节 / 2 条目）逐字节复现，`PakWriter.Build` 重建的文件与原始文件完全一致。

格式、示例和验证方法见 [项目 README](https://github.com/CCB-TEAM/solstice-pak#readme)。

相关：[Prism](/projects/prism) · [项目总览](/projects/)
