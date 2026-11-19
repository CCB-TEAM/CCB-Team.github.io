---
title: solstice-assetregistry
---

# solstice-assetregistry

[solstice-assetregistry](https://github.com/CCB-TEAM/solstice-assetregistry) 是 `AssetRegistry.bin` 的读取与追加库，基于 [UAssetRegistry](/projects/uassetregistry) 增加末尾追加资产所需的处理。

## 功能与边界

- 读取资产注册表，并在保留既有数据的前提下追加新资产和名称。
- 项目仅验证过 UE version 21，删除或修改已有资产条目不在支持范围。
- 依赖 UAssetAPI、UAssetRegistry 和 ULocres；仓库包含子模块，克隆时需要递归初始化。

追加策略、示例和验证记录见 [项目 README](https://github.com/CCB-TEAM/solstice-assetregistry#readme)。

相关：[solstice-bin](/projects/solstice-bin) · [UAssetRegistry](/projects/uassetregistry)
