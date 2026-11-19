---
title: solstice-jmap
---

# solstice-jmap

[solstice-jmap](https://github.com/CCB-TEAM/solstice-jmap) 合并 jmap 活对象转储与 `AssetRegistry.bin`，生成可查询的对象表和函数签名表，供蓝图工具使用。

## 输出与边界

- 生成对象路径、函数标志及参数方向等 JSON 元数据。
- 继承链与结构成员不能从这些表完整获得，需要查阅 usmap 或资产自身的数据。
- jmap 转储需要另行获得；本仓库不包含运行时导出部分或游戏资源。

提取命令、输出格式及已知边界见 [项目 README](https://github.com/CCB-TEAM/solstice-jmap#readme)。

相关：[solstice-kismet](/projects/solstice-kismet) · [solstice-cskismet](/projects/solstice-cskismet)
