---
title: 本站是怎么搭的
---

# 本站是怎么搭的

给想照抄一个同类站点的人：这里记下本站的技术选择、目录约定、以及几个踩过的坑。
没有花哨的东西，全部是静态 Markdown + 一个构建脚本。

## 技术栈

| 项 | 选择 | 原因 |
|---|---|---|
| 站点框架 | **VitePress 1.6** | Markdown 即内容，内置搜索、暗色模式、侧边栏与大纲；构建产物是纯静态文件 |
| 托管 | **GitHub Pages**（组织站 `ccb-team.github.io`） | 免费、自带 HTTPS，仓库推到 `main` 就发布 |
| CI | **GitHub Actions** | `deploy.yml` 里 `npm ci` → `npm run build` → `upload-pages-artifact` → `deploy-pages` |
| 运行时 | Node 20（CI）/ Node 24（本地） | 只用于构建，站点本身不含客户端 JS 应用 |
| 语言 | 中文 | `lang: 'zh-CN'`，界面文案（目录 / 上一篇 / 回到顶部）全部中文化 |

## 目录约定

```text
CCB-Team.github.io/
├── .vitepress/config.mjs      # 全站配置：导航、侧边栏、文案
├── docs/                      # srcDir，所有内容在这里
│   ├── index.md               # 首页（layout: home + features）
│   ├── about/                 # 团队
│   ├── projects/              # 项目：index.md 总览 + 每项目一页
│   ├── security/              # 安全 QA
│   ├── private-server/        # 私服教程（含 appendix/）
│   ├── kismet-sim/            # 直译模拟器专题
│   ├── ue5-re/ ue5-bp/        # 两个逆向专题（各含 appendix/）
│   └── lab/                   # 杂项与随笔
├── scripts/sync-projects.mjs  # 从 GitHub API 刷新项目总览里的仓库表
└── .github/workflows/deploy.yml
```

几条规则：

- **一页一个主题。** 项目页与专题章都是独立 `.md`，侧边栏手写登记；
  加页面忘了登记的表现是「URL 能打开但侧边栏里没有」。
- **frontmatter 只写 `title`**，偶尔用 `outline` 覆盖大纲层级（项目总览就只显示二级标题，
  避免二十多个项目把右栏撑爆）。
- **不用客户端组件。** 需要图就用 `text` 代码块里的 ASCII——省一个插件，也保证在纯文本里能读。

## 项目总览里的仓库表是生成的

`npm run sync` 会读 GitHub 组织下的公开仓库，重写 `docs/projects/index.md` 里
`<!-- BEGIN:PROJECTS-TABLE -->` 与 `<!-- END:PROJECTS-TABLE -->` 之间的表格。

脚本里三张映射表决定表格长什么样：

| 映射 | 作用 |
|---|---|
| `PAGE` | 仓库名 → 站内介绍页；未登记的直链 GitHub，同时出现在「缺少介绍页」提示里 |
| `GROUP` | 表格的「方向」列 |
| `SUMMARY` | 表格的「说明」列；未登记时回退到 GitHub 仓库描述 |

因为表格是生成的，**手改会被下一次同步覆盖**；要改文案就改脚本里的 `SUMMARY`。
GitHub 返回的仓库描述是外部输入，脚本会过滤控制字符与 `|`，避免把表格结构弄坏。

## 踩过的坑

- **`npm ci` 需要 `package-lock.json` 与 `package.json` 严格一致。** 改依赖后忘了提交 lock 文件，
  CI 会在第一步失败。
- **VitePress 默认会检查站内死链。** 链接写错（包括漏掉目录尾斜杠、锚点拼错）会让构建直接失败——
  这是好事，我们的做法是把它当 lint 用。
- **`base` 要留 `/`。** 组织站（`<org>.github.io`）挂在根路径；如果是项目站（`/<repo>/`），
  这里必须改，否则所有静态资源 404。
- **中文锚点可以用。** 标题里的中文会原样保留在锚点里（如 `/projects/#kards-模组与文档`），
  但改标题文字就等于改锚点——站内引用会一起断，所以重命名标题时要全站搜一遍。
- **侧边栏是手写的。** 新增章节记得同时更新 `nav` 与 `sidebar`，否则访问者只能靠 URL 摸进来。

## 本地预览

```bash
npm ci
npm run dev      # 开发服务器，热更新
npm run build    # 构建静态站点到 .vitepress/dist
npm run preview  # 预览构建产物
npm run sync     # 刷新项目总览里的仓库表（需要网络；可选 GITHUB_TOKEN）
```

## 内容维护

- 写作与取证规范见[写作与取证约定](/lab/conventions)。
- 勘误、补充、新页面都欢迎 PR；协议细节类的勘误请在 PR 里附上复现方式。
- 本站源码：[CCB-TEAM/CCB-Team.github.io](https://github.com/CCB-TEAM/CCB-Team.github.io)。
