---
title: KardsSim —— 把 KARDS 蓝图直译成 C# 的本地对局模拟器
---

# KardsSim

把 KARDS 客户端的**蓝图字节码逐条翻译成 C#**，得到一套不依赖游戏本体、可复现、
可以拿去训练 AI 的本地对局模拟器。

关键取舍：**不做文本解析，也不读反编译出来的伪代码**。
效果来源是游戏自己编译出来的 Kismet AST —— 每张卡的行为就是它自己那份字节码，
没有"读卡面文字猜效果"的猜测成分。

| 项 | 值 |
|---|---|
| 语言 / 运行时 | C# · .NET 10 |
| 依赖 | UAssetAPI 1.1.0（Kismet AST）+ KismetDecompiler（控制流边界修正） |
| 直译产物 | 1671 个资产 · 6434 个函数 · 45.6 万行 · 21 MB |
| 宿主原语 | 172 个条目（见 [06 · 推荐 hook 点](/kismet-sim/06-hooks)） |
| 仓库 | <https://github.com/CCB-TEAM/kards-sim> |

## 为什么可以直译

普通反编译要费大力气重建控制流图（CFG），是因为汇编里只有 `jmp` 和地址。
但 Kismet 字节码**自带结构化跳转**：`EX_Jump` / `EX_JumpIfNot` / `EX_ComputedJump`
都是带偏移的表达式节点。所以

```
Kismet:   if (!cond) goto 0x1234;   body;   0x1234: next;
C#:       if (!cond) goto L_1234;   body;   L_1234: next;
```

是**逐条 1:1 的映射，不需要重建 CFG**。
`EX_PushExecutionFlow` / `EX_PopExecutionFlow` 用一个真的 `Stack<int>` + `switch` 承载，
连"跳转段栈"这种最麻烦的结构都不用猜。

这样做出来的产物不好读（全是 `L_0A23:` 和 `goto`），但**它不需要好读** ——
它是给机器执行的。

## 架构

| 层 | 职责 |
|---|---|
| `KismetDecompiler` | 修正反编译器的控制流边界（`EX_ComputedJump` 作为块切分点与 halting 边） |
| `KardsTranspiler` | Kismet AST → C#，一个函数一个静态方法，一条语句一个 label |
| `Generated/` | 1671 个资产的直译产物（已入库，克隆即可编译，**不需要游戏资产**） |
| `Kismet/` | 运行时：`IHost` 接口 + 值模型 + 通用库函数（Array/Map/String/Math） |
| `Bridge/` | **hook 缝**：把直译产物接到对局引擎（分派顺序与推荐切点见 [06](/kismet-sim/06-hooks)） |
| `Engine/` | 对局规则、动作合法性、回合流程、触发点时机 |
| `Server/` | HTTP 接口，给不同 AI 后端用 |

把直译产物接进引擎的这一层（`Bridge/`）是全部工作量所在 ——
也就是"还原到什么程度就够了，剩下的可以直接 hook"的那条缝。
缝具体切在哪、有哪些**推荐 hook 点**、哪些地方**明确不要 hook**，
单独写了一章：[06 · 宿主该切在哪一层](/kismet-sim/06-hooks)。

## 怎么跑

```bash
# 自对弈，打印宿主 API 覆盖率 + 触发点完整性检查
dotnet run --project KardsSim -c Release -- --mode selfplay --games 500

# 用社区推荐卡组自对弈（预设名 / 卡组码 / 卡牌 id 列表都认；--swap-sides 每局交换左右）
dotnet run --project KardsSim -c Release -- --mode selfplay --games 200 \
    --left-deck jp-pol-boom --right-deck ger-usa --swap-sides

# 机制单测（带断言，能失败）
dotnet run --project KardsSim -c Release -- --mode tests

# 卡组码审计：22 套推荐卡组，哪些这套模拟器能打完整
dotnet run --project KardsSim -c Release -- --mode decks

# HTTP 接口，默认 http://127.0.0.1:8642/
dotnet run --project KardsSim -c Release -- --mode serve
```

