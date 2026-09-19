---
title: ULocres —— UE LocRes 本地化读写
---

# ULocres

基于 [UAssetAPI](https://github.com/atenfyr/UAssetAPI) 的 UE **LocRes（本地化资源）读取 / 回写库**。
解析逻辑参考 [CUE4Parse](https://github.com/FabianFG/CUE4Parse) 的 `FTextLocalizationResource`，
读写全部使用 UAssetAPI 的 UE 类型（`UnrealBinaryReader` / `UnrealBinaryWriter` / `FString`）。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 |
| 依赖 | UAssetAPI 1.1.0（NuGet） |
| 仓库 | <https://github.com/CCB-TEAM/ULocres> |

## 特性

- 支持全部 LocRes 版本：`Legacy(v0)` / `Compact(v1)` / `Optimized_CRC32(v2)` / `Optimized_CityHash64_UTF16(v3)`
- 读取后**保留原 hash / LUT 引用计数**，未修改的内容写回与原文件**逐字节一致**
- 提供便捷索引器 `file[namespace, key]` 读取与修改翻译
- 基于 UAssetAPI 的 UE 类型做二进制读写，无其它运行时依赖

::: tip 实测数据
已用 KARDS `Game.locres`（zh-Hans，v3，60 命名空间 / 13 471 条目）验证：
读取 → 回写 → 再读取全部条目一致，且回写文件与原文件 **1 909 867 字节逐字节相同**。
:::

## 使用

```bash
# 库
cd ULocres && dotnet build

# Demo（读取 → 回写 → 读回校验）
cd ULocres.Demo
dotnet run -- "Game.locres" ["输出.locres"] [--dump]
```

```csharp
using ULocres;

// 读取
var file = LocResFile.Load(@"Content\Localization\Game\zh-Hans\Game.locres");
Console.WriteLine($"version={file.Version} namespaces={file.Namespaces.Count} entries={file.TotalEntries}");

// 查询（不存在返回 null）
string? text = file["Card", "oc_3_title"];

// 修改已有翻译（key 不变 → 原 hash 保留，写回仍兼容 v3）
file["Card", "oc_3_title"] = "新翻译";

// 新增条目
file["NewNamespace", "new_key"] = "hello";
file.Save("Game.patched.locres");                              // 沿用读入版本
file.Save("Game_v2.locres", ELocResVersion.Optimized_CRC32);   // 或指定版本
```

从零构造也可以：

```csharp
var file = new LocResFile { Version = ELocResVersion.Optimized_CRC32 };
file["Achievements", "first_win"] = "首胜！";
file.Save("out.locres");
```

## 关于 namespace / key 哈希

LocRes v2/v3 会对 namespace 与 key 做预哈希以加速查找。本库完全对齐 UE 实现：

- **保留原 key**：写回沿用读入时的 hash，逐字节一致。
- **新增 / 改名 key**（v2、v3 均支持）：
  - v3（`Optimized_CityHash64_UTF16`）：内置 `CityHash.HashStringUtf16`——逐行移植 UE `CityHash.cpp`（v1.1 后端，含 bswap 版 `HashLen33to64`），结果按 UE `TextKeyUtil::HashString` 折叠 `(u32)low + (u32)high * 23`；空串按 UE 行为返回 0。
  - v2（`Optimized_CRC32`）：`LocResFile.StrCrc32`，对齐 UE `FCrc::StrCrc32`（逐 UTF-16 字符取低 8 位）。

::: tip 实测数据
已用 KARDS `Game.locres` 的 **13 471 组 (namespace, key, 读入 hash)** 全量验证：每个 hash 均与 `CityHash.HashStringUtf16` 一致；
新增条目写回后再读回也全部一致（61/61 namespace、13 474/13 474 key）。
:::

## 模型结构

```
LocResFile
├─ Version        ELocResVersion（读写版本，新建默认 v2）
├─ Namespaces     List<LocResNamespace>
│    ├─ Name / NameHash / NameHashKnown
│    └─ Entries   List<LocResEntry>
│         ├─ Key / KeyHash / KeyHashKnown
│         ├─ SourceStringHash  源字符串哈希（原样回写）
│         └─ LocalizedString   本地化文本
```

## 二进制格式（速览）

```
[FGuid magic 16B + u8 version]        （Legacy 无此头）
[Compact+: i64 LUT offset → u32 count + (FString text [+ i32 refCount])]
[v2+: u32 entriesTotal]（读端跳过）
u32 namespaceCount
  每 namespace: [v2+: u32 nsHash] FString name, u32 keyCount
     每 key:     [v2+: u32 keyHash] FString key, u32 sourceHash,
                 Compact+: i32 lutIndex | Legacy: FString 内联
```

## 相关项目

- [Prism](/projects/prism) —— 桌面 / Android 端可在 App 内直接编辑 `.locres` 并写回 patch pak
