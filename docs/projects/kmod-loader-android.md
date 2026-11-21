---
title: KMod-Loader-Android
---

# KMod-Loader-Android

KARDS Android 版 Lua 模组加载器。模组可通过 Unreal 反射系统读取和调用游戏对象，并可从游戏 pak 中加载资产。

## 使用与状态

项目支持 Lua 5.4 和 `.kmod` 模组包，并提供游戏内模组页面、日志和开发工具。README 说明无需 root，但需要将加载器加入 APK 并重新打包、签名；具体安装和构建步骤见项目文档。

仓库只提供加载器源码，不包含游戏、修改后的 APK 或签名密钥。兼容性和发行版本请以仓库说明为准。

## 架构

两个原生库，加一层 Java 侧入口改动与重打包脚本：

| 组件 | 作用 |
|---|---|
| `loader/`（`libkmod.so`） | 被 `SplashActivity` 加载的壳 |
| `core/`（`libkmodcore.so`） | `ProcessEvent` hook、Lua VM、反射层、日志 |
| `core/lua/` | `modloader.lua`、`modmanager.lua`（游戏内 Mods 页）、`commands.lua`（控制台命令） |
| `overlay/` | 开发者构建的浮动控制台（Java） |
| `tools/` | DexTool（改 `SplashActivity`）与 `repack.py`（重打包） |

```text
官方 KARDS APK
  └─ 放入 loader/ 与 core/ ──► DexTool 修改 SplashActivity ──► repack.py 重打包 ──► 自行签名安装
                                    │
                                    └─ 启动：SplashActivity 加载 libkmod.so → libkmodcore.so
                                         ├─ hook UObject::ProcessEvent（经反射读/调游戏对象）
                                         ├─ Lua 5.4 VM → kmod 模组目录下的文件夹或 .kmod 包
                                         └─ 日志 / 崩溃处理 / 命令控制台
```

`.kmod` 是 zip，内含 `mod.json`、设置、本地化与带版本约束的依赖（如 `kmod>=0.2.0`、`kards>=1.61`）。Mods 页挂在游戏自身的 Settings 界面里。README 另提到 `installer/` 是一个 Android 应用（检查已安装的 Unreal 游戏、注入加载器并装到手机上），但它被写在「Not included」一节下，取用前需自行确认仓库内容。

## 实现细节

- **不需要 root，代价是重打包。** 加载器被编进游戏 APK，由使用者自己重打包并签名；因此没有现成可用的 APK，仓库也不含游戏二进制、SDK dump 或签名密钥。
- **改的入口点只有一个 Activity。** `tools/DexTool` 直接修改 `SplashActivity`，让它加载 `libkmod.so`——改动面越小，重打包后与官方包的差异越可控。
- **重打包是一条命令。** `build.ps1 -Flavor dev|release` 串起构建、重打包与签名，避免手工分步时出现「DEX 改了但 SO 没换」这类不一致。
- **两个 SO 分工明确。** 壳（`libkmod.so`）只把自己与 core 送进进程；hook、Lua VM、反射全在 `libkmodcore.so`，core 的实现与 Windows 版共用同一套 Lua 宿主与 `reflect.*`。
- **依赖自备。** 需要官方渠道的 KARDS APK，以及自己的 SDK dump（Dumper-7 / MobileDumper-7）；这些东西不在仓库里。
- **Lua 来源固定。** 构建当前取 UE4SS 的 `deps/first/LuaRaw`（MIT），Lua 5.4 的宿主代码由此而来。
- **发行分两种 flavor。** `-Flavor dev` 额外带浮动控制台与调试输出，`release` 不带；选择 flavor 即选择要不要把调试入口打进包里。

## 资料

- [GitHub 仓库](https://github.com/CCB-TEAM/KMod-Loader-Android)
- [发行版本](https://github.com/CCB-TEAM/KMod-Loader-Android/releases)
- [KMod 文档源码](https://github.com/CCB-TEAM/kmod-docs)
- [Windows 版本](/projects/kmod-loader-windows)
