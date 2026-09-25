---
title: 附录 D · 自检脚本与常量速查
---

# 附录 D · 自检脚本与常量速查

前面各章讲"怎么实现"，这一页解决"**跑起来之后卡在哪一步**"。左侧是抄一次就够的常量，右侧是一份能直接跑的 PowerShell 冒烟脚本：它按客户端真实顺序把接口走一遍，每一步打印 `✓` / `✗` 并给出该去查哪一章。

## 一、常量速查

### 连接与鉴权

| 项 | 值 |
|---|---|
| HTTP | `5231`（`kardsservergo` 的 `port`） |
| WebSocket | `5232`（`kardsservergo` 的 `wsport`）；`fyserver` 把 WS 合进 5231 根路径升级 |
| 鉴权头 | `Authorization: JWT <token>`（注意前缀是 `JWT `，不是 `Bearer `） |
| **免鉴权白名单** | 本项目约定三个：`/`、`/session`、`/.com/config`；**官服实际是 `/`、`/session`、`/config`**（`/.com/config` 在官服 404） |
| 响应约定 | 未匹配到对手 = `null`（官服是 **JSON null**，参考实现回字符串 `null`，两者客户端都认）；保活 = 字符串 `running`；没换过牌 = `null` |

### codec 报文布局

```
tableIndex  dataLength   actionId        key                cipher
   2 位        6 位       4 位 Base64    SALT_LENGTH_TABLE[tableIndex] 位   剩余全部
  "07"      "000123"     b64(3 字节)    31–103 位（随机选取）             b64
```

| 项 | 值 |
|---|---|
| 盐长表 | `SALT_LENGTH_TABLE`，**75 项**（下表见[第 4 章](/private-server/04-codec)） |
| `key` 长度 | `SALT_LENGTH_TABLE[tableIndex]`，范围 `31`–`103` |
| `actionId` | 3 字节 → Base64 恰好 4 位；编解码时与 `key[0..2]` 逐字节 XOR |
| 唯一内建校验 | `dataLength` 必须等于明文 UTF-8 **字节数**（不是字符数） |

### 时间格式（三种混用，最容易踩）

| 字段 | 格式 | 示例 |
|---|---|---|
| `server_time` | `yyyy.MM.dd-HH.mm.ss` | `2025.07.06-04.06.03` |
| 卡组 / items 的 `date` | `yyyy-MM-dd HH:mm:ss` | `2025-07-06 04:06:03` |
| 卡牌开箱等 ISO 字段 | ISO-8601，**6 位小数** | `2025-07-06T04:06:03.123456Z` |

### 状态字符串

| 字段 | 取值 |
|---|---|
| `match.status` | `running` / `finished` |
| `player_status_left` / `_right` | `not_done` / `mulligan_done` / `end_match` |
| `match_type` | `battle` / `draft` / `training` |
| `winner_side` / `action_side` / `start_side` | `left` / `right` |
| `location`（开局） | `deck_left` `deck_right` `hand_left` `hand_right` `board_hqleft` `board_hqright` |
| 人机对手 | 参考实现固定 `-9178`；**官服实测是负数族**（`-2000`/`-2010`/`-2020`/`-2030`/`-2040`），名字 `"Fischer"`（[第 13 章](/private-server/13-bot-and-actions)） |
| 卡组码 | 以 `%%` 开头 |

::: tip 两条"强断言"——实测得出，建议写进自检脚本
| 断言 | 依据 |
|---|---|
| **手牌 + 牌库的 `location_number` 在开局时连续覆盖 `0..38`**（手牌 `0..N-1`、牌库接 `N..38`，`N` = 手牌数 4 或 5） | 抓包 82 张牌面逐一核对（[附录 H](/private-server/appendix/client-capture) §5） |
| **换牌后牌库 `location_number` 从 0 重新编号，且替补牌的槽位号 = 被弃牌的槽位号** | [第 13 章](/private-server/13-bot-and-actions) §4 三次换牌实测 |

第一条能抓出"发牌号段给错"，第二条能抓出"换牌后手牌错位"——后者**只在换过牌的局里出现**，靠肉眼很难复现。
:::

