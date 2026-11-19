---
title: solstice-bin
---

# solstice-bin

[solstice-bin](https://github.com/CCB-TEAM/solstice-bin) 处理 UE version 21 `AssetRegistry.bin` 的容器层，包括分段布局、名称表、标签存储和末尾追加。

## 定位与边界

本库关注文件字节布局；资产语义和写入入口由 [solstice-assetregistry](/projects/solstice-assetregistry) 处理。README 说明当前仅验证过 version 21，支持末尾追加新资产，不支持删除或修改已有条目。

构建、格式说明和示例见 [项目 README](https://github.com/CCB-TEAM/solstice-bin#readme)。

相关：[UAssetRegistry](/projects/uassetregistry) · [项目总览](/projects/)
