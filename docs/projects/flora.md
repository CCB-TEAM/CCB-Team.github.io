---
title: Flora
---

# Flora

[Flora](https://github.com/CCB-TEAM/Flora) 是基于 [FModel](https://github.com/4sval/FModel) 和 CUE4Parse 的 Unreal Engine 资产浏览工具定制版本。

## 功能

- 可停靠的资产浏览工作区，以及蓝图节点图、伪代码查看。
- UMG 控件树预览和属性试改。
- 通过内置代理工具规划蓝图修改，并提供修改审阅和打包功能。
- 从已加载的游戏文件或本地文件创建 pak，支持部分资源替换。

## 使用与边界

项目使用 Windows WPF 和 .NET；构建内置代理界面还需要 Node.js。蓝图节点视图本身为只读，修改由代理工具完成并在保存前确认。UMG 属性试改仅在内存中预览，不写回资产。具体支持范围、构建步骤及上游许可参见 [Flora README](https://github.com/CCB-TEAM/Flora#readme)。

相关：[Prism](/projects/prism) · [项目总览](/projects/)
