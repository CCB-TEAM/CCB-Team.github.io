---
title: 附录 F · 官服实测对照
---

# 附录 F · 官服实测对照（2026-09-25）

前面所有章节描述的是"客户端**期望**什么"。这一页是反过来的：**直接问官服**——用真实客户端形态的请求打 `kards.live.1939api.com`，看它实际返回什么。

::: warning 方法论差异
本页不是中间人抓包，而是**直接以客户端身份调用官服接口**。对"字段名/大小写/类型/格式"这类问题，这比抓包更直接（没有代理层干扰）；但它**看不到客户端发了什么**（例如对局中的 `action_data`），那部分仍需抓包。两类方法的边界见[附录 E](/private-server/appendix/open-questions)。
:::

::: danger 隐私与凭据处理
探测使用**本人账号的设备凭据**，仅调用只读接口（登录、`/config`、图书库），未发起任何对局、未修改任何账号数据。本页所有个人字段（`player_id` / `user_id` / `player_name` / `player_tag` / 邮箱 / jwt / 设备凭据）均已打码；`wc_qualifiers_1` 的值含其他玩家昵称，一并省略；官服返回的内部主机信息（内网 IP / 实例 ID / 容器名）以占位符表示。
:::

## 1. 请求前置：两个必带的 API Key 头

**这是此前文档完全缺失的一环。** 不带它，连 `GET /` 都直接 401：

| 头 | 值格式 |
|---|---|
| `Drift-Api-Key` | `<app-key>:<客户端版本串>` |
| `X-Api-Key` | 同上（两个头都带，值相同） |

```http
GET / HTTP/1.1
Host: kards.live.1939api.com
Drift-Api-Key: 1939-kards-<hash>:Kards 1.48.24871.launcher
X-Api-Key:     1939-kards-<hash>:Kards 1.48.24871.launcher
```

`<app-key>` 是客户端内置的应用标识（形如 `1939-kards-<10 位十六进制>`），版本串是 `Kards <主>.<次>.<构建>.<渠道>`（如 `Kards 1.48.24871.launcher`、`Kards 1.46.24674.APK`）。两者都能从客户端二进制里取出。

::: tip 头名字本身就是线索
`Drift-Api-Key` 印证了客户端那层自定义 HTTP 栈叫 **Drift**——与[附录 C](/private-server/appendix/client-flow) 里从蓝图看到的 `OnDriftResponse` 是同一套东西。
:::

## 2. 鉴权边界（逐条实测）

| 请求 | 无 API Key | 带 API Key | 带 Key + JWT |
|---|---|---|---|
| `GET /` | 401 | **200**（`current_user: null`） | 200（`current_user` 填充） |
| `GET /config` | 401 | **200** | 200 |
| `GET /.com/config` | 401 | **404** | 404 |
| `GET /players/{id}/library` | 401 | 401 | **200** |
| `GET /players/{id}/decks` `…/heartbeat` `…/achievements` `…/dailymissions` `…/packs` | 401 | 401 | 200 |
| `GET /matches/v2/…` `GET /store/` | 401 | 401 | 200 |
| `POST /session` | 401 | **200**（登录成功） | — |

两种 401 的文案不同，可据此判断卡在哪一层：

- **缺 API Key**：`The server could not verify that you are authorized to access the URL requested…`（Werkzeug 默认文案，指向前置校验）
- **缺 JWT**：`Authorization Required. Request does not contain an access token.`

**修正项**：`/.com/config` 在官服是 **404**——它只是参考实现自造的兼容路径，**不是**官服接口。官服的配置口只有 `/config`（与客户端 IPRedirection 里那两个字符串槽一致）。

## 3. 登录：`provider` 是 `device_id`，不是 `device`

这是本轮最重要的纠正。用 `provider: "device"` 会得到：

```json
{"error":{"code":"user_error","description":"Bad Request. Unknown provider 'device'. Only 'jwt' and 'jti' are supported"},"message":"Unauthorized","status_code":401}
```

而**真实客户端发的完整 DTO** 如下（值为占位符）：

