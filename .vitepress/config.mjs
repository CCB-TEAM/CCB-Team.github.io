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
    ],
    sidebar: [
      { text: '首页', link: '/' },
    ],
    outline: { level: [2, 3], label: '本页目录' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
  },
})
