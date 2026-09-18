---
title: 安全 QA 概览
---

# 安全 QA 概览

对 Kards 后台（staging / dev）做的一轮功能 QA + 安全测试。本目录记录**结论、方法、可复现步骤**，配套的完整产物在私有仓库
[CCB-TEAM/kards-admin-qa](https://github.com/CCB-TEAM/kards-admin-qa)。

## 一句话结论

| 类别 | 结果 |
|---|---|
| **任意文件上传** | ⚠️ **成立**：后台 `POST /assets/` 服务端零类型校验，任意文件（HTML/JS/SVG/TXT/伪装扩展名）都会落进 S3，并经 CloudFront **匿名可读** |
| **目录穿越** | ✅ 未成立：`/assets/browse.json?d=` 的 20+ 种 `..`/编码/反斜杠 payload 均未逃出 `store/` 前缀 |
| **功能缺陷** | 28 条可复现：6 个入口参数非法即 500、2 个菜单死链、3 个 Admin 菜单项 403、维护模式默认时间过期 15 个月等 |
| **低危问题** | 3 条：分页 token 畸形值触发 500、接口泄露 S3 桶与 CDN 域名、删除接口不校验存在性 |

## 测试范围

| 项 | 值 |
|---|---|
| 目标 | `admin.staging.1939api.com`、`admin.dev.1939api.com` |
| 授权 | 站点所有者授权测试；测试数据均由本人创建并**在测试后清理** |
| 覆盖 | 33 个后台工具页与二级入口、Asset Browser 上传/删除、S3 对象存储、CDN 分发、参数化路由 |
| 未覆盖 | 第二个账号的越权交叉验证、桶内其他顶层前缀枚举、生产环境 |

## 环境与账号

| 环境 | 地址 | 账号 | 口令 |
|---|---|---|---|
| dev | `admin.dev.1939api.com` | `vekolyram` | `vekolyram` |
| staging | `admin.staging.1939api.com` | `mykola` | 见团队密码库 |

::: warning 内部测试环境专用
以上是**内部测试环境**账号，仅用于团队内部测试与复现。请勿用于生产系统、勿外发。生产后台请勿复用同类弱口令。
:::

## 目录

- [测试方法](/security/methodology) —— 怎么测的、怎么复现、踩过哪些坑
- [上传与目录穿越](/security/upload-and-traversal) —— 安全测试详细结论
- [功能缺陷清单](/security/functional-defects) —— 28 条功能缺陷的要点与修复建议
- [镜像与回放工具](/security/tooling) —— 离线复现整套后台的工具链
