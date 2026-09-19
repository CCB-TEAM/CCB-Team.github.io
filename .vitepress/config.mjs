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
    ],
    sidebar: {
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
    },
    outline: { level: [2, 3], label: '本页目录' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新' },
  },
})
