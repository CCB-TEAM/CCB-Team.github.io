---
title: 测试方法
---

# 测试方法（怎么测的 / 怎么复现）

## 1. 通道与前置

后台是 Flask + Jinja 的 SSR 应用，页面内的写操作由 `static/js/csrf.js` 的 `csrfFetch()` 统一发起。复现任何写操作都要走同一套流程：

```text
① GET /admin/login          → 取表单隐藏字段 csrf_token 与 Set-Cookie: session=…
② POST /admin/login         → 同一 cookie jar，csrf_token 放表单字段 → 302 /dashboard/
③ 之后每个写请求前重新 GET 目标页面，取 <meta name="csrf-token">，以 X-CSRFToken 头发送
```

::: tip 三个必须知道的点
1. **写请求成功后 session 会轮换**，旧 token 立即失效 —— 批量操作必须"一次请求一次取 token"，否则会出现"第一条成功、后面全 400"。
2. **`/assets/` 页面没有 `csrf_token` 隐藏字段**，只能用 meta 值。
3. 如果拿到 `400 This form has expired or is invalid`，先怀疑**会话是不是未认证的旧 cookie**（Flash 里会有 `Please log in to access this page.`），而不是怀疑站点坏了。
:::

## 2. 测试流程

```text
测绘   已认证遍历所有链接/表单/内联脚本 → 得出路由与接口清单（33 个工具页、802 条请求记录）
建模   从页面 JS 反推每个工具的提交契约（字段名规律、请求体形态、响应期望）
镜像   整站镜像 + 参数矩阵（分页/筛选/视图切换）→ 可离线复现
测试   边界（非法参数/空值/超长）、越权、注入、遍历、CSRF、并发
验证   逐条写"重放脚本"：一条命令复跑全部结论，输出 BUG/OK 表
清理   所有测试数据按命名前缀扫描并删除，双重复核
```

关键做法是**先建模再测**：不猜接口，而是从页面里的 `saveForm()` / `csrfFetch()` / `Dropzone` 配置读出真实契约，所以结论可以直接对着代码核对。

## 3. 复现命令（在私有仓库 ccb-qa 内）

```powershell
# 环境准备
cd mirrorsrv; go build -o mirrorsrv.exe .        # 本地回放服务
cd ..; node _tools/login.mjs                     # 登录并固化会话

# 镜像与回放
node _tools/mirror.mjs                           # 整站镜像（BFS + 参数矩阵）
.\mirrorsrv\mirrorsrv.exe --root mirror --addr 127.0.0.1:8099   # 把镜像当站点跑

# 缺陷重放 / 安全验证
node _tools/replay.mjs                           # 重放 28 条功能缺陷
node _tools/exploit-upload-final.mjs             # 上传类型 + 穿越验证（含自动清理）
node _tools/enumerate-bucket.mjs                 # 枚举 S3 桶内容
```

## 4. 踩过的坑（后来者直接抄）

| 坑 | 现象 | 正确处理 |
|---|---|---|
| 复用未认证的旧 cookie | 所有写请求 400 `form has expired` | 先确认 `GET /admin/login` 返回 302（已登录）还是登录页；必要时重新登录 |
| CSRF token 一次性 | 第一条成功、后续全 400 | 每个写请求前重新取 meta token |
| 上传文件名被服务端小写化 | 按原文件名探测落点，全部"找不到" | 落点探测用小写名；判断存在性走 `browse.json` 或 CDN 的虚拟主机 URL |
| S3 匿名 HEAD 无区分力 | 存在与不存在都返回 403 | 用 `GET /assets/browse.json?d=<prefix>` 判断 |
| 全站限流 | 大批量抓取中途 `429`，`Retry-After ≈ 2044s` | 限流按 **IP** 维度，换会话无效；批量前先跑 `_tools/quick-verify.mjs` 探一次 |
| 镜像里的页面是登录态快照 | 表单提交必然失败（token 过期） | 这是预期行为，镜像只用于浏览与核对 |

## 5. 数据清理

测试期间创建的对象一律使用 `qa` 前缀，收尾脚本 `_tools/cleanup-all-test-objects.mjs` 会：

1. 遍历所有可浏览目录的全部页；
2. 按前缀／模式匹配测试对象（`qaz / qat- / qae- / qan- / qa-assets / qa-sub …`）；
3. 逐个 delete 后，再用 S3 与列表**双重复核**是否清空。

本轮共创建 13 个测试对象，全部删除并复核（S3 对全部测试 key 返回 403，列表中无残留）。
