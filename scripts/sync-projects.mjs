#!/usr/bin/env node
/**
 * 同步 CCB-TEAM 的公开仓库清单到 docs/projects/index.md。
 *
 * 数据来源：本机已登录的 `gh` CLI（或环境变量 GITHUB_TOKEN）。
 * 行为：重写 index.md 中 BEGIN:PROJECTS-TABLE / END:PROJECTS-TABLE 之间的表格，
 *       并提示哪些公开仓库还没有专属介绍页。
 *
 * 用法：npm run sync
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ORG = 'CCB-TEAM'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = resolve(ROOT, 'docs/projects/index.md')
const BEGIN = '<!-- BEGIN:PROJECTS-TABLE -->'
const END = '<!-- END:PROJECTS-TABLE -->'

/** 仓库名 → 站点内介绍页（未登记的仓库回退到 GitHub 链接）。顺序即表格顺序。 */
const PAGE = {
  fyserver: '/projects/fyserver',
  'kards-server-go': '/projects/kards-server-go',
  FyClient: '/projects/fyclient',
  Prism: '/projects/prism',
  UAssetRegistry: '/projects/uassetregistry',
  AssetRegistryTool: '/projects/assetregistrytool',
  ULocres: '/projects/ulocres',
  KismetDecompiler: '/projects/kismetdecompiler',
  KismetReactor: '/projects/kismetreactor',
  'kards-sim': '/projects/kardsim',
  B64XorDecryption: '/projects/b64xordecryption',
  'Ruri.ShaderDecompiler': '/projects/upstream#ruri-shaderdecompiler',
  iced: '/projects/upstream#iced',
  FractalMiner: '/projects/upstream#fractalminer',
  'VapeV4.21': '/projects/upstream#vapev4-21',
  OpenVape: '/projects/upstream#openvape',
  'gerouke-bot': '/projects/upstream#gerouke-bot',
  UEBlueprintGraphViewer: '/projects/upstream#ueblueprintgraphviewer',
  'CCB-Team.github.io': '/projects/site',
}

/** 表格行右侧的「方向」列。 */
const GROUP = {
  fyserver: '服务端 / 客户端',
  'kards-server-go': '服务端 / 客户端',
  FyClient: '服务端 / 客户端',
  Prism: 'UE 工具链',
  UAssetRegistry: 'UE 工具链',
  AssetRegistryTool: 'UE 工具链',
  ULocres: 'UE 工具链',
  KismetDecompiler: 'UE 工具链',
  KismetReactor: 'UE 工具链',
  'kards-sim': 'UE 工具链',
  B64XorDecryption: '逆向 / 协议',
  'CCB-Team.github.io': '本站',
}

