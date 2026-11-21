---
layout: home

hero:
  name: CCB-TEAM
  text: 组织站点
  tagline: 团队项目的文档、工具与研究记录
  actions:
    - theme: brand
      text: 浏览全部项目
      link: /projects/
    - theme: alt
      text: 安全 QA 记录
      link: /security/
    - theme: alt
      text: 自己写私服
      link: /private-server/

features:
  - title: 游戏服务端与客户端
    details: fyserver（C# / .NET 10）与 kards-server-go（Go / Gin）两套 KARDS 服务端实现，以及端到端验证客户端 FyClient。
    link: /projects/fyserver
    linkText: 3 个项目
  - title: UE .pak 工具箱
    details: Prism 支持浏览与预览、贴图替换、pak 合并，以及在游戏的 PC 与移动端构建之间移植贴图。
    link: /projects/prism
    linkText: 了解 Prism
  - title: 资产与本地化格式
    details: AssetRegistry.bin 的解析与语义级回写、UE 5.6 编辑器插件，以及四种格式版本的 .locres 读写。
    link: /projects/uassetregistry
    linkText: 了解 UAssetRegistry
  - title: 蓝图字节码工具
    details: KismetDecompiler 把蓝图字节码输出为结构化伪代码，KismetReactor 提供图形化查看与就地编辑。
    link: /projects/kismetdecompiler
    linkText: 了解 KismetDecompiler
  - title: Kismet 直译模拟器
    details: KardsSim 把蓝图资产直译成 C#，得到不依赖游戏本体的本地对局模拟器，可用于训练和评测 AI。
    link: /kismet-sim/
    linkText: 看设计与心得
  - title: 协议逆向
    details: B64XorDecryption 还原「Base64 + 变长 XOR 密钥」私有协议，附 C 动态库、C# API 与 IDA 伪代码存档。
    link: /projects/b64xordecryption
    linkText: 了解编解码方案
  - title: KARDS 模组加载器
    details: KMod 提供 Windows 和 Android 加载器，以及安装、开发与 API 文档。
    link: /projects/#kards-模组与文档
    linkText: 浏览 KMod 项目
  - title: UE5 运行时逆向
    details: 整理公开资料里手动定位 GObjects / GNames / GWorld / ProcessEvent 与 AOB 特征码的方法，逐条标注出处。
    link: /ue5-re/
    linkText: 阅读专题
  - title: UE5 蓝图逆向
    details: Kismet 字节码怎么读、怎么反编译、怎么改回去：操作码表、有损性的实测证据、逐游戏魔改的实例与工具全景。
    link: /ue5-bp/
    linkText: 阅读专题
  - title: 安全 QA 记录
    details: 对 Kards 后台的一轮功能 QA 与安全测试：结论、方法、可复现步骤，以及离线复现的工具链。
    link: /security/
    linkText: 查看测试记录
  - title: 杂项与随笔
    details: 术语表、工具箱、按目标分流的阅读路径、常见问答、写作与取证约定，以及本站自己的搭建记录。
    link: /lab/
    linkText: 进站先看这里
  - title: F# 教程：从函数到 Web 服务
    details: 单一场景走到底：从函数、记录、模式匹配开始，最后做出一个完整的 ASP.NET Core 对局服务。概念先给定义，代码都编译运行过。
    link: /fsharp/
    linkText: 开始阅读
---

## 快速入口

