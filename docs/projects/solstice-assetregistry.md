---
title: solstice-assetregistry
---

# solstice-assetregistry

[solstice-assetregistry](https://github.com/CCB-TEAM/solstice-assetregistry) 是 `AssetRegistry.bin` 的读取与追加库，基于 [UAssetRegistry](/projects/uassetregistry) 增加末尾追加资产所需的处理。

## 架构

分三层，上游与补丁版的边界在编译期就定死：

| 层 | 来源 | 职责 |
|---|---|---|
| 读取 | 子模块 `external/UAssetRegistry` | 解析 `AssetRegistry.bin`，产出 `state.Assets` |
| 写回补丁 | 本仓库 `Vendored/` | 替换上游两份会写坏文件的实现 |
| 名字追加 | `NameBatchRebuilder` | 在不动原有 name batch 的前提下追加新名字 |

数据流是「加载 → 查 → 追名字 → 补资产 → 序列化」：

```text
AssetRegistryLoader.LoadFromFile
   ↓  state.Assets（既有条目原样保留）
NameBatchRebuilder（新名字追加到池尾，哈希表重算）
   ↓
序列化（既有 name batch 与 store 内容逐字节不变）
```

补丁不是运行时开关：csproj 用 `Compile Remove` 排除上游那两个文件，改为编译 `Vendored/` 下的副本。

## 功能与边界

- 读取资产注册表，并在保留既有数据的前提下追加新资产和名称。
- 项目仅验证过 UE version 21，删除或修改已有资产条目不在支持范围。
- 依赖 UAssetAPI、UAssetRegistry 和 ULocres；仓库包含子模块，克隆时需要递归初始化。

## 实现细节

两处补丁针对的都是「读得进、写出来坏」：

| 文件 | 问题 | 处理 |
|---|---|---|
| `FAssetRegistryWriter.cs` | tag map handle 的 bit63 处理与 v21 不符 | 换成 `Vendored/` 下的副本 |
| `FAssetData.cs` | `FTopLevelAssetPath` 少了 `ClassPackage` 段 | 同上 |

`NameBatchRebuilder` 按 name batch 的字段顺序逐段处理：

- 解析 `count / numStringBytes / hashVersion(0xC1640000) / hashes[] / 2 字节头 / 字符串池`
- 新名字追加到池尾，哈希表按 UE 的 CityHash64 重算（复用 `CCB-TEAM/ULocres`）
- `FName` 是变长的：带编号的名字占 8 字节，用 bit `0x80000000` 标记

实测（真实 `AssetRegistry.bin`，6,459,113 字节 / 16,250 资产 / 30,417 名字）：

- name batch 与 store 边界精确对齐，store 结束标记 `0x87654321` 落在预期位置
- 追加 2 个卡牌资产后重新序列化，store 段与原文件逐字节一致（4,239,547 字节）
- 名字哈希 0 处不匹配

追加策略、示例和验证记录见 [项目 README](https://github.com/CCB-TEAM/solstice-assetregistry#readme)。

相关：[solstice-bin](/projects/solstice-bin) · [UAssetRegistry](/projects/uassetregistry)