/** 表格「说明」列：优先使用这里的中文一句话简介，未登记时回退到 GitHub 仓库描述。 */
const SUMMARY = {
  fyserver: 'C# / .NET 10 私服服务端：HTTP + WebSocket 单端口，NativeAOT 单文件发布，自带 Web 后台',
  'kards-server-go': 'Gin + GORM + MySQL 实现的 KARDS 私服，附预编译 Windows 二进制',
  FyClient: '纯 C# 虚拟测试客户端，端到端验证登录 / 匹配 / 对局 / 结算',
  Prism: 'UE4/UE5 .pak 工具箱（Windows + Android）：浏览预览、贴图替换、pak 合并、跨平台贴图移植',
  UAssetRegistry: 'AssetRegistry.bin 解析 / 快速枚举 / 语义级回写库（基于 UAssetAPI）',
  AssetRegistryTool: 'UE 5.6 编辑器插件：用工程资产重建 AssetRegistry.bin，含 List / Merge commandlet',
  ULocres: '.locres 本地化读写库：四种格式版本全覆盖，未修改内容逐字节一致',
  KismetDecompiler: '蓝图 Kismet 字节码反编译器：AST → C++ 风格伪代码，含反 Dispatch 与 CFG 结构化',
  KismetReactor: 'WPF 图形化蓝图字节码查看 / 编辑器：跳转可视化与就地修改',
  'kards-sim': '把蓝图 Kismet 直译成 C# 的本地对局模拟器：42.5 万行直译产物，可跑自对弈训练 AI',
  B64XorDecryption: 'Base64 + 变长 XOR 私有协议编解码的逆向实现（C 动态库 / C# API）',
  'Ruri.ShaderDecompiler': '通用 Shader 反编译库：把 Shader 二进制还原为带符号的 HLSL',
  iced: 'x86/x64 反汇编 / 汇编 / 编解码库，含 Rust / .NET / Java / Python / Lua 绑定',
  FractalMiner: 'Unity ShaderLab 分形渲染实验',
  'VapeV4.21': 'Vape 4.21 Java 层与 Windows x64 原生桥接层的研究性恢复工程',
  OpenVape: 'Vape 4.21 客户端 / 启动器 / 本地服务的研究性恢复工程',
  'gerouke-bot': '面向 macOS 的「割肉可 Bot 0.18.0」源码级重建与扩展',
  UEBlueprintGraphViewer: '查看 UE4 / UE5 编译后蓝图代码的工具，含资产引用搜索',
  'CCB-Team.github.io': '本站源码：VitePress 构建，GitHub Actions 部署到 Pages',
}

function ghJson(args) {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  })
  return JSON.parse(out)
}

function fetchPublicRepos() {
  const fields = 'name,visibility,description,primaryLanguage,stargazerCount,isFork,url,pushedAt'
  const repos = ghJson(['repo', 'list', ORG, '--limit', '500', '--json', fields])
  return repos.filter((r) => r.visibility === 'PUBLIC')
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()
const day = (iso) => (iso ? String(iso).slice(0, 10) : '—')

function renderTable(repos) {
  const order = Object.keys(PAGE)
  const rank = (name) => {
    const i = order.indexOf(name)
    return i === -1 ? order.length : i
  }
  const sorted = [...repos].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))

  const unregistered = sorted.filter((r) => !(r.name in PAGE)).map((r) => r.name)

  const rows = sorted.map((r) => {
    const link = PAGE[r.name] ? `[${r.name}](${PAGE[r.name]})` : `[${r.name}](${r.url})`
    const lang = r.primaryLanguage?.name ?? '—'
    const fork = r.isFork ? '（Fork）' : ''
    const group = GROUP[r.name] ?? (r.isFork ? 'Fork' : '—')
    const desc = cell(SUMMARY[r.name] ?? r.description) || '—'
    return `| ${link}${fork} | ${cell(group)} | ${cell(lang)} | ${r.stargazerCount} | ${day(r.pushedAt)} | ${desc} |`
  })

  return { table: rows.join('\n'), count: sorted.length, unregistered }
}

function main() {
  const repos = fetchPublicRepos()
  const { table, count, unregistered } = renderTable(repos)

  const block = [
    BEGIN,
    `<!-- 本表由 \`npm run sync\` 自动生成，请勿手工编辑。仓库数：${count} -->`,
    '',
    '| 仓库 | 方向 | 语言 | Star | 最近推送 | 说明 |',
    '|---|---|---|---|---|---|',
    table,
    '',
    END,
  ].join('\n')

  const md = readFileSync(INDEX, 'utf8')
  const start = md.indexOf(BEGIN)
  const end = md.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    console.error(`✗ 未在 ${INDEX} 中找到 ${BEGIN} / ${END} 标记`)
    process.exit(1)
  }

  writeFileSync(INDEX, md.slice(0, start) + block + md.slice(end + END.length), 'utf8')

  console.log(`✓ 已同步 ${count} 个公开仓库到 docs/projects/index.md`)
  if (unregistered.length > 0) {
    console.log(`! 以下公开仓库没有专属介绍页（当前直链 GitHub）：${unregistered.join(', ')}`)
  }
}

main()
