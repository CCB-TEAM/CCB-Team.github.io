---
title: 附录 E · 复现指南与待验证清单
---

# 附录 E · 复现指南与待验证清单

本系列反复强调"结论尽量给出出处"。这一页是那份承诺的兑现方式：**教你把这套结论自己重做一遍**，并把**目前还没验证清楚的问题**列出来。

如果你在本页发现哪一条已经被验证或推翻，欢迎到 [CCB-Team.github.io](https://github.com/CCB-TEAM/CCB-Team.github.io) 开 Issue 或 PR——纠错比补充新内容更有价值。

## 一、四条取证路径

任何一条协议结论，最终都来自下面四条路径之一。看清"这条结论是靠什么得出的"，就知道它的可信度边界在哪。

| 路径 | 工具 | 能确定什么 | 局限 |
|---|---|---|---|
| **抓包** | mitmproxy / Fiddler / 自建代理 | 线上真实的字段名、大小写、顺序、类型 | 看不到"客户端为什么这么判" |
| **UHT 转储** | UE4SS 的转储功能 | 客户端的**结构体与枚举定义**（字段类型的权威来源） | 只有类型，没有行为；且不含 `server_options` 这类"字符串里的 JSON"键 |
| **蓝图反编译** | [KismetDecompiler](/projects/kismetdecompiler) | 客户端**行为**：判定条件、配置键、默认值 | 字面量可能丢失；有渲染上限（见第四节） |
| **参考实现对照** | [fyserver](/projects/fyserver)（C#）· [kards-server-go](/projects/kards-server-go)（Go） | 可运行验证：这套字段客户端真的能过 | 实现本身可能有历史包袱 |

三者的关系是：**UHT 给类型，反编译给行为，抓包给事实，实现给交叉验证**。四者不一致时，以能实际跑通客户端的为准，并把差异记下来（本页第三节就是这么来的）。

## 二、复现步骤

### 1) 抓包

```bash
# 方式一：把客户端指到本地（改 IPRedirection 的两个字符串槽，见第 10 章）
#   两个槽必须【等长替换】，否则二进制会损坏
#   主槽  "https://kards.live.1939api.com/"
#   次槽  "https://kards.live.1939api.com/config"

# 方式二：不解包，直接在本机起最小服务端，用 hosts 或代理把域名指过来
mitmproxy -p 8080        # 或 mitmweb
```

抓包时优先看这四处，它们是最容易踩坑的地方：

| 观察点 | 为什么重要 |
|---|---|
| `Authorization: JWT <token>` | 前缀是 `JWT `，不是 `Bearer `；两个都兼容的写法更稳 |
| `Content-Type` 是否带 `charset` | 客户端对 `application/json; charset=utf-8` 不友好（第 2 章） |
| 字段名的大小写 | 线上是 `status`，UHT 里是 `Status`，说明匹配是宽容的 |
| 未匹配时的响应体 | 是字符串 `null` 而不是 JSON `null`——这一条最容易在抓包里看出来 |

### 2) UHT 转储

转储产物按模块分目录，本系列的引用都来自这两处：

```
<游戏>\KARDS\Binaries\Win64\ue4ss\UHTHeaderDump\
├── kards\Public\          ← 协议层：会话、端点、对局、卡牌
└── KardsCore\Public\      ← 基础枚举：阵营、稀有度、卡集
```

它是纯头文件，所以**用 grep 而不是通读**：

```bash
rg -n 'struct FMatch2' -A 30 kards/Public/Match2.h
rg -n 'enum class EFactionEnum' -A 14 KardsCore/Public/EFactionEnum.h
```

### 3) 蓝图反编译

先把蓝图资产导出成可读格式，再交给反编译器批量处理：

```bash
KismetDecompiler --input  <蓝图导出目录> \
                 --usmap  <m.usmap> \
                 --uhtdump <UHTHeaderDump> \
                 --inline --opt \
                 --out    Decompiled/kards
# --inline 把 dispatch 体内联回事件函数；--opt 做临时量值流内联
# --uhtdump 会额外输出每个函数的原生签名注释，读伪代码时非常有用
```

产物是"每资产一个 .cpp"，函数按 `// Function: <名字>` 分段。**读法请先看[附录 B 第 0 节](/private-server/appendix/decompile-notes)**，那里列了 Kismet 伪代码的常见形态（`return` 之后仍有代码、`NotEqual_ByteByte` 链等价于 switch、`out` 参数等）——不了解这些形态会误判产物是坏的。

### 4) 最小验证闭环

任何一条新结论都套用这个循环，它是本系列最常用、也最省时间的方法：

```
改一个字段 / 换一个常量
        │
        ▼
跑客户端 → 走到那个界面
        │
        ├─ 正常：记下响应，作为"已知良好样本"
        └─ 报错：二分删字段，直到能过
```

在线状态与断线判负这类"时序相关"的问题，用 [安全 QA 的镜像与回放工具](/security/tooling) 做离线复现比反复开客户端快得多。

## 三、待验证清单

下面这些点，本系列**已经明确标注为推断或未定**。它们不是"待办"，而是诚实的边界——把边界写出来，比假装全都清楚更有用。

| # | 问题 | 目前掌握 | 一分钟验证法 |
|---|---|---|---|
| 1 | `endpoints` 的值必须是绝对地址吗？ | 推断是（三个实现都下发绝对地址，且蓝图产物中 `backend_endpoints` 零命中） | 把某个 endpoint 改成相对路径，看客户端请求落到哪个 host |
| 2 | `root_url` 拆 `.` 取的是第几段？ | 反编译产物里该下标渲染为 `<ArrayIndex>`，未解析；行为上 `kards.dev.*` → dev、`kards.live.*` → live | 用 `http://a.dev.b.c:5231` 与 `http://a.b.dev.c:5231` 两种域名各试一次，看版本闸门行为 |
| 3 | `FLibraryCard` 的字段名到底是 `id` 还是 `deck_id`？ | UHT 里是 `deck_id`，实现里发 `id`，两者都能进游戏 | 抓一次 `/players/{id}/library`，或把字段改成 `deck_id` 看收藏界面是否仍正常 |
| 4 | `action_data` 的确切形状 | UHT 说是 `TArray<FActionValue2>`（每项 `Name`/`Value`/`Text`），实现却发键值对象 | 用一个动作分别按两种形状提交，看客户端是否都认 |
| 5 | 客户端是否校验 JWT 签名？ | 推断不校验（实现都是手工拼 payload，`exp` 甚至填的是用户 ID） | 用一个签名错误的 token 请求受保护接口，看是否 401 之外还报别的错 |
| 6 | `versions` 前缀匹配的左边到底取哪一项？ | 已知 `StartsWith(客户端版本, 服务端串)`，但客户端版本是 `GetProjectVersion()` 的哪个形态未确认 | 把 `versions` 设为 `["Kards"]`（极短前缀）与 `["Kards 9.99"]`，观察准入结果 |
| 7 | 三种时间格式是否各字段专用？ | 已知至少三种格式并存（`server_time` 点分、卡组 ISO 6 位小数、items 空格分隔），但是否可互换未验证 | 把 `server_time` 换成 ISO 格式，看客户端是否还能解析 |
| 8 | `xserver_closed` 非空时的具体表现 | 已知非空即触发关服提示，`xserver_closed_header` 是文案 | 填一个非空值跑一次，记录弹窗样式与是否仍可进游戏 |
| 9 | 登录 `provider: "device"` 是否等价 `CT_Device`？ | 推断是（枚举第一项），但未见服务端按此分支 | 换一个 provider 值，看客户端是否要求额外的凭据字段 |
| 10 | `EKardsProvider` 与登录 `provider` 的关系 | 确认**不是**同一个东西：前者是支付渠道（Xsolla/Steam/…） | 抓 `provider_details.payment_provider` 的取值范围 |

::: tip 为什么要专门列一张"不知道"的表
协议逆向里最危险的不是"没搞懂"，而是**把推测当事实写进代码**——这类错误会在很久之后以一个毫不相关的形式暴露出来。把不确定项集中列出，至少保证：读者知道哪里要自己验，以及怎么验。
:::

## 四、已知工具局限

同样的道理，工具的能力边界也写清楚：

| 局限 | 表现 | 绕过办法 |
|---|---|---|
| 部分蓝图无法反编译 | 少数资产是**裸导出数组**、缺 `NameMap`/`Imports`，反编译器直接跳过（本次统计有 6 个，如 `card_event_royal_research`、`card_unit_hampshire_regiment`） | 换用其它 UAsset 工具重新导出，或从 `.uexp` 手工解析 |
| 巨型资产产物过大 | `BP_BaseCard` 的反编译产物达百 MB 级，整体阅读不现实 | 先 `rg -n '// Function:'` 定位函数，再按行号读那一段 |
| 文本字面量丢失 | 渲染为 `UAssetAPI.Kismet.Bytecode.FScriptText`（典型是 `Format` 的模板串） | 结合上下文推断，或看调用处的参数个数 |
| 数组下标/通配未解析 | 渲染为 `<ArrayVariable>` / `<ArrayIndex>` / `<Target>` | 需要时回看原始字节码 |
| 工具链对 UAssetAPI 版本敏感 | 游戏更新后资产版本变化可能导致解析失败 | 固定工具与游戏版本，并记录版本号 |

## 五、参与与纠错

- 发现本文有误：直接开 Issue，附上**抓包片段或复现步骤**，比只给结论有用得多。
- 补齐上面任一待验证项：同样欢迎，尤其是第 1、4、5 条——它们影响实现选择。
- 本站内容的写作原则见[团队介绍](/about/)；协议相关结论的实测/推断界线，在各篇末尾都有交代。
