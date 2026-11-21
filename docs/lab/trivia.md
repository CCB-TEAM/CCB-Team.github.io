---
title: 无聊条目
---

# 无聊条目

专门收集那种「不影响功能、但接手的人一定会被绊一下」的小事：命名、注释、目录、
脚本、发布习惯，以及若干本机限定的怪癖。

一条原则：**只写能从仓库里看到的现象**，不替谁解释动机。

## 命名

| 现象 | 例子 |
|---|---|
| `solstice-` 前缀即职责 | [solstice-pak](/projects/solstice-pak) / [bin](/projects/solstice-bin) / [assetregistry](/projects/solstice-assetregistry) / [jmap](/projects/solstice-jmap) / [kismet](/projects/solstice-kismet) / [cskismet](/projects/solstice-cskismet) |
| `Fy` 是服务端线的代号 | `fyserver`、`FyClient`、`FyJsonContext`、`FYServer.slnx` |
| `K` 前缀留给「和游戏/字节码有关」的东西 | `KMod`、`KLog`、`Kismet`、`KardsSim`、`KardsServer` |
| 数据文件名不做美化，编号也留着 | `emojiLib.json`、`cardbackLib.json`、`deckCodeIDsTable2.json` |
| 发布物用提交短哈希当版本 | `kards-server-go-windows-amd64-8ba6ea4.exe` + 同名 `.sha256` |
| 文件名不修饰 | `破解加密易如反掌.cpp`（IDA 伪代码存档） |

## 注释

- **中文写因果，不写复述。** 好的例子是 fyserver 的 csproj：

  > `PublishAot=true` 时 SDK 会把运行时配置写成 `UseWindowsThreadPool=true`……检查点只留下 0 字节的 `ht.dat.0`，于是改名 / 卡组保存 / 兑换码领取全部挂起。

  这类注释的价值不在「说明这行干什么」，而在「删掉这行之后会挂成什么样」。
- **量级写成可读的乘法。** `const long MaxInlineMediaPreviewBytes = 96L * 1024 * 1024;`，而不是 `100663296`。
- **错误信息带位置。** `读回失败 @{offset}`、`跳转落点越界 @{offset}`——定位一件事的成本，取决于报错里有多少上下文。
- **C++ 头文件顶部先放事实卡。** KMod 的 `kmod_log.h` 先交代：日志目录、保留 5 份、每行格式、dev/release 的级别过滤，然后才是函数声明。
- **行尾对齐注释**用来标「可重复调用」「失败会怎样」，比另起一段更好扫。

## README 的五段式

翻几个仓库会发现结构高度一致：

1. 这是什么 + 一张能力表；
2. **「几个必须知道的编码事实」**（solstice-kismet 有 6 条、solstice-pak 有「两个容易踩的点」）；
3. 用法（可直接粘的命令）；
4. 验证（带数字与条件）；
5. 限制（不支持什么、只验证过哪个版本）。

其中第 2 段是特色：把「不看就会写错」的格式事实单独拎出来，而不是埋在正文里。
第 5 段通常比第 1 段长，这是我们故意的。

## 文档目录

| 仓库 | 目录约定 |
|---|---|
| polaris | `docs/` 固定五件套：`INDEX.md`（模块与未实现清单）、`PLAN.md`（里程碑与闸门）、`dataflow.md`（数据流与不变量）、`decisions/`（ADR）、`verification/`（逐次验证记录） |
| Solstice-winter | `docs/INDEX.md` 是函数状态看板；`docs/可行性评估.md` 列 D1–D16 每条决策**和它的代价** |
| fyserver | README 有「功能进度」三档：✅ / 🟡 部分实现 / ❌ 未实现 |
| 本站 | 你正在看的这一栏，写作规范在[约定](/lab/conventions) |

## 脚本