```jsonc
// POST /session
{
  "provider": "device_id",              // ← 关键：不是 "device"
  "provider_details": { "payment_provider": "XSOLLA" },
  "client_type": "UE5",                 // ← 不是 "desktop"
  "build": "Kards 1.48.24871.launcher",
  "platform_type": "Windows",
  "app_guid": "Kards",
  "version": "Kards 1.48.24871.launcher",
  "platform_info": "{\"device_profile\":\"Windows\",\"cpu_vendor\":\"…\",\"gpu_brand\":\"…\",\"num_cores_physical\":6,\"num_cores_logical\":12,\"physical_memory_gb\":16,\"hash\":\"<设备指纹哈希>\",\"locale\":\"zh-CN\"}",
  "platform_version": "Windows 11 (24H2) [10.0.26100.7171] ",
  "account_linking": "",
  "language": "zh-Hans",
  "automatic_account_creation": true,
  "username": "device:Windows-<时间戳>",   // 设备身份
  "password": "<另一时间戳>"
}
```

与正文（第 2、3 章）的 DTO 相比，官服版本多了 `build` / `app_guid` / `platform_info` / `platform_version`，且 `client_type` 为 `UE5`。

### `provider` 的取值边界

| 请求 | 结果 |
|---|---|
| `provider: "device"` | 401 `Unknown provider 'device'` |
| `provider: "device_id"` + 设备凭据 | **200，登录成功** |
| `provider: "jti"` + 任意 UUID | 401 `Bad Request. Invalid JTI.`（jti 必须是官服**签发过**的） |
| `provider: "jwt"` + 伪造 JWT | **500**（未捕获异常，见第 9 节） |
| `GET /` + 设备凭据做 Basic 认证 | 401（设备凭据不能当 HTTP Basic 用） |

### 字段校验：只有两个必填

空 body 的 422 直接把 schema 列了出来（`messages.json.<字段>` 是 **marshmallow** 的报错结构，说明官服后端是 **Python / Flask + marshmallow**——与三套参考实现的语言都不同）：

```json
{"error":{"code":"user_error","description":"…","messages":{"json":{
  "provider":["Missing data for required field."],
  "provider_details":["Missing data for required field."]}},"status_code":422}}
```

即 **`provider` + `provider_details` 必填，其余全部可选**。这与正文"服务端其实只关心 username/password"的说法不同——官方校验的是 provider 组合。

## 4. `POST /session` 响应：约 70 个**扁平**字段

顶层没有 `current_user`、也没有 `endpoints` 嵌套；`current_user`/`endpoints` 只在 `GET /` 里。按用途分组：

| 分组 | 字段 |
|---|---|
| 会话令牌 | `jwt` `jti` |
| 身份 | `client_id` `user_id` `player_id` `player_name` `player_tag` `email` `email_verified` `email_reward_received` `locale` |
| 货币与进度 | `currency`（ISO 字符串 `"USD"`）`gold` `dust` `diamonds` `stars` `season_id` `season_wins` `season_end` `draft_admissions` `login_rewards_type` |
| 五国等级 | `britain_` / `germany_` / `japan_` / `soviet_` / `usa_` × `_level` `_level_claimed` `_xp` ——**只有这五国**，印证[附录 B](/private-server/appendix/decompile-notes) 的 `GetCurrentFactionLevel` |
| 卡组 | `decks`（`{ "headers": [ … ] }`）`decks_url` |
| 子资源 URL | `achievements_url` `dailymissions_url` `heartbeat_url` `library_url` `packs_url` |
| 服务端配置 | `server_options`（**字符串，内容是 JSON**）`server_time` |
| 军官 / 在线 | `is_officer` `has_been_officer` `is_online` `online_flag` |
| 赛事 | `all_knockout_tourneys` `current_knockout_tourney` `current_mini_sit_n_go` |
| 奖励与邮件 | `8_day_rewards`（键 `"1"`…`"8"`）`rewards`（**数组**，元素 `{reason, season_id}`）`new_player_login_reward`（`{day, reset, seconds}`）`claimable_crate_level` `last_crate_claimed_date` `new_cards` `launch_messages` |
| 教程 | `tutorials_done` `tutorials_finished`（**字符串数组**，如 `unlocking_germany_1`） |
| 其他 | `show_eula` `cards_blacklist` `misc`（`{createDate}`）`last_logon_date` `last_daily_mission_cancel` `last_daily_mission_renewal` `double_xp_end_date` |

两点值得注意：

- **所有 `*_url` 都是绝对地址**，且**内嵌了 player_id**（`https://kards.live.1939api.com/players/<id>/library`）。
- `rewards` 在官服是**数组**；正文示例给了 `{packages, gold_max, gold_min}` 形态，属参考实现的自定义，客户端对此宽容。

## 5. `server_options`：**150 个键**

