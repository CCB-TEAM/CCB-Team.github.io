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
    details: KardsSim 把 1671 个蓝图资产直译成 42.5 万行 C#，得到不依赖游戏本体的本地对局模拟器，可复现、可训练 AI。
    link: /kismet-sim/
    linkText: 看设计与心得
  - title: 协议逆向
    details: B64XorDecryption 还原「Base64 + 变长 XOR 密钥」私有协议，附 C 动态库、C# API 与 IDA 伪代码存档。
    link: /projects/b64xordecryption
    linkText: 了解编解码方案
  - title: 安全 QA 记录
    details: 对 Kards 后台的一轮功能 QA 与安全测试：结论、方法、可复现步骤，以及离线复现的工具链。
    link: /security/
    linkText: 查看测试记录
---

## 快速入口

| 方向 | 内容 |
|---|---|
| 项目总览 | [全部公开项目](/projects/) —— 按方向分组的完整清单（含自动同步的仓库状态表） |
| 游戏服务端 | [fyserver](/projects/fyserver) · [kards-server-go](/projects/kards-server-go) · [FyClient](/projects/fyclient) |
| UE 工具链 | [Prism](/projects/prism) · [UAssetRegistry](/projects/uassetregistry) · [AssetRegistryTool](/projects/assetregistrytool) · [ULocres](/projects/ulocres) · [KismetDecompiler](/projects/kismetdecompiler) · [KismetReactor](/projects/kismetreactor) |
| 对局模拟器 | [KardsSim](/projects/kardsim) —— 蓝图 Kismet 直译成 C#：[为什么是 AST](/kismet-sim/01-why-ast) · [调用约定](/kismet-sim/02-calling-convention) · [触发点体系](/kismet-sim/03-triggers) · [审计方法论](/kismet-sim/04-audit) · [坑与复盘](/kismet-sim/05-pitfalls) |
| 逆向与协议 | [B64XorDecryption](/projects/b64xordecryption) · [上游衍生项目](/projects/upstream) |
| 测试记录 | [安全 QA](/security/) —— 测试方法、上传与目录穿越、功能缺陷清单、镜像与回放工具 |
| 自己写私服 | [系列教程](/private-server/) —— 从零实现 Kards 服务端（TS + C# 双语代码）：[协议取证](/private-server/01-discovery) · [会话](/private-server/03-session) · [codec](/private-server/04-codec) · [卡组码](/private-server/06-decks) · [匹配开局](/private-server/07-matchmaking) · [对局动作](/private-server/08-match-actions) · [WebSocket](/private-server/09-websocket) · [部署与兼容性坑](/private-server/10-deploy) |
| 本站 | [CCB-Team.github.io](/projects/site) —— VitePress 站点源码与部署流程 |
| 团队 | [团队介绍](/about/) —— 我们是谁、在做什么、成员分工与工作原则 |

## 组织仓库

所有公开仓库都在 [github.com/CCB-TEAM](https://github.com/CCB-TEAM)。
站点内的项目清单由脚本从 GitHub 同步，运行 `npm run sync` 即可更新：

```bash
npm ci        # 安装依赖
npm run dev   # 本地预览
npm run sync  # 刷新项目总览中的公开仓库清单
npm run build # 构建静态站点到 .vitepress/dist
```
