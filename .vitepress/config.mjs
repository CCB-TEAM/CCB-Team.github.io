import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'CCB-TEAM',
  description: 'CCB-TEAM 组织站点',
  srcDir: 'docs',
  base: '/',

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '项目', link: '/projects/', activeMatch: '^/projects/' },
      { text: '安全 QA', link: '/security/', activeMatch: '^/security/' },
      { text: '自己写私服', link: '/private-server/', activeMatch: '^/private-server/' },
      { text: '模拟器', link: '/kismet-sim/', activeMatch: '^/kismet-sim/' },
      { text: 'UE5 逆向', link: '/ue5-re/', activeMatch: '^/ue5-re/' },
      { text: '蓝图逆向', link: '/ue5-bp/', activeMatch: '^/ue5-bp/' },
      { text: '团队', link: '/about/', activeMatch: '^/about/' },
    ],
    sidebar: {
      '/about/': [
        {
          text: '团队',
          items: [
            { text: '团队介绍', link: '/about/' },
            { text: '全部公开项目', link: '/projects/' },
            { text: '安全 QA', link: '/security/' },
            { text: '自己写私服', link: '/private-server/' },
          ],
        },
      ],
      '/projects/': [
        {
          text: '项目总览',
          items: [{ text: '全部公开项目', link: '/projects/' }],
        },
        {
          text: '游戏服务端与客户端',
          items: [
            { text: 'fyserver', link: '/projects/fyserver' },
            { text: 'kards-server-go', link: '/projects/kards-server-go' },
            { text: 'FyClient', link: '/projects/fyclient' },
          ],
        },
        {
          text: 'UE 资产与蓝图工具链',
          items: [
            { text: 'Prism', link: '/projects/prism' },
            { text: 'UAssetRegistry', link: '/projects/uassetregistry' },
            { text: 'AssetRegistryTool', link: '/projects/assetregistrytool' },
            { text: 'ULocres', link: '/projects/ulocres' },
            { text: 'KismetDecompiler', link: '/projects/kismetdecompiler' },
            { text: 'KismetReactor', link: '/projects/kismetreactor' },
            { text: 'KardsSim（直译模拟器）', link: '/projects/kardsim' },
          ],
        },
        {
          text: '逆向工程与协议分析',
          items: [{ text: 'B64XorDecryption', link: '/projects/b64xordecryption' }],
        },
        {
          text: '其它',
          items: [
            { text: '上游衍生项目（Fork）', link: '/projects/upstream' },
            { text: '本站（CCB-Team.github.io）', link: '/projects/site' },
          ],
        },
      ],
      '/kismet-sim/': [
        {
          text: 'Kismet 直译模拟器',
          items: [
            { text: '总览', link: '/kismet-sim/' },
            { text: '01 · 为什么是 AST，不是伪代码', link: '/kismet-sim/01-why-ast' },
            { text: '02 · 架构与调用约定', link: '/kismet-sim/02-calling-convention' },
            { text: '03 · 触发点体系', link: '/kismet-sim/03-triggers' },
            { text: '04 · 审计方法论', link: '/kismet-sim/04-audit' },
            { text: '05 · 坑与复盘', link: '/kismet-sim/05-pitfalls' },
            { text: '06 · 宿主该切在哪一层（hook 点）', link: '/kismet-sim/06-hooks' },
            { text: '07 · 发射器与运行时实现特性', link: '/kismet-sim/07-emitter' },
          ],
        },
        {
          text: '相关',
          items: [
            { text: 'KardsSim 项目页', link: '/projects/kardsim' },
            { text: 'KismetDecompiler', link: '/projects/kismetdecompiler' },
            { text: '项目总览', link: '/projects/' },
          ],
        },
      ],
      '/security/': [
        {
          text: '安全 QA',
          items: [
            { text: '概览', link: '/security/' },
            { text: '测试方法', link: '/security/methodology' },
            { text: '上传与目录穿越', link: '/security/upload-and-traversal' },
            { text: '功能缺陷清单', link: '/security/functional-defects' },
            { text: '镜像与回放工具', link: '/security/tooling' },
          ],
        },
        {
          text: '相关',
          items: [{ text: '项目总览', link: '/projects/' }],
        },
      ],
      '/private-server/': [
        {
          text: '自己写私服',
          items: [
            { text: '总览', link: '/private-server/' },
            { text: '01 · 协议是怎么知道的', link: '/private-server/01-discovery' },
            { text: '02 · 引导接口与最小服务', link: '/private-server/02-bootstrap' },
            { text: '03 · 登录与会话', link: '/private-server/03-session' },
            { text: '04 · 消息编解码 codec', link: '/private-server/04-codec' },
          ],
        },
        {
          text: '玩家与卡组',
          items: [
            { text: '05 · 玩家数据、物品与图书馆', link: '/private-server/05-player-data' },
            { text: '06 · 卡组与卡组码', link: '/private-server/06-decks' },
          ],
        },
        {
          text: '对战',
          items: [
            { text: '07 · 大厅、匹配与开局', link: '/private-server/07-matchmaking' },
            { text: '08 · 对局同步与结算', link: '/private-server/08-match-actions' },
            { text: '09 · WebSocket 实时通道', link: '/private-server/09-websocket' },
          ],
        },
        {
          text: '运维',
          items: [
            { text: '10 · 部署与兼容性坑', link: '/private-server/10-deploy' },
          ],
        },
        {
          text: '数据与覆盖',
          items: [
            { text: '11 · 物品、装备与卡牌库', link: '/private-server/11-items-library' },
            { text: '12 · 参考实现没覆盖的端点', link: '/private-server/12-unimplemented' },
          ],
        },
        {
          text: '进阶专题',
          items: [
            { text: '13 · 人机对局与对局内协议', link: '/private-server/13-bot-and-actions' },
          ],
        },
        {
          text: '附录 · 注解、自检、复现与实测',
          items: [
            { text: 'A · UHT 结构体与枚举', link: '/private-server/appendix/uht-structs' },
            { text: 'B · 蓝图反编译注解', link: '/private-server/appendix/decompile-notes' },
            { text: 'C · 端点与配置解析过程', link: '/private-server/appendix/client-flow' },
            { text: 'D · 自检脚本与常量速查', link: '/private-server/appendix/smoke-test' },
            { text: 'E · 复现指南与待验证清单', link: '/private-server/appendix/open-questions' },
            { text: 'F · 官服实测对照', link: '/private-server/appendix/live-probe' },
            { text: 'G · 端点矩阵与数据复用', link: '/private-server/appendix/endpoint-matrix' },
            { text: 'H · 真实客户端抓包实录', link: '/private-server/appendix/client-capture' },
          ],
        },
      ],
      '/ue5-re/': [
        {
          text: 'UE5 游戏手动逆向',
          items: [
            { text: '总览', link: '/ue5-re/' },
            { text: '01 · 对象模型', link: '/ue5-re/01-object-model' },
            { text: '02 · 定位 GObjects', link: '/ue5-re/02-gobjects' },
            { text: '03 · 定位 GNames', link: '/ue5-re/03-gnames' },
            { text: '04 · 定位 GWorld', link: '/ue5-re/04-gworld' },
            { text: '05 · ProcessEvent', link: '/ue5-re/05-process-event' },
            { text: '06 · AOB 特征码', link: '/ue5-re/06-aob' },
            { text: '07 · 工具链', link: '/ue5-re/07-toolchain' },
          ],
        },
        {
          text: '附录',
          items: [
            { text: '出处清单', link: '/ue5-re/appendix/sources' },
          ],
        },
        {
          text: '相关',
          items: [
            { text: 'Kismet 直译模拟器', link: '/kismet-sim/' },
            { text: '项目总览', link: '/projects/' },
          ],
        },
      ],
      '/ue5-bp/': [
        {
          text: 'UE5 蓝图逆向',
          items: [
            { text: '总览', link: '/ue5-bp/' },
            { text: '01 · 蓝图资产里存了什么', link: '/ue5-bp/01-anatomy' },
            { text: '02 · Kismet 字节码', link: '/ue5-bp/02-bytecode' },
            { text: '03 · 反编译', link: '/ue5-bp/03-decompile' },
            { text: '04 · 工具全景', link: '/ue5-bp/04-tooling' },
            { text: '05 · 罕见之处', link: '/ue5-bp/05-pitfalls' },
            { text: '06 · 上手路径', link: '/ue5-bp/06-practice' },
          ],
        },
        {
          text: '结构详解',
          items: [
            { text: '07 · 反射对象的字段级定义', link: '/ue5-bp/07-structures' },
            { text: '08 · 属性系统：FField 与 FProperty', link: '/ue5-bp/08-property-system' },
            { text: '09 · FKismetPropertyPointer', link: '/ue5-bp/09-property-pointer' },
            { text: '10 · LoadedProperties 与签名还原', link: '/ue5-bp/10-loaded-properties' },
          ],
        },
        {
          text: '字节码详解',
          items: [
            { text: '11 · 常用字节码（上）', link: '/ue5-bp/11-opcodes-a' },
            { text: '12 · 常用字节码（下）', link: '/ue5-bp/12-opcodes-b' },
          ],
        },
        {
          text: '附录',
          items: [
            { text: '出处清单', link: '/ue5-bp/appendix/sources' },
          ],
        },
        {
          text: '相关',
          items: [
            { text: 'KismetDecompiler', link: '/projects/kismetdecompiler' },
            { text: 'Kismet 直译模拟器', link: '/kismet-sim/' },
            { text: 'UE5 运行时逆向', link: '/ue5-re/' },
          ],
        },
      ],
    },
    outline: { level: [2, 3], label: '本页目录' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
  },
})