长度约 **64 KB** 的 JSON 字符串。附录 B 统计的"蓝图读取的 25 个键"只是其中一小部分（其余由 C++ 层读取）。几个高价值条目：

| 键 | 官服值 | 意义 |
|---|---|---|
| `websocketurl` | `wss://ws.live.1939api.com/ws` | 官方实时通道在**独立主机 + `/ws` + TLS**，不是 5232 |
| `versions` | `["Kards 1.60"]` | 版本白名单只有一项；详见第 8 节 |
| `key_encryption` | `182489` | 与 Drift 加解密层相关的数值（[附录 A](/private-server/appendix/uht-structs) 的 SALT 表之外的另一处密钥源） |
| `validate_turn_switches` | `1` | 回合切换校验开关 |
| `surrender_disabled_at_start` | `1` | 开局禁止投降 |
| `idel_disconnect_minutes` | `51` | 断线判负分钟数（键名拼写就是 `idel`，官服原样） |
| `battle_wait_time` | `60` | 匹配等待秒数 |
| `response_zero_max_retries` | `10` | 空响应重试次数 |
| `appscale_desktop_min/max` | `1` / `1.4` | 缩放区间 |
| `appscale_tablet_default` | `1.1` | 平板默认缩放 |
| `eula_version` | `1` | EULA 版本 |
| `stop_giving_ai_battles_after_rank` | `17` | 多少级后不再给 AI 对局 |
| `use_oc_redis_set` | `1` | 内部实现细节外泄到客户端配置 |
| `wc_qualifiers_1` | *(省略：含其他玩家昵称)* | 赛事资格名单 |

**全部 150 个键名**（按字母序，便于对照自建服务的下发内容）：

```text
account_linking_show_in_settings, account_linking_url, achievements, always_query_transactions,
android_apk_noiap_link, android_apk_noiap_link_enabled, android_share_link, anzac,
apk_1939_provider_url, apk_233_provider_url, apk_4399_noiap_provider_url, apk_4399_provider_url,
apk_haoyou_noiap_provider_url, apk_haoyou_provider_url, apk_jiuyou_noiap_provider_url,
apk_jiuyou_provider_url, apk_mohe_provider_url, apk_qiyou_provider_url, apk_tiandi_provider_url,
apk_wfgame_provider_url, appscale_desktop_default, appscale_desktop_max, appscale_desktop_min,
appscale_mobile_default, appscale_mobile_max, appscale_mobile_min, appscale_tablet_default,
appscale_tablet_max, appscale_tablet_min, avatars, battle_pass_subscription, battle_wait_time,
beta_expiry_date, broken_deck_check, brothers_in_arms_date, brothers_in_arms_is_here_gift_urls,
buddy_program_invite_link, christmas, christmas_music, christmas_snow, content_restructure_store,
covert_ops_date, crate_hour, crate_weekday, current_extended_8_day_offer, diamonds,
disable_custom_wrapping, disable_review_window, disable_right_click_in_battle, disable_simulation,
disable_tournament, discount_products, do_action_mingling, draft_card_limits,
enable_bond_highlight, enable_chat, enable_japanese, enemy_profile, eula_version,
extended_8_day_rewards, feature_collection_cardhelpcache,
feature_compact_action_values_only_enabled, feature_copy_battleready_decks_enabled,
feature_epic_iap_enabled, feature_marketing_checkbox, feature_socketerror_popup_enabled,
feature_vfx_preloading_enabled, feature_virtual_keyboard, finland, first_purchase_bonus_date,
forgot_password_url, front_page_data, get_recent_opponents, give_guest_name, halloween,
halloween_music, homefront_date, idel_disconnect_minutes, invite_friends_button, ios_share_link,
is_create_callsign_after_tutorial, key_encryption, korean_stove_only, leaderboard_visuals,
locked_cards, logger_disabled, maintenance_mode_check_on_enter_foreground, mobile_local_notifications,
mobile_showcase_delay, monitor_battle, more_filters, most_popular_products, naval_warfare_date,
new_effect_bar_pc, new_effect_icons, new_medkits, new_premade_decks, new_rewards, new_xpbar,
nui_desktop, nui_mobile, oceania_storm_date, presale_packs, reconnect, reduce_reward_animation_fps,
reserve_changes, reserved_system_compensation_urls, response_zero_max_retries, resync_without_restart,
returning_player_rewards, review_lost, review_url_de, review_url_en, review_url_fr, review_url_pl,
review_url_pt, review_url_ru, review_url_zh, review_wins, salvage_enabled, scalability_override,
shop_2023, shop_full_image, show_rewards_after_purchase, skip_draw_delay, skip_sending_subactions,
skip_unlocking, solsten_survey_enabled, solsten_urls, stop_giving_ai_battles_after_rank,
surrender_disabled_at_start, tournament_id, tow_show, use_manual_redraw, use_oc_redis_set,
use_tutorial_handpointer, validate_turn_switches, versions, vertical_shop, wc_button, wc_cutoff,
wc_qualifiers_1, wc_steam_url, webshop_debug, webshop_epic, webshop_url, websocketurl,
windows_share_link, winter_war_date, winter_war_is_here_gift_urls
```

