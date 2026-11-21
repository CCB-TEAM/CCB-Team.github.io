---
title: Solstice
---

# Solstice

Solstice 是围绕 Unreal Engine cooked 资产与单向 Kismet 字节码生成的技术概念仓库，汇集架构记录、实施计划、实验和开发提示。

## 项目方向

项目探索以浏览器为入口的资产检查与指定函数字节码生成流程，并强调资产本地引用、写回验证和明确报告不支持的能力。

## 当前状态

仓库将自身标为**概念与早期工程规划**；文档中的规划不代表所有功能都已实现或验证。实际支持范围与阶段进展请以仓库的路线图和兼容性说明为准。

## 架构

这个仓库的「架构」是文档与实验的分层，不是可运行系统：概念层给出边界与决策，实验层负责证伪。

| 层 | 位置 | 内容 |
|---|---|---|
| 系统边界与决策 | `docs/architecture.md`、`docs/decisions/` | 分层、边界与 ADR |
| 交付计划 | `docs/implementation-roadmap.md` | 分阶段计划与验收标准 |
| 兼容性矩阵 | `docs/compatibility.md` | 逐项标注证据的兼容性表 |
| 生成与校验规则 | `docs/bytecode-generation.md` | 单向生成与写回校验的规则 |
| 可复用片段 | `snippets/` | 各自独立成文的小块代码概念 |
| 实验与未解问题 | `experiments/` | 观察记录与待定结论 |
| 代理提示词 | `prompts/` | 主提示词与可复用的阶段任务模板 |

```text
浏览器（入口）
  ├─► 资产检查：读 cooked 资产，按当前包的 Import/Export 表解析引用
  └─► 单向生成：高层函数描述 → 受支持的 Kismet 结构 → 写入独立输出
         └─► 校验：重新读回输出，比对读回结果与预期结构后才声明成功
```

流程依赖 UAssetAPI 与 AssetRegistry 的读写能力，这两项在 README 的初始状态表里都还是「尚未记录」。

## 实现细节

- **单向生成，不做往返。** 高层函数描述编译成受支持的 Kismet 结构；不承诺既有字节码经反编译再编译能回到原样——这与把「反编译 → 回编译字节一致」当目标的工具是两种取舍。
- **引用是资产本地的。** `FPackageIndex` 只对所属包有效，全局元数据不能替代当前资产自己的 Import/Export 表；跨资产复用索引正是这套设计要防的错误。
- **先写到别处再确认。** 生成结果进独立输出，校验通过后才允许声称成功；失败不覆盖原资产。
- **证据先于实现。** UAssetAPI 的实际 API 形状、目标 UE 版本、序列化行为都要对着真实 fixture 验证过才写进结论。
- **不支持要写出来。** 未支持的表达式与未验证的行为必须显式标注，不用「应该可以」带过。
- **工作规则约束产出**：不提交无再分发权的游戏资产；没跑过的测试不算通过；不虚构 API、表达式布局、字节偏移或兼容性结论；概念提案与已验证实验分开存放；优先小步端到端切片。
- **首个里程碑刻意窄**：钉住 .NET SDK 与依赖版本 → 验证 UAssetAPI 对 AssetRegistry / UAsset 的实际支持 → 载入可合法分发的 fixture → 定位一个目标函数导出并查看其字节码表示 → 生成一个最简单的函数 → 写到新文件、读回并记录结果。

## 资料

- [GitHub 仓库与 README](https://github.com/CCB-TEAM/Solstice)
- [实施路线图](https://github.com/CCB-TEAM/Solstice/blob/main/docs/implementation-roadmap.md)
- [兼容性说明](https://github.com/CCB-TEAM/Solstice/blob/main/docs/compatibility.md)
