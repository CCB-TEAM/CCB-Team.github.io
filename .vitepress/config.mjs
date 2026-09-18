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
      { text: '安全 QA', link: '/security/', activeMatch: '^/security/' },
    ],
    sidebar: {
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