::: details 关于"下发了多少"这件事
自建服务只发十几个键也能进游戏，是因为客户端对缺键**取默认值**。但要注意两处例外：`versions` 缺失时版本闸门**放行**（[附录 B](/private-server/appendix/decompile-notes)），而 `appscale_desktop_min` / `appscale_tablet_default` / `appscale_tablet_max` 缺失时 UI 缩放会走默认值——官服这三个都发。
:::

## 6. JWT：RS256 + 15 个 claim

```jsonc
// header
{"alg":"RS256","typ":"JWT"}     // ← 非对称签名，不是 HS256；签名段 342 字符
// payload claims
user_name, user_id, identity_id, provider, external_id, payment,
roles, iat, exp, jti, iss, tier, language, client_id, player_id
```

| 观察 | 值 | 意义 |
|---|---|---|
| `alg` | `RS256` | 官服用**私钥签名**；私服手搓 token 时若声明 RS256 却用 HS256 签，一旦客户端校验就会失败 |
| `iss` | `kards-backend` | 签发者 |
| `exp − iat` | **恰好 86400** | 令牌有效期 24 小时（与 `kardsservergo` 的 `jwt_expiry: 24h` 一致） |
| `provider` | `device` | **注意**：请求里是 `device_id`，令牌 claim 里是 `device`——两个名字指的是同一件事，别被绕晕 |
| `jti` | 20 字符非十六进制串 | 与响应体里的 `jti` 是同一个值，用于会话续期 |

这解释了为什么三套参考实现手工拼的 token 能用：**客户端不校验签名**（与[附录 E](/private-server/appendix/open-questions) 第 5 条的推断一致），`provider: "device"` 也正是从 claim 里抄来的。

## 7. 卡牌库：对象 `{cards, new_cards}`，条目主键是 `card_type`

```jsonc
// GET /players/{id}/library
{
  "cards": [
    { "card_type": "card_event_carpet_bombing", "count": 1, "gold_card_count": 0,
      "player_id": <打码>, "recently_crafted_count": 0 }
  ],
  "new_cards": []
}
```

| 字段 | 说明 |
|---|---|
| `card_type` | 卡牌资产名——**这是条目主键** |
| `count` / `gold_card_count` | 持有数量 |
| `player_id` | 该行归属的玩家 |
| `recently_crafted_count` | 近期合成数（UI 高亮） |

**修正项**：条目里**没有 `id` 字段**（正文示例曾给 `"id": 1024`）——卡牌是用 `card_type` 资产名标识的，数字编码只存在于客户端内置的卡组码映射表（`deckCodeIDsTable`）里。外层 `{ "cards": […], "new_cards": [] }` 与正文一致，**没有错**。

::: danger 本页曾把这里写成"裸数组"，那是我的误读
本页初版声称官服返回的是顶层数组。实际是自己诊断脚本的输出（打印的是 `cards` 属性的值，而非响应体本身）被误读。经复测：**外层是对象**，字段为 `cards` / `new_cards`。特此更正，并把第 5 章改回原样（仅保留 `id` → `player_id` 的修正）。
:::

## 8. 卡组头与卡组码：实测语法

```jsonc
// decks.headers[i]
{ "id": <deck_id>, "name": "…", "player_id": <打码>,
  "main_faction": "japan", "ally_faction": "germany",      // 字符串，不是数字
  "card_back": "cardback_starter_japan", "favorite": false,
  "deck_code": "%%31|2S2Z4p5u6B6C6K6Y7179;2O3L4n5N5Z6L6Q6R6x7l7m7o7q;72;~;;;|6l1g",
  "create_date": "2026-02-16T11:05:52.…Z", "modify_date": "…", "last_played": "…" }
```

