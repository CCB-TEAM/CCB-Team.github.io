---
title: 03 · 登录与会话
---

# 03 · 登录与会话

`POST /session` 是整个协议里**字段最多、最容易翻车**的一个接口：它同时承担登录、建号、下发全部初始数据三件事。

## 请求

客户端发的字段比服务端需要的多得多。完整请求体（来自参考客户端的 DTO）：

```jsonc
{
  "provider": "device",
  "provider_details": { "payment_provider": "notavailable" },
  "client_type": "desktop",
  "build": "…",
  "platform_type": "Windows",
  "app_guid": "…",
  "version": "Kards 1.54",
  "platform_info": "…",
  "platform_version": "…",
  "account_linking": "",
  "language": "zh-Hans",
  "automatic_account_creation": true,
  "username": "vekolyram",
  "password": ""
}
```

::: tip 服务端其实只关心两个字段
Go 实现只绑定 `username` / `password` 两个字段，其余全部忽略。**但不要只回字段名不认就报错**——不少框架的严格校验器会因为未知字段返回 400。要么关掉 `forbidNonWhitelisted`，要么把 DTO 写全。
:::

## 响应：`SessionResponse`

字段顺序与官方示例一致，**按字母序**排列：

| 分组 | 字段 |
|---|---|
| 身份 | `client_id` `user_id` `player_id` `player_name` `player_tag` `jti` `jwt` `locale` `currency` |
| 货币/进度 | `gold` `dust` `diamonds` `stars` `season_id` `season_wins` `season_end` |
| 五国等级 | `germany_level` `germany_level_claimed` `germany_xp`（同构：`britain_` / `japan_` / `soviet_` / `usa_`） |
| 卡组 | `decks`（`{ "headers": [...] }`） |
| 子资源 URL | `achievements_url` `dailymissions_url` `decks_url` `heartbeat_url` `library_url` `packs_url` |
| 服务端配置 | `server_options`（**字符串，内容是 JSON**） `server_time` `versions` |
| 杂项 | `misc` `rewards` `new_player_login_reward` `cards_blacklist` `launch_messages` `tutorials_done` `tutorials_finished` |

一个能过客户端的最小响应：

```jsonc
{
  "client_id": 1, "user_id": 1, "player_id": 1,
  "player_name": "<anon>", "player_tag": 1234,
  "jti": "1", "jwt": "<token>", "locale": "zh-Hans", "currency": "USD",
  "gold": 999999, "dust": 1000, "diamonds": 99999, "stars": 120,
  "britain_level": 500, "britain_level_claimed": 500, "britain_xp": 0,
  "germany_level": 500, "germany_level_claimed": 500, "germany_xp": 0,
  "japan_level":   500, "japan_level_claimed":   500, "japan_xp":   0,
  "soviet_level":  500, "soviet_level_claimed":  500, "soviet_xp":  0,
  "usa_level":     500, "usa_level_claimed":     500, "usa_xp":     0,
  "decks": { "headers": [] },
  "decks_url": "http://127.0.0.1:5231/players/1/decks",
  "library_url": "http://127.0.0.1:5231/players/1/library",
  "heartbeat_url": "http://127.0.0.1:5231/players/1/heartbeat",
  "server_options": "{\"nui_mobile\":1,\"battle_wait_time\":60,\"websocketurl\":\"ws://127.0.0.1:5232/ws\"}",
  "server_time": "2025.07.06-04.06.03",
  "tutorials_done": 0,
  "tutorials_finished": [],
  "is_officer": true, "has_been_officer": true, "is_online": true, "online_flag": true,
  "email": null, "rewards": { "packs": 0, "gold_max": 0, "gold_min": 0 },
  "new_cards": [], "cards_blacklist": [], "launch_messages": [],
  "misc": { "createDate": "2025-07-02T11:24:15.529671Z", "featuredAchievements": [] }
}
```

::: tip `server_options` 是字符串
它的值是一段**序列化后的 JSON 文本**，不是 JSON 对象。`websocketurl` 就在里面——这是服务端告诉客户端"实时通道去哪连"的唯一途径。三个实现都这么干：

```go
// Go：结构体 → string → 塞进响应
serverOptionsBytes, _ := json.Marshal(opts)
// opts.WebsocketURL = fmt.Sprintf("ws://%s:%d/ws", config.Host, config.WSPort)
```

```csharp
// C#：直接写模板字符串
ServerOptions = $"{{\"nui_mobile\":1,\"battle_wait_time\":60,\"websocketurl\":\"ws://{ip}:{port}\"}}"
```
:::

## 签发 token

身份不是"用户名"，而是**服务端签发的一串 token**。客户端把它存下来，之后所有请求都带：

```http
Authorization: JWT <token>
```

参考实现有两种截然不同的设计：

| 方案 | 实现 | token 内容 | 校验方式 |
|---|---|---|---|
| **真 JWT** | `kardsservergo` | HS256，claims = `{user_id, username, exp}` | 验签 + 与库里的 `PlayerJWT` **全等比对** |
| **codec token** | `fyserver` | `codec.Encode(username, 114)` | 解出用户名 → 查库 |

