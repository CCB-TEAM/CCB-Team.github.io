---
title: Prism —— UE .pak 模组工具箱
---

# Prism

面向 **Windows 桌面与 Android** 的 UE4 / UE5 `.pak` 资产管理工具箱，基于 [CUE4Parse](https://github.com/FabianFG/CUE4Parse)，
在 [kardswalker/Prism](https://github.com/kardswalker/Prism) 的基础上扩展：浏览与预览 pak 内容、导出与分享资产、
构建贴图替换模组包，以及**在游戏的 PC 与移动端构建之间移植贴图**。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 · Avalonia（桌面 + Android 共用逻辑层） |
| 底层依赖 | CUE4Parse、UAssetAPI（含本地 patch 的 vendored 版本） |
| 许可 | GPL-3.0（继承自上游 kardswalker/Prism） |
| 仓库 | <https://github.com/CCB-TEAM/Prism> |

## 能做什么

**浏览与预览**

- 挂载 UE4/UE5 `.pak`，支持加密 pak 的 AES key；`.usmap` 与 `.jmap` 映射文件（含 `.gz`）按扩展名自动识别。
- 文件管理器式浏览 + 关键字搜索，搜索框里直接输入 pak 内路径可跳转导航。
- 把相关的 `.uasset` / `.uexp` / `.ubulk` 归并为一个资产条目。
- 预览贴图（带缩略图）、音频（内置播放器）、3D 网格线框、本地化（`.locres`）、蓝图伪代码。
- 导出原始 package、PNG 图片、整个目录，或分享到其它 App。

**贴图替换**

- 选一个贴图资产 + 提供一张图片，直接产出 patch pak，无需手工 repack。
- 桌面端经 UAssetCLI + astcenc / texconv 编码；Android 端经 `libprism_codecs` 进程内编码。

**Pak 合并**

- 多选 pak，长按拖动设置覆盖优先级（列表中**越靠下越优先**），构建前可检查冲突。

**Pak 转换（跨平台贴图移植）**

- 把某个平台 pak 里的贴图搬进另一个平台的 pak，并按目标资产的格式重新编码。
- 默认**只输出变更的资产**：7 GB 主 pak + 一张贴图 → **685 KB** 模组包。

**本地化与诊断**

- 在 App 内编辑 `.locres` 条目并写回 patch pak；导出为 JSON，并在四种 locres 格式版本间安全往返。
- 结构化日志（级别、时间戳、完整异常栈、磁盘镜像）与可导出的诊断报告。

## Pak 转换的原理

同一个资产路径在 PC 与移动端 pak 中都存在，但像素格式不同（PC 用 BC，移动端用 ASTC）。转换流程：

1. 打开**主 pak**（目标平台的 pak，即“母包”）并读取其文件索引。
2. 解包**源 pak**（另一平台的包），按 **pak 内部路径**匹配条目。
3. 对每个匹配项：取出源贴图像素 → 重编码为主 pak 资产的格式 → 写回该资产 → 打包。

**输出格式为什么由主 pak 决定**：cooked 资产在 `.uasset` 头部声明像素格式、尺寸与 mip 布局，头部同时决定各 mip 落在
`.uexp` / `.ubulk` 的哪个字节区间。替换只覆写这些区间，无法改写头部——所以输出必然沿用主 pak 资产的格式，而这正是目标平台需要的。

| 输出模式 | 内容 | 体积 |
|---|---|---|
| `ReplacedOnly`（默认） | 仅本次运行改动的资产 | ≈ 变更量 |
| `FullRepack` | 主 pak 全部文件 + 被替换的贴图 | ≈ 主 pak |
| `MergeAll` | 替换结果 + 源包独有文件 + 主 pak 其余文件 | ≈ 主 pak |

贴图候选识别优先匹配 `_P.uasset` 命名，但任何带同级 `.uexp` 的 `.uasset` 也会被接受——因此不遵循 `_P` 约定的游戏
（例如 KARDS 的 `t_xxx.uasset`）同样能正确转换。

实测性能：7 GB / 35 586 文件的主 pak 读取索引约 0.3 s，默认模式数秒内完成；重编码路径每张贴图约 0.3–1 s。

## 目录结构

```
Prism/
├── Prism/                     # Android WebView 版（早期，源自上游）
├── Prism.PC/                  # 本地 Web UI 构建
├── Prism.Desktop/             # 共用 Avalonia UI + 逻辑（库，net10.0）
├── Prism.Desktop.Desktop/     # Windows 外壳（单文件发布）
├── Prism.Desktop.Android/     # Android 外壳（APK，arm64-v8a）
├── PakTool.Core/              # pak 会话 / 预览 / 导出 / 合并 / 映射 / locres
├── UAssetTexture.Core/        # 贴图替换引擎 + pak 转换
├── UAssetCLI/                 # 贴图替换命令行工具
├── test/Prism.FeatureTests/   # 集成测试（控制台程序）
└── UAssetAPI-master/          # vendored UAssetAPI（含本地 patch）
```

## 构建与验证

```sh
# Windows 桌面（Debug）——同时会把 UAssetCLI 和 tools/ 拷到输出目录
dotnet build Prism.Desktop.Desktop/Prism.Desktop.Desktop.csproj

# Android release APK（需要 JDK + Android SDK）
dotnet build Prism.Desktop.Android/Prism.Desktop.Android.csproj \
  -c Release -p:JavaSdkDirectory=<JDK 路径>

# 集成测试（114 条断言）：映射格式识别、搜索框路径解析、pak 转换两条路径、
# 合并优先级、locres 与 JSON 往返、非 ASCII pak 路径、无头 UI 加载与导航
dotnet run --project test/Prism.FeatureTests
```

预编译包随 [Releases](https://github.com/CCB-TEAM/Prism/releases) 发布。Windows zip 自包含（无需 .NET 运行时），
但**必须把 `UAssetCLI/` 与 `tools/` 放在可执行文件旁边**——贴图替换与转换依赖它们。

### 构建注意事项

- `PakTool.Core` 依赖 `external/CUE4Parse/`，该目录不在仓库中且 `.gitmodules` 也无法拉取（开发快照含本地改动、且未固定 commit），需自行放置匹配的源码树或克隆上游后 checkout。
- Android 构建需要 `third_party/lib/arm64-v8a/` 下的 `liboodle-data-shared.so`、`libprism_codecs.so`、`librepak_bind.so`、`libc++_shared.so`；**Prism 不分发 Oodle**，自行放置需遵守 Unreal Engine EULA 与 RAD/Epic 授权条款。
- 桌面端贴图替换还需要 `tools/texconv.exe` 与 `tools/astcenc-*.exe`。
- 不要并行构建 Windows 与 Android 的 Release 配置，两者共享输出目录会互相锁文件。
- Android 构建前需生成 `UAssetAPI-master/UAssetAPI/git_commit.txt`，否则报 `CS1566`。

## 适用范围

仅支持 `.pak` 归档；`.utoc` / `.ucas` 容器未实现。映射文件不随包分发，需从游戏中导入匹配的那一份。
当缺少映射文件时，受影响的贴图会以**明确原因标记为 skipped**，工具不会静默产出损坏资产。
