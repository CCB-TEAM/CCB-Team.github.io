---
title: AssetRegistryTool —— UE5.6 资产注册表插件
---

# AssetRegistryTool

UE 5.6.1 编辑器插件：**从已有资产注册表 + 当前工程内的资产，构建一份新的 `AssetRegistry.bin`**。
服务于 cooked 游戏改包场景——需要把新增或替换的资产登记进原版注册表时，不必手写二进制。

| 项 | 值 |
|---|---|
| 语言 / 引擎 | C++ · Unreal Engine 5.6.1 编辑器插件 |
| 形态 | 编辑器菜单工具 + commandlet（兼容旧流程） |
| 仓库 | <https://github.com/CCB-TEAM/AssetRegistryTool> |

## 编辑器用法

1. 把插件目录拷到 `YourProject/Plugins/AssetRegistryTool`，或作为引擎 / 工程插件保留。
2. 启用插件，按 Unreal 提示重新编译工程。
3. 打开编辑器菜单 `Tools > Asset Registry Tool`。
4. 选择基础 `AssetRegistry.bin`。
5. 选择生成注册表的输出路径。
6. 在 Content Browser 里选中资产后点 `Generate From Selected Assets`，或点 `Generate From All / Game Assets`。

生成结果 = 基础注册表 + 选中的工程资产。**覆盖开关**决定工程资产是否替换基础注册表中同 object path 的已有条目。

## Commandlet 用法

旧版 commandlet 流程仍保留以兼容既有脚本：

```powershell
# 列出注册表内容
UnrealEditor-Cmd.exe "X:/Project/Project.uproject" -run=AssetRegistryTool List \
  -AssetRegistry="X:/AssetRegistry.bin" -OutFile="X:/AssetRegistry.json"

# 合并两份注册表
UnrealEditor-Cmd.exe "X:/Project/Project.uproject" -run=AssetRegistryTool Merge \
  -HostAssetRegistry="X:/Host/AssetRegistry.bin" \
  -AssetRegistry="X:/Donor/AssetRegistry.bin" \
  -OutputAssetRegistry="X:/Out/AssetRegistry.bin" \
  -FilterPaths="/Game/L10N" -OverwriteExistingAssets
```

## 注意事项

- 编辑器工具读取的是**当前 UE 工程可见**的资产注册表，导出前请先保存并刷新资产。
- 用于 cooked 游戏改包时，**必须在目标游戏中实测**生成的 `AssetRegistry.bin`：部分游戏依赖 cooked 包元数据或自定义加载行为，这些无法仅从编辑器资产推断出来。

## 相关项目

- [UAssetRegistry](/projects/uassetregistry) —— 脱离引擎、纯 .NET 读写同一格式的库，适合做批量处理与自动化
