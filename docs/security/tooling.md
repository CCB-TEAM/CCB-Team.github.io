---
title: 镜像与回放工具
---

# 工具链：站点镜像 + 本地回放（含写侧）

完整代码与脚本在私有仓库 **CCB-TEAM/kards-admin-qa**。这一节说明它是什么、怎么用、能离线复现到什么程度。

## 是什么

| 组件 | 说明 |
|---|---|
| `mirror/` | 站点镜像：33 个工具页与二级入口、静态 JS/CSS、20+ JSON 数据端点、参数化路由快照（172 文件 / 9.5 MB），外加 `MANIFEST.json`（802 条请求的状态码 / 类型 / sha256 / 落地文件 / 302 目标） |
| `mirrorsrv/` | Go 写的本地回放服务：把镜像当站点跑（只读回放 + 4 个工具的写侧 mock） |
| `_tools/` | Node 脚本：登录、整站抓取、参数补齐、缺陷重放、上传/穿越验证、桶枚举、去敏导出 |
| `responses/` | 测试证据：页面快照、探针响应、结构清单、重放输出、桶清单 |

## 本地回放服务

```powershell
cd mirrorsrv
go build -o mirrorsrv.exe .
.\mirrorsrv.exe --root ..\mirror --addr 127.0.0.1:8099
# 入口      http://127.0.0.1:8099/dashboard/
# 清单页    http://127.0.0.1:8099/__index
# 写侧状态  http://127.0.0.1:8099/__mock/state
```

**路由规则（按优先级）**

1. 精确「路径?查询」命中 → 回放该快照（`/metrics/custom?report=packsall` 这类带参数页面映射到 `custom.html__a433ab1b`）
2. 精确命中但只有错误记录 → 按原状态码返回（`?report=sales` 就是 404，不会回落成 200 空壳）
3. 路径命中、参数未镜像 → 回放无参数快照并加 `X-Mirror-Note` 说明
4. 清单里记录过跳转 → 按记录真实 302/308
5. 都没有 → 合成 404 页 + 邻近路径提示

响应头带 `X-Mirror-Origin-Status / Origin-URL / SHA256 / Snapshot / File`，脚本可直接断言。调试参数：`?__raw=1`（原样字节）、`?__delay=N`（人为慢速）。

## 写侧 mock（页面代码零改动）

做法统一：**复用镜像里那份真实渲染的页面**，只在服务端改 `action` 并注入一段按字段名回填的脚本。因此界面长相、字段顺序、预览行为与线上一致。

| 工具 | 编辑器 | 保存 | 删除 |
|---|---|---|---|
| frontpage | `/frontpage/edit/<id>`（0 = 新建） | 同路径；优先用页面算好的 `as_json`，缺失则按扁平字段名重建 | `POST /frontpage/delete` |
| skirmish | `/skirmish/<id>/editskirmish` | 同路径，body `{"data":{…}}` → 响应 `{"url":…}` | 整页表单带 `name=delete` |
| knockouts | `/knockouts/<id>/editknockout` | 同上 | 同上 |
| targeting | `/targeting/<id>` | `POST /targeting/new` 或 `/targeting/<id>/save` | `POST /targeting/<id>/delete` |

状态只写 `mirror/_mock_<工具>_state.json`，**镜像快照文件永不改动**；`/__mock/reset` 一键回到出厂快照。

### 已知限制

- 规则控件的**渲染**沿用镜像页面里已有的那份；mock 只把新保存的值回填到与 `saveForm()` 读取一致的字段名上。所以"新建一条带完整规则的条目后再打开"，规则控件可能是模板默认值，而列表/状态页/导出的 JSON 是已保存的真实数据。
- targeting 的规则行增删是纯前端交互（`targeting_editor.js`），保存时整包提交，mock 原样落库但不渲染成编辑器内的规则行。

## 部署包

`qa-1939api-mirror.zip`（约 6.3 MB）：`mirrorsrv.exe` + Go 源码 + `mirror/` + `start.ps1` + `smoke.ps1`（19 项自检）+ 说明文档。
解压后 `powershell -ExecutionPolicy Bypass -File .\start.ps1`，另开窗口跑 `smoke.ps1` 核对（已解压实测 19/19 通过）。

## 附：本机环境的一个坑（Schannel）

在**受限沙箱进程**里，所有走 Windows Schannel 的 TLS 客户端都会失败：

```text
curl: (35) schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)
.NET SslStream / Invoke-WebRequest: "安全包中没有可用的凭证"
git（http.sslBackend=schannel）: 同样失败
```

根因是 **Schannel 创建 TLS 客户端凭据需要把密钥材料落盘**（`%APPDATA%\Microsoft\Crypto\Keys` + `HKCU\...\Cryptography\RSA`），而沙箱拒绝这类写入：

```text
持久化 CNG 密钥               → 拒绝访问
直接写密钥目录                → Access to the path … is denied（同目录读取正常）
旧 CSP 密钥容器               → 拒绝访问
New-SelfSignedCertificate     → NX509Enrollment NTE_PERM (0x80090010)

对照（不落盘的操作全部成功）：临时 CNG 密钥、读证书存储、Node.js 的 HTTPS
```

因此：

- **Net 结论**：远端 TLS 正常（Amazon 证书链完整，Node 严格校验 `authorized=true`）；这不是站点问题，也不是机器故障——**在不受限的环境里（普通 cmd/Edge/git）TLS 一切正常**。
- **在沙箱内可用的 TLS 客户端只有 Node.js**（自带 OpenSSL/BoringSSL，纯内存，不写系统密钥容器）。本次抓取、验证、GitHub 提交全部通过 Node 完成。
- 若要在受限环境里用 git/curl，需要放行上述密钥存储路径，或改用 OpenSSL 后端的客户端。
