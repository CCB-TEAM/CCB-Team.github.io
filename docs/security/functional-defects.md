---
title: 功能缺陷清单
---

# 功能缺陷清单（28 条可复现）

完整版（含逐条复现命令与字面响应）见私有仓库的 `BUGS.md`，一条命令即可全量重放：

```powershell
node _tools/replay.mjs      # 输出 BUG/OK 表，22 项首轮缺陷逐条复验
```

## 按严重级汇总

| 级别 | 数量 | 代表问题 |
|---|---|---|
| High | 11 | 6 个入口参数非法即 500；3 个 Admin 菜单项恒可见但接口 403；4 个数据端点稳定 500；编辑器入口 GET 用 500 代替 405 |
| Medium | 8 | 2 个菜单死链 404；3 个支持入口 400；维护模式默认时间过期 15 个月；限流会锁死会话 34 分钟 |
| Low | 9 | 全站标题通用、表头重复、页脚泄露构建号、占位时间、CORS 回显任意 Origin、静默重定向、DOM 内死链 |

## High

### 参数非法时抛 500（未处理异常）

| 请求 | 实测 | 期望 |
|---|---|---|
| `GET /players/?page=0` | 500 | 400 或回落第 1 页 |
| `GET /players/?page=abc` | 500 | 400 并提示页码格式 |
| `GET /cards/?card_type=zzz&faction=zzz&…` | 500 | 400 或忽略未知枚举 |
| `GET /matches/?player_id=abc` | 500 | 400 并提示 ID 需为数字 |
| `GET /admin/playerclientlogs?date=not-a-date` | 500 | 400 或忽略非法日期 |
| `GET /metrics/custom?report=packsall&start_date=2026-13-45` | 500 | 400 并提示日期格式 |

响应统一为 53 字节的 `An unexpected error occurred. Please try again later.`
**注意**：同一个 `/players/` 用 `?page=999999`（超出输入框 `maxlength=3`）却返回 200 —— 说明校验是**选择性缺失**，不是统一中间件拦截。

### 4 个数据端点稳定 500（功能阻断级）

```text
GET /shop/cards/autocomplete.json          → 500（带不带 allow_all 都 500）
GET /shop/equipment/autocomplete.json      → 500
GET /targeting/items.json                  → 500
GET /cards/metrics                         → 500
```

前三个是**新建 Offer / 新建 Skirmish 等页面的选择器数据源**，若前端依赖它会直接导致"选卡无结果"。

### 编辑器入口 GET 用 500 代替 405

```text
GET /skirmish/0/editskirmish   → 500（该路由契约是 POST+JSON）
GET /knockouts/0/editknockout  → 500（POST 表单）
GET /ab/edit/-1                → 500
GET /players/redeem/0/edit     → 500
```

同站其他 POST-only 路由契约是正确的（`Allow: POST, OPTIONS`），只有这几个视图漏了方法校验。

### 菜单可见但接口 403

| 菜单项 | 请求 | 实测 |
|---|---|---|
| View Admin Users | `GET /admin/users/` | 403 |
| View Admin Logins | `GET /admin/users/loginlog` | 403 |
| View Admin Action Logs | `GET /admin/users/actionlog` | 403 |

修复方向是**按权限渲染菜单**，而不是放宽接口权限。

## Medium

| 问题 | 细节 |
|---|---|
| 菜单死链 | 「Daily sales / ARPU → `/metrics/custom?report=sales`」与「Active users → `?report=active_users`」均 404；同菜单的 `packsall`、`platform_sales` 正常 |
| 支持入口 400 | 三个 `Customer Support` 入口 `POST /external/{customer-AI,customer-AI-local,support-console-dev}` 全部 400 |
| 维护模式默认时间过期 | `/admin/maintenance` 的「预计结束时间」预填 `2025-06-12T01:00:00`（已过期 15 个月），运维直接提交会以过期区间进入维护 |
| 限流锁死会话 | 约 900 请求 / 15 分钟触发 `429` + `Retry-After: 2044`，**全会话维度**、任意路由都被拒、界面无提示，持续 34 分钟 |
| 筛选参数不生效 | `/frontpage/entries.json?targeted=1` 返回空 rows，而同页 `/frontpage/?targeted` 有数据 |
| KnOCkouts 占位时间 | 新建表单预填 `2000-01-01 00:00:00` |

## Low

- `<title>` 全站通用 `Kards Server Pages`（页内 `<h2>` 其实已有正确名称，可直接复用）
- `/matches/` 表头重复两个 `Type`
- 全站页脚向浏览器暴露服务器时间与构建号（15 个页面）
- CORS 回显任意 `Origin`（未设 `Access-Control-Allow-Credentials`，属加固项）
- `/metrics/retention` 静默 302 到 `/metrics/`
- DOM 内死链：`/export`、`/enable`、`/disable`、`/players/-1`、`/targeting/-1`，以及未插值的模板串 `/$%7Burl%7D`

## 已排查但不构成缺陷（避免误报）

| 观察 | 结论 |
|---|---|
| "TLS 是坏的" | 见 [镜像与回放工具](/security/tooling) 一节的说明：远端 TLS 正常（Amazon 证书链完整，Node 严格校验通过）；本机 curl/PS 的报错是**运行环境**问题，不是站点问题 |
| CSRF | 保护有效：缺 token、错 token、跨站表单提交均 400，未发现绕过 |
| 未认证访问 | 全部管理页与数据端点未认证即 302 → `/admin/login`，无匿名数据泄露 |
| 注入 | 5 组 SQLi/枚举注入探针均未回显注入痕迹；无路径遍历、无开放重定向；反射探针均为转义输出 |
| 500 页 | 自定义 500 页不回显堆栈、无框架指纹 |

## 未覆盖

- **写操作的功能验证**：`massgiveaway`、`broadcast`、`serverclosing`、`maintenance`、`inventory` 类批量操作未触发（未做任何业务数据变更）。
- **权限矩阵**：只有一个账号，无法判断越权；建议补第二个低权限账号。
- **并发/重复提交**、导入导出大文件、其他角色菜单渲染。