::: tip `server_options` 是**字符串**，不是对象
自检脚本必须把它当字符串取出再**二次** `ConvertFrom-Json`。直接当对象解析会失败——这是新手最常写错的一处。详见[附录 C](/private-server/appendix/client-flow)。
:::

## 二、冒烟自检脚本

把下面这段存成 `Test-KardsServer.ps1`，然后：

```powershell
pwsh ./Test-KardsServer.ps1 -Base 'http://127.0.0.1:5231' -User 'tester' -Pass ''
```

它按**客户端真实调用顺序**逐步探测，最后给出汇总表。`-Base` 换成你的地址即可；脚本不写入任何数据（唯一副作用是进出一次匹配队列）。

```powershell
[CmdletBinding()]
param(
    [string]$Base = 'http://127.0.0.1:5231',
    [string]$User = 'tester',
    [string]$Pass = '',
    [int]$WsPort = 5232
)

$ErrorActionPreference = 'Continue'
$Base = $Base.TrimEnd('/')
$script:Results = [System.Collections.Generic.List[object]]::new()
$script:Token   = $null

function Step {
    param([string]$Name, [string]$Chapter, [scriptblock]$Body)
    $detail = ''
    try {
        $detail = & $Body
        if ($null -eq $detail) { $detail = '' }
        $script:Results.Add([pscustomobject]@{ Step = $Name; Ok = $true; Detail = $detail; Hint = $Chapter })
    } catch {
        $script:Results.Add([pscustomobject]@{ Step = $Name; Ok = $false; Detail = $_.Exception.Message; Hint = $Chapter })
    }
}

function Get-Json {
    param([string]$Url, [hashtable]$Headers = @{})
    return Invoke-RestMethod -Uri $Url -Headers $Headers -TimeoutSec 15 -SkipHttpErrorCheck
}

# ── 1. 引导 GET / ──────────────────────────────────────────────
Step 'GET /  引导接口' '02' {
    $r = Get-Json "$Base/"
    if (-not $r.endpoints) { throw '响应里没有 endpoints 对象' }
    $rel = @($r.endpoints.PSObject.Properties | Where-Object { $_.Value -and $_.Value -notmatch '^https?://' })
    if ($rel.Count -gt 0) { throw "endpoints 里存在非绝对地址：$(($rel.Name) -join ', ')" }
    if (-not $r.current_user) { throw '没有 current_user' }
    $cu = $r.current_user
    if ($cu.exp -isnot [int] -and $cu.exp -notmatch '^\d+$') { throw 'current_user.exp 应为数字（用户 ID）' }
    "endpoints 键 $((@($r.endpoints.PSObject.Properties)).Count) 个，全部为绝对地址"
}

# ── 2. 静态配置 ────────────────────────────────────────────────
Step 'GET /.com/config  关服公告' '02' {
    $r = Get-Json "$Base/.com/config"
    if ($null -eq $r.xserver_closed) { throw '缺少 xserver_closed 字段' }
    if ($r.xserver_closed) { throw "服务器处于维护状态：$($r.xserver_closed)" }
    'xserver_closed 为空（正常）'
}

# ── 3. 登录 POST /session ──────────────────────────────────────
Step 'POST /session  登录' '03' {
    $body = @{
        provider                  = 'device'
        provider_details          = @{ payment_provider = 'notavailable' }
        client_type               = 'desktop'
        platform_type             = 'Windows'
        version                   = 'Kards 1.54'
        account_linking           = ''
        language                  = 'zh-Hans'
        automatic_account_creation = $true
        username                  = $User
        password                  = $Pass
    } | ConvertTo-Json -Depth 4
    $r = Invoke-RestMethod -Uri "$Base/session" -Method Post -Body $body `
                           -ContentType 'application/json' -TimeoutSec 15 -SkipHttpErrorCheck
    if (-not $r.jwt)       { throw '响应里没有 jwt' }
    if (-not $r.player_id) { throw '响应里没有 player_id' }
    $script:Token = $r.jwt
    # server_options 必须是「字符串」，内容是 JSON
    if ($r.server_options -isnot [string]) { throw 'server_options 应为字符串（内容是 JSON）' }
    $opts = $r.server_options | ConvertFrom-Json
    $hasWs = $null -ne $opts.websocketurl
    $hasVer = $null -ne $opts.versions
    if (-not $hasWs) { throw 'server_options 里缺 websocketurl（客户端不知道 WS 连哪）' }
    "player_id=$($r.player_id)  jwt=$($r.jwt.Substring(0,[Math]::Min(12,$r.jwt.Length)))…  versions=$(if($hasVer){'有'}else{'缺(版本检查将放行)'})"
}