实测两份卡组码，证实了第 6 章的位段规则：

```text
%%31|2S…;2O…;72;~;;;|6l1g        main=japan(3)  ally=germany(1)
%%45|7J…;7E…;7H…;~;;;|8v1i       main=soviet(4) ally=usa(5)
```

- `%%<主国><盟国>`：数字取自 `EFactionEnum`，**主国在前、盟国在后**（`31` = 日本主 / 德国盟）；
- 之后 **`;` 分隔 7 个卡牌槽**，第 4 槽（下标 3）固定是 `~`；
- **HQ 段用 `|` 引出**（`|6l1g`），不是用 `|` 分隔普通卡组；
- 槽内每张牌是**两个字符**的编码（对应 `deckCodeIDsTable` 的 `deck_code_id`），与 `card_type` 资产名无关。

**修正项**：`main_faction` / `ally_faction` 在官服是**小写字符串**（`"japan"`），不是数字枚举——卡组码里的数字只是它的编码。

顺带确认版本闸门：官服 `versions` 是 `["Kards 1.60"]`，而登录 DTO 里的 `version` 是 `Kards 1.48.24871.launcher`，**该组合登录成功**。这说明闸门比的**不是** DTO 里那个 `version` 字段，而是客户端项目版本（`Kards 1.60`）——对上了[附录 B](/private-server/appendix/decompile-notes) 的"前缀匹配 `versions`"。

## 9. 时间格式：三种，且**出现在同一份响应里**

这是第 10 章"三种格式混用"的直接证据——不是不同接口各用一种，而是同一份 `/session` 响应内部就混着：

| 格式 | 实例 | 出现字段 |
|---|---|---|
| 点分 | `2026.09.25-06.03.07` | `/session` 的 `server_time` |
| ISO + 6 位小数 + `Z` | `2026-04-06T04:33:21.181264Z` | `last_logon_date`；`misc.createDate` |
| ISO 无小数 | `2026-03-08T11:00:00` | `cards_blacklist[].end_date` |
| 空格分隔 | `2026-08-26 06:03:07` | `new_player_login_reward.reset`；`season_end` 一类 |

另外 `GET /` 的 `server_time` 是 **ISO + 6 位小数**（`2026-09-25T06:00:00.420343Z`），与 `/session` 的点分**同名不同格式**——同名键在两条接口上格式不同，这是最容易踩的坑。

## 10. 其它实测结论

- **`Content-Type`**：官服自己就不统一——`GET /` 与 `/session` 返回 `application/json`（无 charset），而 `/config` 返回 **`application/json; charset=utf-8`**。客户端要正常显示维护公告就必须解析得动它，**所以客户端能接受 charset**。正文第 2 章"不能带 charset"的说法据此**修正**：去掉 charset 无害，但并非客户端要求。
- **维护开关不拦登录**：探测时 `xserver_closed` 非空（维护窗口内），`POST /session` 仍返回 200。维护提示是**客户端侧展示**逻辑，不是登录闸门。
- **`GET /` 暴露内部信息**：响应含 `host_info`（内网 IP、EC2 实例 ID、Docker 容器名、ECR 镜像路径）与 `build_info.commit_hash`。属于**信息泄露**类问题，对攻击者有价值；此处不列出真实值。
- **畸形 JWT 触发 500**：`provider: "jwt"` + 伪造令牌得到 `Internal Server Error`（带 `context_id`），而非 400/401——异常未捕获。若客户端/攻击者可控该字段，属于可观察的服务端健壮性缺陷。
- **`/librarynew` 不存在**：官服返回 404。该别名只是参考实现为老客户端准备的兼容路径（见第 5 章修正）。

## 11. 本次**未能**验证的部分

保持边界诚实：

| 项 | 原因 |
|---|---|
| 对局中的 `action_data` 真实形状 | 需要实际进一场对局并抓包；本次只做只读探测 |
| WebSocket 帧格式（`ping` / `touchcard` / 通知） | 同上，且本次未连 WS |
| 支付/商店链路（Xsolla、`provider_details.payment_provider`） | 会产生真实交易，不探测 |
| `provider: "jti"` 的正确用法 | 需要一个官服签发过、未过期的 jti 才能验证续期语义 |
| `platform_info.hash` 的算法 | 只是设备指纹字段，逻辑在客户端 |

上述任一项如需推进，请用**抓包**而非直连接口——直连看不到客户端上行。