## 九个审计模式

跑多少局自对弈都不能证明"完备"—— 随机对局抽不到那些卡，等于没测。
所以除了对局，另做了九个专门查完备性的模式：

| 模式 | 查什么 |
|---|---|
| `apicheck` | 静态全扫所有 `H.Call` 目标，判断有没有地方接；区分「卡牌逻辑可达」与「仅 UI 可达」 |
| `smoke` | 逐卡强制触发它注册的**每一个**触发点，绕开随机采样 |
| `triggerhits` | 运行期实测每个触发点命中次数 |
| `triggers` | 对照「卡牌注册 / 引擎发出 / 游戏侧分派器」三张表 |
| `rules` | 客户端规则库（`cardsCheckFunctions`）的否决理由 vs 引擎侧现状 |
| `paramaudit` | 引擎原语实现 vs UHT 签名：找「是 void 带 out、实现却 return」 |
| `byref` | 扫直译产物里「out 槽零初始化、函数体却先读」的函数（详见 [07](/kismet-sim/07-emitter)） |
| `repro1` | 端到端复现：击杀 → 变老兵 → 打 HQ 3 点 |
| `decks` | 卡组码解析与覆盖度：22 套推荐卡组逐条对账 |
| `tests` | 机制断言（能失败的，不是"跑通没炸"） |

这些会给出**互相矛盾**的结论，而矛盾本身才是有用的 ——
详见专题 [审计方法论](/kismet-sim/04-audit)。

## 当前状态

| 指标 | 值 |
|---|---|
| 直译覆盖 | 1671 个资产 / 6434 个函数，**0 空体** |
| 编译 | 45.6 万行 **0 错误** |
| 自对弈 | 0 异常 / 0 卡死 / 0 非法动作 / **0% 未实现调用** |
| 全卡强制演练 1638 张 | 0 异常 / 0 未实现调用 |
| 触发点覆盖 | **61 / 61** |
| 宿主 API | 卡牌逻辑可达的缺口 **0 个** |
| 机制断言 | **153 / 153** |
| 卡组码 | 22 套社区推荐卡组全部能解析，**6 套能完整还原 39 张**（其余缺 1~4 张，是本仓库卡牌导出不全） |

## 已知未完成

- 卡牌导出不全：`_input/Cards` 比线上客户端少约 600 个资产（`_bal` 平衡版尤其缺），
  于是部分推荐卡组只能还原 35/39 张。补齐导出后重跑转译即可，解析器本身已经就绪。
- 没有 UI 就无法复现的选择点：部分卡的 Develop 结果在客户端是**UI 直接做的**，
  它们没有自己的 `OnHandTargetSelected`。选择能被发起和结算，但效果不落地。
- 已知怪相（与客户端同源）：一批牌一起撤退时，先搬走的那张不再场上，
  后搬的光环卡按"我左边有谁"找不到它，+2 会留在已经回手牌的那张牌上。
  要修得让"撤销某个来源的加成"按来源查全场。
- 接官服（[自己写私服](/private-server/) 里的协议逆向）需要一个真实玩家的
  对局抓包才能对齐"客户端权威"的边界。

## 相关

- [KismetDecompiler](/projects/kismetdecompiler) —— 本项目的上游：修正了
  `EX_ComputedJump` 作为块切分点的控制流边界（补丁后效果调用点 +32%）
- [KismetReactor](/projects/kismetreactor) —— 同一份字节码的图形化查看/编辑工具
- [自己写私服](/private-server/) —— 对局协议逆向，接官服时的参考
- 专题：[设计与心得](/kismet-sim/) · [推荐 hook 点](/kismet-sim/06-hooks) ·
  [发射器实现特性](/kismet-sim/07-emitter) · [坑与复盘](/kismet-sim/05-pitfalls)