$H = @{ Authorization = "JWT $($script:Token)" }

# ── 4. 卡牌库 ──────────────────────────────────────────────────
Step 'GET /players/{id}/library  卡牌库' '05' {
    $r = Get-Json "$Base/players/1/library" $H
    if (-not $r.cards -or @($r.cards).Count -eq 0) { throw 'cards 为空：卡组编辑器会显示"未知卡牌"' }
    $bad = @($r.cards | Where-Object { -not $_.id -or -not $_.card_type })
    if ($bad.Count -gt 0) { throw "有 $($bad.Count) 条缺 id / card_type" }
    "cards $((@($r.cards)).Count) 条"
}

# ── 5. 卡组列表 ────────────────────────────────────────────────
Step 'GET /players/{id}/decks  卡组列表' '06' {
    $r = Get-Json "$Base/players/1/decks" $H
    if ($null -eq $r) { throw '响应为空' }
    "headers $((@($r.headers)).Count) 个"
}

# ── 6. 心跳 ────────────────────────────────────────────────────
Step 'PUT /players/{id}/heartbeat  心跳' '05' {
    Invoke-RestMethod -Uri "$Base/players/1/heartbeat" -Method Put -Headers $H -TimeoutSec 15 -SkipHttpErrorCheck | Out-Null
    '返回 200'
}

# ── 7. 进队列 ──────────────────────────────────────────────────
Step 'POST /lobbyplayers  进匹配队列' '07' {
    $body = @{ player_id = 1; deck_id = 1; extra_data = '' } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$Base/lobbyplayers" -Method Post -Headers $H -Body $body `
                           -ContentType 'application/json' -TimeoutSec 15 -SkipHttpErrorCheck
    '已入队'
}

