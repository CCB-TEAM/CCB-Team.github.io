---
title: CCB-Team.github.io —— 本站
---

# CCB-Team.github.io

本站自身的源码仓库：基于 **VitePress** 的静态站点，通过 GitHub Actions 构建并发布到 GitHub Pages。

| 项 | 值 |
|---|---|
| 语言 / 框架 | JavaScript · VitePress 1.x（Vue 3 + Vite） |
| 部署 | GitHub Actions → GitHub Pages（`deploy.yml`） |
| 站点地址 | <https://ccb-team.github.io/> |
| 仓库 | <https://github.com/CCB-Team/CCB-Team.github.io> |

## 目录结构

```
CCB-Team.github.io/
├── .github/workflows/deploy.yml   # 构建 + 部署到 Pages
├── .vitepress/config.mjs          # 站点配置：nav / sidebar / 搜索 / 主题文案
├── docs/
│   ├── index.md                   # 首页（hero + 方向卡片）
│   ├── 404.md                     # 自定义「页面不存在」
│   ├── about/                     # 团队介绍
│   ├── projects/                  # 项目介绍（本目录）
│   │   ├── index.md               #   总览（含脚本生成的仓库清单）
│   │   └── *.md                   #   各项目详情页
│   ├── security/                  # 安全 QA 测试记录
│   ├── private-server/            # 《自己写私服》教程（含 appendix/）
│   ├── kismet-sim/                # Kismet 直译模拟器专题
│   ├── ue5-re/ ue5-bp/            # UE5 运行时逆向 / 蓝图逆向专题
│   └── lab/                       # 杂项与随笔（术语表、工具箱、问答…）
├── scripts/sync-projects.mjs      # 从 GitHub 同步公开仓库清单
└── package.json
```

## 本地开发

```bash
npm ci
npm run dev       # 本地预览（默认 http://localhost:5173）
npm run build     # 产出静态文件到 .vitepress/dist
npm run preview   # 预览构建产物
npm run sync      # 重新生成「项目总览」里的公开仓库清单
```

`npm run sync` 使用 GitHub 公开 REST API（可选设置 `GITHUB_TOKEN` 提高请求额度），
分页读取 `CCB-TEAM` 下的公开仓库，重写 `docs/projects/index.md` 中
`BEGIN:PROJECTS-TABLE` 与 `END:PROJECTS-TABLE` 之间的表格，并提示**哪些公开仓库还没有专属介绍页**。
部署工作流不会自动运行该脚本；仓库清单是最近一次运行并提交时的快照。

## 部署

推送到 `main` 分支即触发 `.github/workflows/deploy.yml`：

1. `actions/checkout` → `actions/setup-node`（Node 20，缓存 npm）
2. `npm ci` → `npm run build`
3. `actions/configure-pages` → `upload-pages-artifact`（上传 `.vitepress/dist`）
4. `actions/deploy-pages` 发布到 `github-pages` 环境

也可以在仓库的 Actions 页手动触发（`workflow_dispatch`）。

::: tip 新增项目介绍页
1. 在 `docs/projects/` 下新建 `你的项目.md`；
2. 在 `.vitepress/config.mjs` 的 `themeConfig.sidebar['/projects/']` 对应分组里加一条 `{ text, link }`；
3. 在 `scripts/sync-projects.mjs` 的 `PAGE` 映射里补上仓库名 → 页面路径；
4. 运行 `npm run sync` 刷新总览表格。
:::

## 静态资源与样式

站点使用 VitePress 默认主题，未引入自定义主题或第三方 UI 依赖：Markdown + 内置容器（`::: tip` / `::: warning`）
即可满足文档需求，构建产物纯静态、无运行时后端依赖。

## 站内功能

| 功能 | 说明 |
|---|---|
| 本地搜索 | VitePress 内置的 `local` provider，构建期生成索引，文案已中文化 |
| 自定义 404 | `docs/404.md` 列出常用入口，替代默认英文提示 |
| 每页大纲 | 默认显示 2–3 级标题；长页面（如项目总览）用 frontmatter `outline: [2, 2]` 收到二级 |
| 最后更新时间 | 取 git 提交时间，由 `themeConfig.lastUpdated` 控制 |
| 死链检查 | 构建期默认开启：站内链接或目录写错会直接让构建失败，等于免费的 lint |

站点内容的组织方式与写作规范见[本站是怎么搭的](/lab/colophon)与[写作与取证约定](/lab/conventions)。
