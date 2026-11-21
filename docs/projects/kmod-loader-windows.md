---
title: KMod-Loader-Windows
---

# KMod-Loader-Windows

KARDS Windows 版模组加载器，提供与 Android 版相同的 Lua 模组 API，也支持可针对两个平台构建的 C++ 原生模组。

## 使用与状态

仓库提供日常使用的 release 构建和面向开发者的 dev 构建。按照官方文档将发行包中的文件放入游戏可执行文件所在目录；模组可使用文件夹或 `.kmod` 包。

README 将游戏内 ImGui 覆盖层标为**实验性功能**，它不包含在发布构建中，需要自行启用并构建。安装、版本和构建要求请以项目文档为准。

## 架构

一个代理 DLL 加一个核心库：代理只负责「被系统加载」，core 负责全部实际工作。

| 组件 | 作用 |
|---|---|
| `proxy/`（`dwmapi.dll`） | 转发系统 dwmapi 的每一个导出，并从自己的线程启动 core |
| `core/src/resolver.cpp` | 扫描 PE 镜像定位 `GUObjectArray`、名称池与 `UObject::ProcessEvent`；用 Zydis 反汇编定位蓝图解释器与 `GNatives` |
| `core/src/x64.cpp` | inline hook 引擎 |
| `core/src/win/overlay.cpp` | 建在 `IDXGISwapChain::Present` 上的 Dear ImGui 覆盖层（D3D11 / D3D12），实验性 |
| `core/lua` + `kmod.h` | Lua 宿主、`reflect.*` 反射层、mod 加载脚本与 native mod ABI，与 Android core 共用 |

```text
kards-Win64-Shipping.exe 启动
  └─ 加载同目录 dwmapi.dll（proxy）──► 转发导出 ──► 自有线程启动 core
                                                     ├─ resolver：扫 PE + Zydis 反汇编 → 定位反射与解释器
                                                     ├─ x64：inline hook（重定位 RIP 相对操作数与相对跳转）
                                                     ├─ Lua 宿主 → kmod\mods\ 下的文件夹或 .kmod 包
                                                     └─ overlay（仅 -DKMOD_OVERLAY=ON 时编译）
```

Windows 版没有 paks 目录，模组只从 `kmod\mods\` 读取，日志写 `kmod\logs\kmod.log`。native mod 引入 `kmod.h` 并导出 `kmod_start` / `kmod_stop`（`KMOD_MOD(...)`），同一份源码换 toolchain 即可编出 Android 的 `.so`；`mod.json` 用 `format: 2` 与 `platform` 数组区分两端产物，Windows 库放 `native/windows-x64/`。

## 实现细节

- **core 不在 `DllMain` 里启动。** `DllMain` 运行在 loader lock 下，期间创建线程、加载其他 DLL 或枚举模块都容易死锁；proxy 因此只做导出转发，把初始化交给自建线程。
- **代理导出表是生成出来的。** `tools/gen_proxy_exports.py` 从本机 `dwmapi.dll` 重新生成 `proxy/exports.inl`——系统 dwmapi 的每个导出都要有对应跳板，漏一个就可能让调用方直接失败。
- **inline hook 不是简单覆盖前几字节。** `x64.cpp` 需要重定位被搬走指令里的 RIP 相对操作数，以及相对跳转/条件跳转/`call`，否则 trampoline 在新地址上算出的目标会整体偏移。
- **不写死偏移。** 反射对象的地址来自 PE 扫描，解释器与 `GNatives` 来自 Zydis 反汇编，因此游戏更新后不需要维护一张常量表。
- **覆盖层默认不编译。** 只在 `-DKMOD_OVERLAY=ON` 时构建，`Insert` 打开；release 与 dev 发行包都不含它。
- **双平台单一 ABI。** `kmod.h` 中标 ANDROID ONLY 的部分（UI 面板、JNI）在 Windows 上为空，native mod 应判断 `api->platform`，而不是假定某一端的能力。
- **卸载即删文件。** 撤回只删除 `dwmapi.dll`，游戏文件从不修改；与 UE4SS 共存时须先给已有的 `dwmapi.dll` 改名——exe 目录下只能有一个 `dwmapi.dll` 被加载。
- **构建链**：Visual Studio C++ 工作负载 + CMake + Python 3，外加 Dumper-7 SDK 头（`tools/prepare_sdk.py` 打 MSVC 补丁）与 Lua 源码，构建目标为 `kmod_core` 与 `dwmapi_proxy`。

## 资料

- [GitHub 仓库](https://github.com/CCB-TEAM/KMod-Loader-Windows)
- [发行版本](https://github.com/CCB-TEAM/KMod-Loader-Windows/releases)
- [KMod 文档](https://ccb-team.github.io/kmod-docs/)
- [Android 版本](/projects/kmod-loader-android)
