---
title: solstice-cskismet
---

# solstice-cskismet

[solstice-cskismet](https://github.com/CCB-TEAM/solstice-cskismet) 为 [solstice-kismet](/projects/solstice-kismet) 提供 C# 源码前端：通过 Roslyn 将受支持的语句和表达式转换为节点模型，再生成蓝图字节码。

## 功能与边界

- 提供追加、替换、签名检查和 SDK 生成等命令。
- 支持一部分调用、赋值、条件、循环与参数形式；未实现的语法会报告错误。
- 结构体和容器字面量等仍有边界；对 ubergraph 追加时还需检查控制流，不能仅凭静态写回判断运行效果。
- 仓库依赖 `solstice-kismet` 子模块，使用前需递归初始化。

命令示例、已支持语法和验证记录见 [项目 README](https://github.com/CCB-TEAM/solstice-cskismet#readme)。

相关：[solstice-jmap](/projects/solstice-jmap) · [polaris](/projects/polaris)