# ── 8. 轮询匹配（单人时预期 null）──────────────────────────────
Step 'GET /matches/v2/?player_id=  轮询' '07' {
    $raw = (Invoke-WebRequest -Uri "$Base/matches/v2/?player_id=1" -Headers $H `
                              -TimeoutSec 15 -SkipHttpErrorCheck).Content
    $t = "$raw".Trim()
    if ($t -eq 'null')  { return 'null（无对手，符合预期；官服即返回 JSON null）' }
    if ($t -eq '{}')    { throw '返回了 JSON {}：客户端会卡在排队转圈，必须返回 null' }
    if ($t -eq '')      { throw '响应体为空' }
    $o = $t | ConvertFrom-Json
    if (-not $o.match) { throw '有响应但缺 match 字段' }
    if ($o.match.actions_url -and $o.match.actions_url -notmatch '^https?://') {
        throw 'match.actions_url 不是绝对地址'
    }
    "匹配到对局 match_id=$($o.match.match_id)"
}

# ── 9. 出队 ────────────────────────────────────────────────────
Step 'DELETE /lobbyplayers  出队' '07' {
    Invoke-RestMethod -Uri "$Base/lobbyplayers" -Method Delete -Headers $H -TimeoutSec 15 -SkipHttpErrorCheck | Out-Null
    '返回 200'
}

# ── 10. WebSocket 端口 ─────────────────────────────────────────
Step "WS 端口 $WsPort" '09' {
    $host_ = ([uri]$Base).Host
    $r = Test-NetConnection -ComputerName $host_ -Port $WsPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $r) { throw "端口 $WsPort 不可达（fyserver 方案则忽略本步，WS 走 $Base 根路径升级）" }
    "TCP 可连"
}

# ── 汇总 ───────────────────────────────────────────────────────
Write-Host ''
$script:Results | Format-Table -AutoSize @{n='';e={if($_.Ok){'✓'}else{'✗'}}}, Step, Detail, @{n='排查章节';e={"[$($_.Hint)]"}}
$fail = @($script:Results | Where-Object { -not $_.Ok })
if ($fail.Count -eq 0) {
    Write-Host "全部 $($script:Results.Count) 步通过 —— 服务端已具备「登录并进入匹配」的最小能力。" -ForegroundColor Green
} else {
    Write-Host "$($fail.Count)/$($script:Results.Count) 步失败，从第一个 ✗ 开始修（后面的失败往往是它的连锁反应）。" -ForegroundColor Yellow
    exit 1
}
```

::: warning 脚本里三个刻意的"严格检查"
1. **`endpoints` 必须是绝对地址**——这是推断结论，脚本把它变成可执行断言（[附录 C](/private-server/appendix/client-flow) 说明了推理依据）；
2. **`server_options` 必须是字符串**——写成对象就会在这一步直接暴露；
3. **未匹配时必须回 `null`**——返 `{}` 是最常见的"排队永远转圈"原因。官服实测返回的是 **JSON `null`**，参考实现回**字符串 `null`**，两种客户端都接受（[附录 F](/private-server/appendix/live-probe)）。
:::

## 三、bash / curl 精简版

只想手敲几条的话，这五条覆盖主干：

```bash
BASE=http://127.0.0.1:5231

# 1) 引导：endpoints 必须是绝对地址，current_user.exp 是用户 ID
curl -s $BASE/ | jq '{endpoints, exp: .current_user.exp}'

# 2) 登录：拿到 jwt
TOKEN=$(curl -s -X POST $BASE/session -H 'Content-Type: application/json' \
  -d '{"provider":"device","username":"tester","password":"","automatic_account_creation":true,"version":"Kards 1.54"}' \
  | jq -r .jwt)

# 3) server_options 是「字符串」→ 再解一次
curl -s -X POST $BASE/session -H 'Content-Type: application/json' \
  -d '{"provider":"device","username":"tester","password":""}' \
  | jq -r '.server_options | fromjson | {websocketurl, versions}'

# 4) 未匹配时回 null（官服为 JSON null，字符串 null 亦可）
curl -s "$BASE/matches/v2/?player_id=1" -H "Authorization: JWT $TOKEN"

# 5) 卡牌库非空
curl -s "$BASE/players/1/library" -H "Authorization: JWT $TOKEN" | jq '.cards | length'
```

## 四、失败了该看哪一章

| 现象 | 最可能的原因 | 章节 |
|---|---|---|
| 第一步 `GET /` 就失败 | 客户端/探测没指向你的服务；或 `endpoints` 给了相对路径 | [02](/private-server/02-bootstrap) |
| 登录 400 | 框架严格校验拒绝了未知字段（关掉 `forbidNonWhitelisted` 或补全 DTO） | [03](/private-server/03-session) |
| 登录成功但一进游戏被登出 | `current_user.exp` 填了时间戳而非用户 ID；或 Go 的 token 一致性检查没过 | [02](/private-server/02-bootstrap) / [03](/private-server/03-session) |
| 收藏界面空 | `/players/{id}/library` 未实现，或条目缺 `card_type`（官服条目里没有卡牌数字 `id`） | [05](/private-server/05-player-data) |
| 排队永远转圈 | `/matches/v2/` 回了 `{}`（必须是 `null`——官服是 JSON null，字符串 null 亦可，但**不能是空对象**） | [07](/private-server/07-matchmaking) |
| 一进牌桌掉线 | `server_options.websocketurl` 指向 `127.0.0.1` 或不可达端口 | [09](/private-server/09-websocket) |
| 动作提交后对手看不到 | 提交/轮询的 codec 参数不一致，或 `dataLength` 校验没过 | [04](/private-server/04-codec) / [08](/private-server/08-match-actions) |
| 胜负不结算 | 没把 `status` 置 `finished`、`player_status_*` 置 `end_match` | [08](/private-server/08-match-actions) |
| 偶发 401 | token 只存"最后一次登录"，多端测试互相踢 | [03](/private-server/03-session) |

完整排查清单见[第 10 章](/private-server/10-deploy)。
