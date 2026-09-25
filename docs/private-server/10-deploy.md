---
title: 10 · 部署与兼容性坑
---

# 10 · 部署与兼容性坑

## 让客户端连上你

客户端硬编码了 `https://kards.live.1939api.com/`。要改指向，只有三条路：

| 方式 | 做法 | 代价 |
|---|---|---|
| **改 exe 字符串** | 定位二进制里的 URL 字面量，等长替换成你的地址 | 每次游戏更新都要重打；换机器要重发 |
| **DNS + 反代 + 可信证书** | 把域名解析到你的机器，签一张该域名的证书并让客户端信任 | 需要能签发并让客户端信任证书，最"干净" |
| **本地代理** | 系统级代理 + 自签根证书 | 移动端/主机端不好做 |

### exe 字符串槽替换

参考工具 `IPRedirection.cpp`（Go 项目里附带的）就是第一种。**它的两个槽位是硬编码的**：

```cpp
constexpr std::streamoff kPrimaryOffset   = 0x7D304A1;
constexpr std::streamoff kSecondaryOffset = 0x7D86238;

const std::string kExpectedPrimary   = "https://kards.live.1939api.com/";
const std::string kExpectedSecondary = "https://kards.live.1939api.com/config";
```

逻辑很直白，值得照抄的三点：

1. **先校验、再写入**：定位到偏移后先比对原字符串，不一致就不动（说明是新版本，偏移变了）；
2. **等长替换**：`replacement.size() <= original.size()`，写入前把整个槽 `std::fill(..., '\0')` 清零，再拷入新地址。**你的地址必须比原地址短**，否则工具直接拒绝；
3. **兜底全量搜索**：固定偏移失配时，在整个文件里搜原字符串并全部替换（应对游戏更新）；
4. 输出到 `kards-Win64-Shipping-Edited.exe`，**永不原地改**。

所以你的地址要尽量短：`http://10.0.0.5:5231` 这类局域网地址最合适（比 `https://kards.live.1939api.com/` 短得多，槽位绰绰有余）。

::: warning 注意 scheme
`http://` 可以，客户端不会强制 TLS。若你走 DNS+反代方案，则必须让客户端信任你的证书，否则请求会被 UE 的 HTTP 层直接拒绝。
:::

## 反向代理

单机部署建议：**业务进程只监听内网，反代对外**。注意 WS 升级和超时设置：

```nginx
server {
    listen 443 ssl;
    server_name kards.example.com;
    ssl_certificate     /etc/ssl/kards.crt;
    ssl_certificate_key /etc/ssl/kards.key;

    # HTTP 与 WebSocket 同一个 upstream（fyserver 式合并部署）
    location / {
        proxy_pass http://127.0.0.1:5231;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;      # ← WS 升级
        proxy_set_header Connection "upgrade";          # ← 不设这两行 WS 握手必失败
        proxy_set_header Host       $host;
        proxy_set_header X-Real-IP  $remote_addr;

        proxy_read_timeout  300s;                       # ← 别用默认 60s，会掐断长连接
        proxy_send_timeout  300s;
    }
}
```

::: tip 独立 WS 端口（5232）要单独放行
如果沿用 Go/TS 的"两个端口"方案，**别忘了 `server_options.websocketurl` 里的地址必须是客户端可达的**——写成 `ws://127.0.0.1:5232/ws` 只有本机能连。参考实现为此专门区分了两个概念：

```csharp
public string GetAddressHttp()  => $"http://0.0.0.0:{portHttp}";   // 监听地址
public string GetAddressHttpR() => $"http://{ip}:{portHttp}";      // 下发给客户端的可达地址
```

`ip` 配错是"能登录但一进牌桌就掉线"的最常见原因。
:::

## 配置清单

三个实现的关键配置项，**加粗的是必须改的默认值**：

| 项目 | 配置 |
|---|---|
| `kardsservergo`（config.yaml） | `port: 5231`、`ip`、`wsport: 5232`、**`jwt_key`**（默认值是一句调侃，必须换）、`jwt_algorithm: HS256`、`jwt_expiry: 24h`、**`admin_password`**、`game_versions`（客户端版本白名单）、`database_path`、`library_json_path`、`items_json_path` |
| `fyserver`（setting.json） | `portHttp: 5231`、`ip`（下发地址）、`bancheat`、**`adminApiKey`**（空时管理接口仅允许 loopback） |
| NestJS 版（config.ts） | `ip`、`port: 5231`、`ws_port: 5232`、`ban_cheat` |

::: warning 密码与密钥
三个项目的默认值都是公开的（`jwt_key` 甚至是一句吐槽字符串，`admin_password: change-this-password`）。**用默认密钥上线 = 任何人都能自己签一个 `user_id: 1` 的 token 直接登录。**
:::

## 兼容性检查清单

排障时按这张表逐条过。**每一条都是真实踩过的坑**，前面各章都有出处：

