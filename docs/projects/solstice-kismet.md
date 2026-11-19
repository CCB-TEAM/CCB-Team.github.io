---
title: solstice-kismet
---

# solstice-kismet

[solstice-kismet](https://github.com/CCB-TEAM/solstice-kismet) 将平铺节点模型编译为 UE 蓝图函数的 Kismet 字节码，并通过 UAssetAPI 写回资产。

## 功能与边界

- 提供节点到字节码的生成、布局和校验，以及对已有字节码的结构还原。
- 对不认识的表达式可保留原始节点；结构还原不保证与原始源码逐节点语义等价。
- 仅覆盖部分指令，README 标明只验证过 UE 5.6；新增变量及名称表处理需要特别注意。

支持范围、示例和自检方式见 [项目 README](https://github.com/CCB-TEAM/solstice-kismet#readme)。

相关：[solstice-cskismet](/projects/solstice-cskismet) · [KismetDecompiler](/projects/kismetdecompiler)
