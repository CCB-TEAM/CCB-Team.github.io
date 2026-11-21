---
title: 阅读路径
---

# 阅读路径

本站内容不少，但不需要从头读到尾。按你的目的挑一条，括号里是「读完能做什么」。

## 我想自己搭一个私服（能跑起来，能对局）

1. [自己写私服 · 总览](/private-server/) —— 先看整体形状与前提
2. [01 · 协议是怎么知道的](/private-server/01-discovery) —— 抓包 + 蓝图 + UHT 三路取证
3. [02 · 引导接口与最小服务](/private-server/02-bootstrap) → [03 · 登录与会话](/private-server/03-session)
4. [04 · 消息编解码 codec](/private-server/04-codec) —— 对局消息为什么不是明文
5. [06 · 卡组与卡组码](/private-server/06-decks) · [07 · 大厅、匹配与开局](/private-server/07-matchmaking)
6. [08 · 对局同步与结算](/private-server/08-match-actions) · [09 · WebSocket](/private-server/09-websocket)
7. 代码实现看 [fyserver](/projects/fyserver)（C#）或 [kards-server-go](/projects/kards-server-go)（Go）
8. 写完用 [FyClient](/projects/fyclient) 跑一遍：`login` → `solo` → `duel` → `ws`

> 只想要结论：看[附录 G · 端点矩阵](/private-server/appendix/endpoint-matrix)与[附录 D · 自检脚本](/private-server/appendix/smoke-test)。

## 我想读懂蓝图字节码（能反编译，也能看出哪里被魔改）

1. [UE5 蓝图逆向 · 总览](/ue5-bp/)
2. [01 · 蓝图资产里存了什么](/ue5-bp/01-anatomy) → [02 · Kismet 字节码](/ue5-bp/02-bytecode)
3. [03 · 反编译](/ue5-bp/03-decompile) —— 为什么「逐条翻译」不够，还要 CFG 结构化
4. [05 · 罕见之处](/ue5-bp/05-pitfalls) —— 各家游戏的魔改都在这里
5. 工具用法看 [KismetDecompiler](/projects/kismetdecompiler)
6. 想要字段级细节：[07 · 反射对象字段](/ue5-bp/07-structures) / [08 · 属性系统](/ue5-bp/08-property-system) / [13 · 虚拟机](/ue5-bp/13-vm)

## 我想改资产（换贴图、加/改注册表、改文案）

1. 先确认你要动的是哪一层：[术语表 · 容器与语义](/lab/glossary#资产容器与格式)
2. `.pak` → [Prism](/projects/prism)（贴图替换、合并、跨平台移植）或 [solstice-pak](/projects/solstice-pak)（最小读写）
3. `AssetRegistry.bin` → [UAssetRegistry](/projects/uassetregistry)（读 / 语义级回写）·
   [solstice-bin](/projects/solstice-bin)（字节保真 + 末尾追加）· [AssetRegistryTool](/projects/assetregistrytool)（编辑器里重建）
4. `.locres` → [ULocres](/projects/ulocres)（未改动的部分保证逐字节一致）
5. 改完一定要在目标游戏里实测：[AssetRegistryTool 的注意事项](/projects/assetregistrytool#注意事项)

## 我想把逻辑写回蓝图（改一张卡）

1. 判断你要改的是**数值**还是**逻辑**：数值 = CDO 字段，逻辑 = 字节码
2. 数值：[polaris](/projects/polaris) 的 CDO 编辑（改值 / 补差量条目 / Reset）
3. 逻辑，两条路：
   - 只要改一小段：[solstice-cskismet](/projects/solstice-cskismet)（贴 C# 源码，不支持的语法直接报错）
   - 要完整工具链：[polaris](/projects/polaris)（SDK + 编译器 + 写回 + 出 pak，实机验证过 G1）
4. 底层原理：[solstice-kismet 的「几个必须知道的编码事实」](/projects/solstice-kismet)
5. 想先确认写回来的东西是对的：[KismetDecompiler](/projects/kismetdecompiler) 反编译一遍对比

> 提醒：静态闸全绿 ≠ 运行正确。写回后仍要在游戏里跑一遍。

## 我想给 KARDS 写模组（Lua / C++）

1. [KMod 文档站](https://ccb-team.github.io/kmod-docs/)：先看安装，再看模组格式
2. 平台选择：[Windows 加载器](/projects/kmod-loader-windows)（`dwmapi` 代理，不修改游戏文件）·
   [Android 加载器](/projects/kmod-loader-android)（需要重打包 APK）
3. 想知道底层怎么找到 `ProcessEvent`：[UE5 运行时逆向](/ue5-re/) 的
   [对象模型](/ue5-re/01-object-model) / [ProcessEvent](/ue5-re/05-process-event) / [AOB](/ue5-re/06-aob)

## 我想用 AI 或训练环境跑对局

1. [KardsSim](/projects/kardsim) —— 把蓝图直译成 C# 的模拟器
2. 设计取舍看[直译模拟器专题](/kismet-sim/)：
   [为什么是 AST](/kismet-sim/01-why-ast) · [调用约定](/kismet-sim/02-calling-convention) · [触发点体系](/kismet-sim/03-triggers) · [审计方法论](/kismet-sim/04-audit) · [坑与复盘](/kismet-sim/05-pitfalls)
3. 另一个方向：[kards-client-headless](/projects/kards-client-headless)（Rust 规则核心 + C# 网络层，小卡池原型）

## 我只想知道这个组靠不靠谱

- [项目总览](/projects/)：每个项目的架构、实现细节与**边界**都写在同一页
- [团队介绍](/about/)：我们反复在回答的四个问题、工作方式、工程口味
- [安全 QA](/security/)：一份带方法与复现步骤的测试记录，可以看我们的证据标准
- [写作与取证约定](/lab/conventions)：我们怎么区分「实测」「推断」与「未验证」
