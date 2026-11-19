---
title: solstice-pak
---

# solstice-pak

[solstice-pak](https://github.com/CCB-TEAM/solstice-pak) 是一个最小的 Unreal Engine `.pak` 读写库，针对 version 3 格式变体，使用 .NET 基础类库，可在 Blazor WASM 中运行。

## 功能与边界

- 构建和读取未压缩的 pak，并校验索引与条目的 SHA-1。
- 仓库提供使用合成数据的自检；README 也记录了一份真实 pak 的逐字节重建结果。
- 不支持压缩、加密索引、签名或 IoStore；其他 pak 版本未验证。

格式、示例和验证方法见 [项目 README](https://github.com/CCB-TEAM/solstice-pak#readme)。

相关：[Prism](/projects/prism) · [项目总览](/projects/)