### 方案 A：HS256 JWT（推荐）

::: code-group

```csharp [C#]
// Services/AuthService.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

public class AuthService
{
    private readonly byte[] _key = Encoding.UTF8.GetBytes("换成你自己的长随机串");
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    public string Issue(int userId, string userName)
    {
        var creds = new SigningCredentials(new SymmetricSecurityKey(_key), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            claims: new[]
            {
                new Claim("user_id", userId.ToString()),
                new Claim("username", userName),
            },
            expires: DateTime.UtcNow.Add(Ttl),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>校验签名与有效期，返回 userId；失败返回 null。</summary>
    public int? Validate(string token)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(_key),
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(1),
            }, out _);
            var raw = principal.FindFirst("user_id")?.Value;
            return int.TryParse(raw, out var id) && id > 0 ? id : null;
        }
        catch { return null; }
    }
}
```

```typescript [TypeScript]
// src/session/auth.service.ts
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET ?? '换成你自己的长随机串';
const TTL = '24h';

@Injectable()
export class AuthService {
  issue(userId: number, userName: string): string {
    return jwt.sign({ user_id: userId, username: userName }, SECRET, { expiresIn: TTL, algorithm: 'HS256' });
  }

  /** 校验签名与有效期，返回 userId；失败返回 null */
  validate(token: string): number | null {
    try {
      const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as { user_id?: number };
      return payload.user_id && payload.user_id > 0 ? payload.user_id : null;
    } catch {
      return null;
    }
  }
}
```

:::

::: warning 为什么还要和数据库里的 token 全等比对
Go 实现在验签之后多做了一步：`user.PlayerJWT != tokenStr → 401`。这样**每次登录都会让旧 token 立即失效**（单设备登录）。如果你希望多端同时在线，去掉这一步即可；保留则更接近官方行为。
:::

### 鉴权中间件

所有非白名单接口都要过这一关。白名单只有三个：`/`、`/session`、`/.com/config`。

::: code-group

```csharp [C#]
// Middleware/JwtAuthMiddleware.cs
public class JwtAuthMiddleware(RequestDelegate next, AuthService auth, UserStoreService users)
{
    private static readonly HashSet<string> Public = new(StringComparer.OrdinalIgnoreCase)
        { "/", "/session", "/.com/config" };

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (Public.Contains(ctx.Request.Path.Value ?? "")) { await next(ctx); return; }

        var header = ctx.Request.Headers.Authorization.ToString();
        var token = header.StartsWith("JWT ", StringComparison.Ordinal) ? header[4..]
                  : header.StartsWith("Bearer ", StringComparison.Ordinal) ? header[7..]
                  : header;

        var userId = token.Length == 0 ? null : auth.Validate(token);
        var user = userId is null ? null : await users.GetByIdAsync(userId.Value);
        if (user is null || user.PlayerJwt != token)
        {
            // 注意：401 的响应体也要是 JSON
            ctx.Response.StatusCode = 401;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync("""{"title":"401 Unauthorized","description":"Warning"}""");
            return;
        }

        ctx.Items["user"] = user;
        await next(ctx);
    }
}
```

```typescript [TypeScript]
// src/session/auth.middleware.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { users } from '../user';

const PUBLIC = new Set(['/', '/session', '/.com/config']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (PUBLIC.has(req.path)) return true;

    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('JWT ') ? header.slice(4)
                : header.startsWith('Bearer ') ? header.slice(7)
                : header;
    if (!token) throw new UnauthorizedException({ title: '401 Unauthorized', description: 'Warning' });

    const userId = this.auth.validate(token);
    if (!userId) throw new UnauthorizedException({ title: '401 Unauthorized', description: 'Warning' });

    const raw = await users.get(String(userId)).catch(() => null);
    if (!raw) throw new UnauthorizedException({ title: '401 Unauthorized', description: 'Warning' });
    const user = JSON.parse(raw);
    if (user.player_jwt !== token) throw new UnauthorizedException({ title: '401 Unauthorized', description: 'Warning' });

    req.user = user;
    return true;
  }
}
```

:::

## 封禁

封禁不只是登录时拒绝，还要**立刻踢掉在线连接**。封禁响应用 403：

```jsonc
// fyserver 的 BannedResponse
{
  "error": { "title": "user_error", "description": "banned" },
  "…": "Forbidden",
  "status": 403
}
```

::: code-group

```csharp [C#]
if (user.Banned)
{
    await webSockets.DisconnectAsync(user.Id, "该账户已被封禁"); // 给 WS 发 channel: disconnect
    return Results.Json(new { error = new { title = "user_error", description = "banned" } }, statusCode: 403);
}
```

```typescript [TypeScript]
if (user.banned) {
  clients[user.id]?.client.send(JSON.stringify({ channel: 'disconnect', message: '该账户已被封禁' }));
  throw new ForbiddenException({ error: { title: 'user_error', description: 'banned' } });
}
```

:::

---

token 有了，下一章看它怎么被用来**加密对局消息**——这是本协议最独特的设计。
