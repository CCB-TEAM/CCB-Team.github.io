---
title: polaris
---

# polaris

[polaris](https://github.com/CCB-TEAM/polaris) 是面向 KARDS / UE 5.6 的蓝图编译工具，结合 UHT 风格 C# SDK 生成与 Kismet 字节码编译。

## 功能

- 从 jmap 数据生成 C# SDK，用 Roslyn 处理受支持的 C# 语法。
- 将生成的字节码写回现有蓝图资产，并支持修改部分类默认值。
- 提供命令行、示例与 mod pak 导出流程。

## 架构

三层，字节码层自研，UAssetAPI 只承担资产与表达式的序列化：

| 层 | 组成 | 输入 → 输出 |
|---|---|---|
| SDK 生成 | `JmapFileReader` → `SdkEmitter` | 纯 jmap → UHT 风格 C# SDK |
| 编译 | Roslyn → `Translator` → `BytecodeBuilder` → `BytecodeCheck` | 用户 C# mod → Kismet 表达式 |
| 资产与打包 | `AssetImportTable` · `FunctionWriter` · `CardAsset` · `ModPak` | 表达式 → `.uasset` / `.uexp` → `mod.pak` |

```text
jmap（纯）──► JmapFileReader ──► SdkEmitter ──► UHT 风格 SDK
                                                   ├─ CLI `polaris sdk`
                                                   └─ SdkSourceGenerator（编译期）

用户 C# mod ──► Roslyn ──► Translator ──► BytecodeBuilder ──► BytecodeCheck
                                              ├─ AssetImportTable（类/函数 → FPackageIndex）
                                              ├─ FunctionWriter（替换 ScriptBytecode）
                                              ├─ CardAsset.Save（.uasset / .uexp）
                                              └─ ModPak（mod.pak）
```

SDK 有两个出口：CLI `polaris sdk` 写到磁盘，或由 `Polaris.SourceGen` 作为 Roslyn 增量源生成器在编译期从 AdditionalFiles 生成。生成代码引用的运行时声明（`UObject` / `UStruct` / `TArray` / `[UClass]`）放在 `Polaris.Sdk`，与具体资产无关，因此 SDK 可以单独编译、也可预编译后供 `polaris apply` 的 `--sdk` 使用。

工程依赖：.NET 10、Roslyn、UAssetAPI，以及 vendored 的 v3 pak 读写（from solstice-pak，MIT）。

## 实现细节

- **不设中间模型。** 编译器直接从 C# 语法树发射 `KismetExpression`，没有 `KArg` / `KNode` 一类节点树；指令、跳转偏移、导入表与写回全部在本仓库实现，UAssetAPI 只做资产结构与表达式的序列化。
- **每次写盘都自校验。** 顺序是「序列化 → 读回 → 检查跳转落点」，同时要求其余函数字节的 SHA-256 不变；校验不通过即写回失败，不靠事后补测。
- **导入表按资产解析。** `AssetImportTable` 把类名/函数名映射为该资产自己的 `FPackageIndex`，不以全局元数据代替当前资产的 Import/Export 表。
- **参数契约先于写回。** `polaris apply` 从注解取目标资产与函数，参数名、返回值与 `out` 参数必须与 `UFunction` 一致，不匹配直接报错，不做隐式补齐。
- **CDO 改值分三种结果。** 改既有值、补差量条目（原生父类本来没有的成员，如 `hasBlitz`）、Reset，写入的是同一份默认值对象；改完后仍要求函数字节一致。
- **pak 走 v3 格式**，store 存储，mount 点为 `../../../kards/Content/`，并按真实 mod pak 逐字节验证；多资产时每张卡一个 pak，输出目录写 `mod.json` 清单。
- **反编译 → 回编译是回归闸门。** 全量 Cards 语料 6492/6492 函数回编译后字节一致，用来保证「能结构化读出的也能原样写回」。
- **子集边界写在代码里。** 已支持 `if` / `while` / `for`、`out` / `ref`、算术/比较/位运算/字符串/逻辑表达式与局部变量声明；struct 常量与 ubergraph 事件体未做，整段替换存根会让原 ubergraph 逻辑不再执行。

## 使用与边界

项目针对特定游戏和 UE 版本，编译器只支持 C# 的子集，并非通用蓝图编辑器。仓库 README 对运行期验证状态存在不同表述，应结合其 [验证记录](https://github.com/CCB-TEAM/polaris/tree/main/docs/verification) 和实际目标版本判断；序列化检查本身不能证明游戏内行为正确。构建与使用步骤见 [项目 README](https://github.com/CCB-TEAM/polaris#readme)。

相关：[solstice-cskismet](/projects/solstice-cskismet) · [项目总览](/projects/)
