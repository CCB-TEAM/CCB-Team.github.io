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
            { text: '08 · 对局动作、调度与结算', link: '/private-server/08-match-actions' },
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
          text: '附录 · 客户端产物注解与自检',
          items: [
            { text: 'A · UHT 结构体与枚举', link: '/private-server/appendix/uht-structs' },
            { text: 'B · 蓝图反编译注解', link: '/private-server/appendix/decompile-notes' },
            { text: 'C · 端点与配置解析过程', link: '/private-server/appendix/client-flow' },
            { text: 'D · 自检脚本与常量速查', link: '/private-server/appendix/smoke-test' },
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
