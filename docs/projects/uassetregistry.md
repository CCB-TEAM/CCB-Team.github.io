---
title: UAssetRegistry —— AssetRegistry.bin 解析与回写
---

# UAssetRegistry

基于 **UAssetAPI**（`UnrealBinaryReader` / `UnrealBinaryWriter` / `FName` / `INameMap` 等）的
**Unreal Engine `AssetRegistry.bin` 解析与回写库**。解析逻辑移植自 [CUE4Parse](https://github.com/FabianFG/CUE4Parse)
的 `UE4/AssetRegistry` 模块，但底层类全部换成 UAssetAPI 提供的类型。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10（`net10.0`） |
| 依赖 | UAssetAPI 1.1.0（NuGet） |
| 仓库 | <https://github.com/CCB-TEAM/UAssetRegistry> |

## 特性

- ✅ **解析 AssetRegistry.bin** —— 完整 `FAssetRegistryState`：资产数组 + 依赖节点 + 包数据
- ✅ **快速枚举** —— `FPartialAssetRegistryState`，只读核心字段，速度快
- ✅ **语义级回写** —— `FAssetRegistryWriter` 把状态写回 bin，格式镜像读取器，UE / CUE4Parse 均可读回
- ✅ **手动建表** —— `FAssetData` 手动构造函数 + `FAssetRegistryState.AddAsset`
- ✅ **Tags 完整保留** —— FStore 解析覆盖 AnsiString / WideString / Name / ExportPath / LocalizedText
- ✅ **FName 精确还原** —— 含 number 后缀（如 `ZenLogo_64`）
- ✅ **命令行演示工具** —— 解析 / JSON 导出 / 简单版 JSON / 回写 / 手动构造测试

## 作为库使用

```csharp
using UAssetRegistry;

// 解析
var state = AssetRegistryLoader.LoadFromFile("AssetRegistry.bin");
foreach (var asset in state.PreallocatedAssetDataBuffers)
{
    Console.WriteLine($"[{asset.AssetClass}] {asset.ObjectPath}");
    foreach (var (key, value) in asset.TagsAndValues)
        Console.WriteLine($"  {key} = {value}");
}

// 快速枚举（只读核心字段）
var partial = AssetRegistryLoader.LoadPartialFromFile("AssetRegistry.bin");

// 语义级回写
AssetRegistryLoader.SaveToFile(state, "output.bin");
```

### 从零构造 / 增改删

```csharp
var state = new FAssetRegistryState
{
    // 建议用 21（ExternalActorToWorldIsEditorOnly）。不要用 LatestVersion(24)：
    // 该版本启用 16 字节对齐，当前 writer 不产生对齐填充，会导致读回错位。
    Version = FAssetRegistryVersionType.ExternalActorToWorldIsEditorOnly,
    FilterEditorOnly = true
};

state.AddAsset(new FAssetData(
    packageName: "/Game/MyFolder/BP_Enemy",
    packagePath: "/Game/MyFolder",
    assetName: "BP_Enemy",
    assetClass: "Blueprint",
    tagsAndValues: new Dictionary<string, string>
    {
        ["ParentClass"] = "Class'/Script/Engine.Character'"
    },
    chunkIDs: new[] { 0 },
    packageFlags: EPackageFlags.PKG_Cooked));

AssetRegistryLoader.SaveToFile(state, "new.bin");
```

修改 Tags 时 key 是 `FName`，需先找到原 key；新增 tag 用 `FName.DefineDummy(map, "MyNewTag")`，值写入时自动收集。
删除项则把 `PreallocatedAssetDataBuffers` 过滤后重新赋值即可。

## 命令行

```
用法: UAssetRegistry <AssetRegistry.bin 路径> [--top N] [--out <json文件>] [--partial] [--simple]
                     [--write <回写bin路径>] [--manual-test]
```

| 参数 | 说明 |
|---|---|
| `--top N` | 控制台显示条数（默认 10） |
| `--out <文件>` | JSON 输出路径（默认 `<输入>.json`） |
| `--partial` | 快速枚举模式（只输出核心字段） |
| `--simple` | 简单版 JSON（无 Tags/ChunkIDs/PackageFlags，Tags 仅保留父类信息） |
| `--write <bin路径>` | 解析后语义级回写为新 bin |
| `--manual-test` | 手动构造资产 → 写回 → 读回验证（无需输入文件） |

## 核心 API

| 类型 | 说明 |
|---|---|
| `AssetRegistryLoader` | 统一入口：`LoadFromBytes/File/Stream`、`LoadPartialFromBytes/File`、`SaveToBytes/Stream/File` |
| `FAssetRegistryState` | 完整解析结果：资产 / 依赖节点 / 包数据；`Version`、`FilterEditorOnly`、`AddAsset` |
| `FPartialAssetRegistryState` | 部分解析结果（仅 `FPartialAssetData[]`） |
| `FAssetData` | 单资产：`PackageName` / `PackagePath` / `AssetName` / `AssetClass` / `TagsAndValues` / `ChunkIDs` / `PackageFlags` / `ObjectPath` |
| `FAssetRegistryReader` / `FNameTableArchiveReader` | 新版（FixedTags+）/ 旧版读取器 |
| `FAssetRegistryWriter` | 语义级回写器 |
| `RegistryNameMap` | `INameMap` 实现，使 UAssetAPI 的 `FName` 直接使用 AssetRegistry 内嵌 name 表 |

## 文件布局（version ≥ FixedTags）

```
header (GUID + int32 version + int32 bFilterEditorOnly)
→ name batch（count + numStringBytes + hashVersion + hashes + 2B headers + name 数据）
→ 全局 FStore（magic + nums[11] + AnsiString/WideString 表 + Pairs + EndMagic）
→ FAssetData[]（每个资产：FName 字段 + map 头(ulong) + bundles + ChunkIDs + PackageFlags）
→ dependencies（int64 sectionSize + 节点）
→ packages（int32 count + 包数据）
```

## 技术说明

- `FAssetRegistryVersionType` 前 18 个值与 UAssetAPI `CustomVersions.FAssetRegistryVersion` 一致；UAssetAPI 1.1.0 缺少的 UE 后续版本（18~24）已补齐。
- **语义级回写**：writer 重建 name 表与 FStore（tag 值统一编码为 `AnsiString`）。输出是标准合法的 AssetRegistry.bin，读回后所有资产与 tags 逐字段一致，但**字节与原文件不同**——若要字节级一致，需在解析时额外保留原始 `FValueId` 类型。
- AssetRegistry.bin **无文件级 / 资产级校验和**；存在的 magic 仅约束结构边界（header GUID、FStore EndMagic）。`FAssetPackageData` 中的 `CookedHash`(MD5) / `ChunkHashes`(FIoHash) 是包内容哈希，且并非所有文件都含包数据。

## 相关项目

- [AssetRegistryTool](/projects/assetregistrytool) —— UE 5.6 编辑器插件，在编辑器内用该格式重新生成 AssetRegistry.bin
- [KismetDecompiler](/projects/kismetdecompiler) / [ULocres](/projects/ulocres) —— 同属 CCB-TEAM 的 UAssetAPI 工具链