| # | 症状 | 原因 | 章节 |
|---|---|---|---|
| 1 | 客户端登录白屏 | 响应结构与客户端预期不符（先核对 `/session` 是否下发了 `jwt`/`jti`/`player_id`）。**顺带纠正**：`Content-Type` 带 `charset=utf-8` **不是**原因——官服 `/config` 自己就带 charset | [02](/private-server/02-bootstrap) · [F](/private-server/appendix/live-probe) |
| 2 | 部分请求 404 | 路径出现 `//` 未归一化；或尾斜杠差异（`/matches/v2/{id}/`、`/decks/`） | [02](/private-server/02-bootstrap) |
| 3 | 进游戏后立刻被登出 | `current_user.exp` 填了时间戳而非**用户 ID**；或 `iat` 与服务端 token 的 `exp` 相差 > 24h | [02](/private-server/02-bootstrap) |
| 4 | 解析崩溃 | `server_options` 发成了 JSON **对象**而非**字符串** | [03](/private-server/03-session) |
| 5 | 排队一直转圈 | `GET /matches/v2/` 没匹配时返回了 JSON `null` 而不是字符串 `null` | [07](/private-server/07-matchmaking) |
| 6 | 动作重复播放 | 轮询时 `actions` 空数组也发了 key（正确做法：**省略该 key**） | [08](/private-server/08-match-actions) |
| 7 | 换牌后手牌错乱 | 换牌只改了返回值，没同步内存中的 `hand` | [08](/private-server/08-match-actions) |
| 8 | 一进牌桌就掉线 | `server_options.websocketurl` 指向了 `127.0.0.1` 或不可达端口 | 本章 |
| 9 | WS 握手失败 | 反代没转发 `Upgrade`/`Connection`；或服务端没回 `Sec-WebSocket-Protocol: ws` | [09](/private-server/09-websocket) |
| 10 | 断线重连后无限循环 | `GET /matches/v2/reconnect` 没有可重连对局时返回了 `{}`；或重连后仍判了投降 | [09](/private-server/09-websocket) |
| 11 | 胜负不结算 | 判负时没把 `status` 置 `finished`、双方 `player_status_*` 置 `end_match`（`DamageCard` 补刀只是旧 JS 实现的兼容做法，非必需） | [08](/private-server/08-match-actions) |
| 12 | 收藏界面空、卡组编辑器打不开 | `/players/{id}/library` 没实现；或条目缺 `card_type`（官服以**资产名**为主键，条目里**没有卡牌数字 `id`**，只有 `player_id`） | [05](/private-server/05-player-data) · [F](/private-server/appendix/live-probe) |
| 13 | 切换国家时卡背被清 | 装备去重只比了 `slot`，没比 `(slot, faction)` | [05](/private-server/05-player-data) |
| 14 | 偶发 401 | token 存的是"最后一次登录"的，旧 token 立刻失效（单点登录）；多端测试时会互相踢 | [03](/private-server/03-session) |
| 15 | 时间字段解析报错 | 三种格式混用：ISO 6 位小数（卡组时间）、`2025.07.06-04.06.03`（`server_time`）、`yyyy-MM-dd HH:mm:ss`（items 的 `date`） | [05](/private-server/05-player-data) |
| 16 | 老客户端接口 404 | 少了参考实现的兼容别名：`/librarynew`、`/store/`、`/store/txn`。**注意这些别名官服并不存在**（`/librarynew`、`/.com/config` 在官服均为 404），只为兼容旧客户端 | [05](/private-server/05-player-data) · [F](/private-server/appendix/live-probe) |

## 排障方法

**1. 日志要无脑多打。** 三个参考实现都塞满了 `Console.WriteLine`——看起来脏，但对局协议就是这样调出来的：把每个请求的路径、解密后的动作、轮询返回都打出来，比对两侧。

**2. 用真实客户端 + 代理抓包。** 抓到"已知良好样本"后，本地复现请求对比字段。第 1 章的验证闭环在这里最有用。

**3. 二分删字段。** 解析失败时先返回最小对象，再逐字段加回去——比读日志快。

**4. 对局问题先怀疑序号。** `current_action_id`、`min_action_id`、`action_id` 三者错一个，表现就是"动作丢失/重复/对手卡住"。

## 上线前的最后三件事

1. **换掉所有默认密钥/口令**（本节配置清单）；
2. **对局状态目前是内存态**——重启即丢、也无法多实例横向扩展。参考实现分别用 FasterKV / SQLite / LevelDB 只持久化"用户与卡组"，对局在内存里。要重连容灾，得把 `MatchInfo` 也持久化；
3. **确认离线判负逻辑幂等**，并给移动端留宽限期（第 9 章）。

---

到这里协议闭环了。回[总览](/private-server/)可以按章节跳转；想补充某个接口，先按第 1 章的三路取证确认字段，再动手写。
