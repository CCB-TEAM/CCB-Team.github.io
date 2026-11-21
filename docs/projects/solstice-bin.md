---
title: solstice-bin
---

# solstice-bin

[solstice-bin](https://github.com/CCB-TEAM/solstice-bin) 处理 UE version 21 `AssetRegistry.bin` 的容器层，包括分段布局、名称表、标签存储和末尾追加。

## 架构

四个类型按「切边界 → 持有 → 重建」分层，语义层不在这一层：

| 类型 | 职责 |
|---|---|
| `BinLayout` | 解析三段边界与头部字段；`TryParse` 校验 `EndMagic` 是否落在预期位置 |
| `NameBatch` | 名字表解析与追加（`FindOrAdd`），哈希用 UE 的 CityHash64 |
| `TagStore` | 标签存储解析与追加（`AddAnsiString` / `AddPairs`） |
| `BinFile` | 门面：`Load` → `Save()` / `AppendAssets()` |

文件按固定顺序分四段，读写都沿这条链：

```text
Header (24B)
NameBatch
Store
Body
```

`Load` 先用 `BinLayout` 切出边界，再把各段交给 `NameBatch` / `TagStore` 持有；追加时三者各自重建，由 `BinFile` 拼回整文件。

## 定位与边界

本库关注文件字节布局；资产语义和写入入口由 [solstice-assetregistry](/projects/solstice-assetregistry) 处理。README 说明当前仅验证过 version 21，支持末尾追加新资产，不支持删除或修改已有条目。

## 实现细节

| 段 | 内部结构 |
|---|---|
| Header | version / filterEditorOnly 等，24 字节 |
| NameBatch | `count` `numStringBytes` `hashVersion(0xC1640000)` `hashes[count]` `2 字节头[count]` `字符串池` |
| Store | `BeginMagic(0x12345679)` … `EndMagic(0x87654321)`，夹着标签名、导出路径、字符串与键值对 |
| Body | `AssetCount` + 资产记录 + `int64 depSectionSize` + 依赖段 + 包数据 |

- **name batch 结束后没有对齐填充**：实测 Store 的 `BeginMagic` 紧接字符串池最后一字节。
- **哈希必须与 UE 逐位一致**：name batch 的哈希用 CityHash64，复用 `CCB-TEAM/ULocres` 的实现而不自己造；这一位对不上，写出的 bin 游戏读不了。
- **`EndMagic` 是分段判据**：`BinLayout.TryParse` 只在 `0x87654321` 落在预期位置时认为三段可信。

两个取舍决定了库的形状：

1. **不改动就逐字节不变**——没有待追加内容时 `Save()` 直接返回原字节副本，绝不重新序列化，避免「只是读一下再保存」把文件写坏。
2. **追加是重建三段再拼，不是原地插入**——原地插入要搬几十 MB 数据并重算所有偏移；这里分别重建 name batch / store / body，再按 `Header + NameBatch + Store + Body` 顺序拼接，头部 24 字节原样复制。

构建、格式说明和示例见 [项目 README](https://github.com/CCB-TEAM/solstice-bin#readme)。

相关：[UAssetRegistry](/projects/uassetregistry) · [项目总览](/projects/)