- `.ps1` 密度很高：`run.ps1`（构建 + 建索引 + 起 UI）、`build.ps1`（构建 + 重打包 + 签名）、`stage.ps1`（部署到游戏目录）、`package.ps1`（出 zip）、`Smoke-Test.ps1`。
- 脚本里会固化一些「本机才知道」的参数：`dotnet build -m:1`、`npm ci --no-audit --no-fund`、`-Flavor dev|release`。
- 生成类脚本一律「从系统文件重新生成」：`tools/gen_proxy_exports.py` 读本机 `dwmapi.dll` 生成 `exports.inl`；`tools/prepare_sdk.py` 给 Dumper-7 的头文件打 MSVC 补丁。
- 不随仓库分发的东西写清楚：`binka_encode.exe` 要自己编，Oodle 要自己备。

## 发布

- 两个 flavor：`dev` 带控制台窗口 / 悬浮控制台 / 调试日志，`release` 不带——选择 flavor 就是选择「要不要把调试入口打进包里」。
- **截图不是手截的。** Prism 的界面截图由 Skia 渲染成 PNG（每页 × 明暗 × 宽窄各一张），应用内指南的图也直接渲染进 `Assets/help/`；换 UI 之后必须重跑，否则指南里显示的还是旧版本。
- KMod 的 ImGui 覆盖层连「编译」都不是默认的：`-DKMOD_OVERLAY=ON` 才存在。

## 测试

- 断言数会写进 README 当卖点：Prism 的集成测试 **455 条**，覆盖两种转换路径与四种输出模式。
- 验证工程单独一个项目：`tests/Solstice.Pak.Verify`、`Solstice.Kismet.Verify`，`dotnet run` 就是自检。
- Go 侧单测落在三个地方：`deal_test.go`（发牌）、`match_end_test.go`（结算）、`deckcode/parser_test.go`（卡组码）。
- 有 `smoke` 子命令（Prism）和 `Smoke-Test.ps1`（headless 工具链）——冒烟测试被当作命令，不是当作仪式。

## 进了仓库的二进制

- `kards-server-go/release/*.exe` 与 `.sha256`（方便不装 Go 先跑）；
- 根目录的 `IPRedirection.exe`（配 `IPRedirection.cpp` 源码）；
- `KismetReactor` 里连 `bin/` 与 `obj/` 都提交了——实验性仓库的常见状态，没有清理。

不算好习惯，但都还能解释：前两个是分发需要，最后一个是「先让它能跑」。

## 本机限定的怪癖

| 怪癖 | 表现 | 出处 |
|---|---|---|
| `-m:1` | 并行节点会让构建失败，且失败形态是「生成失败 / 0 个错误」，日志里一条 error 都没有 | Solstice-winter |
| `UseWindowsThreadPool=false` | 不设它，AOT 与托管构建都挂；设了之后检查点 0.2–0.3 秒完成 | fyserver |
| `RemoveExtraSlash` / 路径归一化 | 客户端发出的路径有连续斜杠，服务端要能等价处理 | fyserver / kards-server-go |
| 单文件 HTML 游戏 | 页面、样式、卡牌数据、对战脚本全内联，双击即玩 | Crown-duel |
| `$env:ESBUILD_BINARY_PATH` | 某些沙箱/无管道环境下构建 esbuild 需要显式指路 | 本站 |

## 文档语气

- 不用感叹号（本站全文搜不到几个）；
- 先写限制、再写能力；
- 失败输出原样贴（例如 KismetDecompiler 在 1541 个 ubergraph 里 712 个把 case 体当死代码删掉的那次）；
- 数字一定带条件：不说「很快」，说「7 GB 母 pak + 1 张贴图 → 685 KB / 3.2 s」。

## 为什么要记这些

因为这些细节才是**接手成本**的主要来源：格式事实决定你能不能在半小时内改对一个字节，
脚本参数决定你能不能复现别人的结果，命名与目录决定你能不能在三分钟内找到该改哪个文件。

它们不影响功能，只影响别人（包括三个月后的自己）能不能干活。