| 方向 | 内容 |
|---|---|
| 项目总览 | [全部公开项目](/projects/) —— 按方向分组的清单与可通过脚本刷新的仓库状态表 |
| KARDS 模组 | [Windows 加载器](/projects/kmod-loader-windows) · [Android 加载器](/projects/kmod-loader-android) · [文档](/projects/kmod-docs) |
| 游戏服务端 | [fyserver](/projects/fyserver) · [kards-server-go](/projects/kards-server-go) · [FyClient](/projects/fyclient) |
| UE 工具链 | [Prism](/projects/prism) · [UAssetRegistry](/projects/uassetregistry) · [AssetRegistryTool](/projects/assetregistrytool) · [ULocres](/projects/ulocres) · [KismetDecompiler](/projects/kismetdecompiler) · [KismetReactor](/projects/kismetreactor) |
| 对局模拟器 | [KardsSim](/projects/kardsim) —— 蓝图 Kismet 直译成 C#：[为什么是 AST](/kismet-sim/01-why-ast) · [调用约定](/kismet-sim/02-calling-convention) · [触发点体系](/kismet-sim/03-triggers) · [审计方法论](/kismet-sim/04-audit) · [坑与复盘](/kismet-sim/05-pitfalls) · [推荐 hook 点](/kismet-sim/06-hooks) · [发射器实现特性](/kismet-sim/07-emitter) |
| 逆向与协议 | [B64XorDecryption](/projects/b64xordecryption) · [上游衍生项目](/projects/upstream) |
| UE5 运行时逆向 | [专题总览](/ue5-re/) —— [对象模型](/ue5-re/01-object-model) · [GObjects](/ue5-re/02-gobjects) · [GNames](/ue5-re/03-gnames) · [GWorld](/ue5-re/04-gworld) · [ProcessEvent](/ue5-re/05-process-event) · [AOB 特征码](/ue5-re/06-aob) · [工具链](/ue5-re/07-toolchain) · [**定位路径速查**](/ue5-re/08-anchor-paths) · [**MinHook 上手**](/ue5-re/09-minhook) · [出处清单](/ue5-re/appendix/sources) |
| UE5 蓝图逆向 | [专题总览](/ue5-bp/) —— [资产形态](/ue5-bp/01-anatomy) · [Kismet 字节码](/ue5-bp/02-bytecode) · [反编译](/ue5-bp/03-decompile) · [工具全景](/ue5-bp/04-tooling) · [罕见之处](/ue5-bp/05-pitfalls) · [上手路径](/ue5-bp/06-practice) · [反射对象字段](/ue5-bp/07-structures) · [属性系统](/ue5-bp/08-property-system) · [PropertyPointer](/ue5-bp/09-property-pointer) · [LoadedProperties](/ue5-bp/10-loaded-properties) · [字节码详解（上）](/ue5-bp/11-opcodes-a) · [字节码详解（下）](/ue5-bp/12-opcodes-b) · [**蓝图虚拟机**](/ue5-bp/13-vm) · [出处清单](/ue5-bp/appendix/sources) |
| 测试记录 | [安全 QA](/security/) —— 测试方法、上传与目录穿越、功能缺陷清单、镜像与回放工具 |
| 自己写私服 | [系列教程](/private-server/) —— 从零实现 Kards 服务端（TS + C# 双语代码）：[协议取证](/private-server/01-discovery) · [会话](/private-server/03-session) · [codec](/private-server/04-codec) · [卡组码](/private-server/06-decks) · [匹配开局](/private-server/07-matchmaking) · [对局动作](/private-server/08-match-actions) · [WebSocket](/private-server/09-websocket) · [部署与兼容性坑](/private-server/10-deploy) |
| 本站 | [CCB-Team.github.io](/projects/site) —— VitePress 站点源码与部署流程 |
| F# | [F# 入门](/fsharp/) —— 从函数到完整 ASP.NET Core 项目：[从 C# 过来](/fsharp/00-mindset) · [函数](/fsharp/01-functions) · [数据](/fsharp/02-data) · [模式匹配](/fsharp/03-pattern-matching) · [计算表达式](/fsharp/07-computation-expressions) · [路由](/fsharp/11-routing-and-json) · [完整项目](/fsharp/13-complete-project) · [速查表](/fsharp/cheatsheet) |
| 杂项 | [杂项与随笔](/lab/) —— [术语表](/lab/glossary) · [工具箱](/lab/toolbox) · [选型与风格](/lab/stack) · [无聊条目](/lab/trivia) · [阅读路径](/lab/reading-path) · [问答](/lab/faq) · [写作约定](/lab/conventions) · [时间线](/lab/timeline) · [本站怎么搭的](/lab/colophon) |
| 团队 | [团队介绍](/about/) —— 我们是谁、在做什么、工作方式与工程口味 |

## 组织仓库

所有公开仓库都在 [github.com/CCB-TEAM](https://github.com/CCB-TEAM)。
站点内的项目清单由脚本从 GitHub 同步，运行 `npm run sync` 即可更新：

```bash
npm ci        # 安装依赖
npm run dev   # 本地预览
npm run sync  # 刷新项目总览中的公开仓库清单
npm run build # 构建静态站点到 .vitepress/dist
```
