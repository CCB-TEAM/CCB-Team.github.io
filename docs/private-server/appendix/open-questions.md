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
| `Content-Type` 是否带 `charset` | 官服自己就不统一：`/config` 带 `charset=utf-8`，`/` 与 `/session` 不带 → **客户端能接受 charset**（[附录 F](/private-server/appendix/live-probe) 实测） |
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

::: tip 大部分已在 2026-09-25 用官服实测回答
其中 1、2、3、5、6、7、9 已被[附录 F · 官服实测对照](/private-server/appendix/live-probe)确认（含两处**纠正**：library 的主键是 `card_type` 而非 `id`/`deck_id`；请求 `provider` 是 `device_id` 而 claim 才是 `device`）。仅 4、8、10 仍需对局抓包或走商店链路。
:::

| # | 问题 | 目前掌握 | 一分钟验证法 |
|---|---|---|---|
| 1 | ✅ **已确认：是绝对地址** | 官服 `GET /` 的 `endpoints.*` 与 `/session` 的 `*_url` 全部是含 host 的绝对 URL | 见 [附录 F](/private-server/appendix/live-probe) |
| 2 | ✅ **已确认：取第二段** | 官服 `root` = `https://kards.live.1939api.com`，点分第二段正是 `live` | 见 [附录 F](/private-server/appendix/live-probe) |
| 3 | ✅ **已确认：两者都不是，是 `card_type`** | 官服 library 是**裸数组**，主键是资产名 `card_type`，另有 `count` / `gold_card_count` / `player_id` / `recently_crafted_count`，**没有 `id` 也没有 `deck_id`** | 见 [附录 F](/private-server/appendix/live-probe) |
| 4 | `action_data` 的确切形状 | 官服只读接口不涉及，仍需抓**对局中**的包 | 用一个动作分别按两种形状提交，看客户端是否都认 |
| 5 | **基本确认：不校验签名** | 官服 token 用 **RS256**；私服手搓的 HS256/无签名令牌能用，说明客户端不验签。另：claim 里 `provider` 是 `device`，**请求里才是 `device_id`** | 见 [附录 F](/private-server/appendix/live-probe) |
| 6 | ✅ **已确认：取客户端项目版本** | 官服 `versions = ["Kards 1.60"]`，而登录 DTO 的 `version` 是 `Kards 1.48.24871.launcher`，该组合**登录成功** → 闸门比的不是 DTO 的 `version` 字段 | 见 [附录 F](/private-server/appendix/live-probe) |
| 7 | ✅ **已确认：同一份响应内就混用** | 一份 `/session` 里 `server_time` 点分、`last_logon_date` ISO+6 位、`new_player_login_reward.reset` 空格分隔；且 `GET /` 的 `server_time` 是 ISO——**同名键在两条接口格式不同** | 见 [附录 F](/private-server/appendix/live-probe) |
| 8 | **部分确认：不拦登录** | 探测时官服 `xserver_closed` 非空而 `/session` 仍返回 200 → 维护提示是客户端侧展示逻辑 | 弹窗样式仍需客户端实测 |
| 9 | ✅ **已确认：请求 `device_id`，claim `device`** | `provider: "device"` 会被官服拒为 `Unknown provider`；`/session` 必填字段只有 `provider` + `provider_details` | 见 [附录 F](/private-server/appendix/live-probe) |
| 10 | `EKardsProvider` 与登录 `provider` 的关系 | 确认**不是**同一件事；官服 `provider_details.payment_provider` 实测为 `XSOLLA`，完整取值集合需走商店链路 | 抓 `provider_details.payment_provider` 的取值范围 |

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
