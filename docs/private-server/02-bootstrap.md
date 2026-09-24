---
title: 02 · 引导接口与最小服务
---

# 02 · 引导接口与最小服务

第一个要实现的是 `GET /`。它只有一个作用：告诉客户端**去哪找其它接口**，以及**当前登录的是谁**。

## 目标响应

```jsonc
{
  "build_info": { "build_timestamp": "2025-10-13T17:31:40Z", "commit_hash": "dfaf581c", "version": 0 },
  "current_user": {
    "client_id": "1", "exp": "1", "external_id": "vekolyram", "iat": 1751690466,
    "identity_id": "1", "iss": "cometkards", "jti": "", "language": "zh-Hans",
    "payment": "notavailable", "player_id": "1", "provider": "device",
    "roles": [], "tier": "LIVE", "user_id": "1", "user_name": "vekolyram"
  },
  "endpoints": {
    "draft":             "http://127.0.0.1:5231/draft/",
    "email":             "http://127.0.0.1:5231/email/set",
    "lobbyplayers":      "http://127.0.0.1:5231/lobbyplayers",
    "matches":           "http://127.0.0.1:5231/matches",
    "matches2":          "http://127.0.0.1:5231/matches/v2/",
    "my_draft":          null,
    "my_items":          null,
    "my_player":         null,
    "players":           "http://127.0.0.1:5231/players",
    "root":              "http://127.0.0.1:5231",
    "session":           "http://127.0.0.1:5231/session",
    "singleplayerlobby": "http://127.0.0.1:5231/singleplayerlobby",
    "tourneys":          "http://127.0.0.1:5231/tourney/"
  },
  "host_info": {
    "container_name": "kards-backend-LIVE",
    "docker_image":   "…/kards-backend:live",
    "host_address":   "127.0.0.1", "host_name": "cometkards", "instance_id": "i-03598bff8bd68fdee"
  },
  "server_time":  "2025.10.13-17.31.40",
  "service_name": "kards-backend",
  "tenant_name":  "1939-kardslive",
  "tier_name":    "LIVE"
}
```

`endpoints` 的键就是第 1 章的 `FKardsEndpoints2`，一个都不能少。

::: warning `current_user` 里两个反直觉的点

1. **`exp` 填的是用户 ID 字符串**，不是时间戳。原因在客户端的结构体里：`FJwtPayload.exp` 是 `int32`（见[附录 A](/private-server/appendix/uht-structs)），Go 实现干脆把 ID 塞了进去。
2. **`iat` 填的是服务端 token 自己的 `exp`**。这是 Go 实现 `GetRoot` 里的做法，它同时还会做一次一致性检查：

   ```go
   // internal/handlers/root.go（Go 服务端自身的校验，不是客户端行为）
   expC := claimsClient["exp"].(float64)   // 请求方 token 的 exp
   expS := claimsServer["exp"].(float64)   // 库里存的 PlayerJWT 的 exp
   if math.Abs(expC-expS) < 86400 { … }    // 相差 24h 内才填充 current_user
   ```

   作用是"只认自己最近签发的那张 token"，防止用过期的旧 token 拿到 `current_user`。

结论：`current_user` 不是标准的 JWT payload（字段是 `int32`、语义也偏），**别用通用 JWT 库直接序列化**，手工拼 JSON 最稳。
:::

## `/.com/config`：另一个引导口

Go 实现里还有一个独立配置口，用来贴公告/迁移提示：

```go
// internal/handlers/config.go
func GetConfig(c *gin.Context) {
    c.JSON(200, gin.H{
        "xserver_closed":        "Server in Go!\n服务器已切换至 Go 引擎",
        "xserver_closed_header": "Backend Migration",
        "forgot_password_url":   "https://www.kards.com/auth/recovery?lang={lang}",
    })
}
```

`xserver_closed` 非空时客户端会弹公告——**这是最省事的"关服维护"开关**。

## 最小实现

::: code-group

```csharp [C# / ASP.NET Core]
// Program.cs
var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseUrls("http://0.0.0.0:5231");   // 监听全网卡，下发地址另算
var app = builder.Build();

string Base => "http://127.0.0.1:5231";           // ← 必须是客户端可达地址

app.MapGet("/", (HttpContext ctx) =>
{
    var uid = "1";
    return Results.Json(new
    {
        build_info = new { build_timestamp = DateTime.UtcNow.ToString("o"), commit_hash = "dev", version = 0 },
        current_user = new Dictionary<string, object?>
        {
            ["client_id"] = uid,
            ["exp"] = uid,                        // ← 填 ID，不是时间
            ["external_id"] = "player",
            ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ["identity_id"] = uid,
            ["iss"] = "cometkards",
            ["jti"] = "",
            ["language"] = "zh-Hans",
            ["payment"] = "notavailable",
            ["player_id"] = uid,
            ["provider"] = "device",
            ["roles"] = Array.Empty<string>(),
            ["tier"] = "LIVE",
            ["user_id"] = uid,
            ["user_name"] = "player",
        },
        endpoints = new Dictionary<string, object?>
        {
            ["draft"] = $"{Base}/draft/",
            ["email"] = $"{Base}/email/set",
            ["lobbyplayers"] = $"{Base}/lobbyplayers",
            ["matches"] = $"{Base}/matches",
            ["matches2"] = $"{Base}/matches/v2/",
            ["my_draft"] = null, ["my_items"] = null, ["my_player"] = null,
            ["players"] = $"{Base}/players",
            ["root"] = Base,
            ["session"] = $"{Base}/session",
            ["singleplayerlobby"] = $"{Base}/singleplayerlobby",
            ["tourneys"] = $"{Base}/tourney/",
        },
        host_info = new { container_name = "kards-backend-LIVE", host_address = "127.0.0.1", host_name = "cometkards" },
        server_time = DateTime.UtcNow.ToString("yyyy.MM.dd-HH.mm.ss"),
        service_name = "kards-backend",
        tenant_name = "1939-kardslive",
        tier_name = "LIVE",
    });
});

app.MapGet("/.com/config", () => Results.Json(new
{
    xserver_closed = "",                          // 非空 = 客户端弹公告
    xserver_closed_header = "",
    forgot_password_url = "https://www.kards.com/auth/recovery?lang={lang}",
}));

app.Run();
```

```typescript [TypeScript / NestJS]
// src/app.controller.ts
import { Controller, Get, Req } from '@nestjs/common';
import { BASE } from './config';

const uid = '1';

@Controller()
export class AppController {
  @Get()
  root(@Req() req: any) {
    return {
      build_info: { build_timestamp: new Date().toISOString(), commit_hash: 'dev', version: 0 },
      current_user: {
        client_id: uid,
        exp: uid,                      // ← 填 ID，不是时间
        external_id: 'player',
        iat: Math.floor(Date.now() / 1000),
        identity_id: uid,
        iss: 'cometkards',
        jti: '',
        language: 'zh-Hans',
        payment: 'notavailable',
        player_id: uid,
        provider: 'device',
        roles: [],
        tier: 'LIVE',
        user_id: uid,
        user_name: 'player',
      },
      endpoints: {
        draft: `${BASE}/draft/`,
        email: `${BASE}/email/set`,
        lobbyplayers: `${BASE}/lobbyplayers`,
        matches: `${BASE}/matches`,
        matches2: `${BASE}/matches/v2/`,
        my_draft: null, my_items: null, my_player: null,
        players: `${BASE}/players`,
        root: BASE,
        session: `${BASE}/session`,
        singleplayerlobby: `${BASE}/singleplayerlobby`,
        tourneys: `${BASE}/tourney/`,
      },
      host_info: { container_name: 'kards-backend-LIVE', host_address: '127.0.0.1', host_name: 'cometkards' },
      server_time: formatServerTime(new Date()),
      service_name: 'kards-backend',
      tenant_name: '1939-kardslive',
      tier_name: 'LIVE',
    };
  }

  @Get('.com/config')
  config() {
    return { xserver_closed: '', xserver_closed_header: '', forgot_password_url: 'https://www.kards.com/auth/recovery?lang={lang}' };
  }
}

// 客户端要的是 2025.10.13-17.31.40
export const formatServerTime = (d: Date) =>
  d.toISOString().replace('T', '-').replace(/\.\d+Z$/, '').replace(/:/g, '.');
```

:::

## 两个必踩的兼容坑

**1. 连续斜杠必须归一化。** 客户端会请求 `//fp`、`/matches//v2` 这类路径。两个实现都做了处理：

- Go：`r.RemoveExtraSlash = true`（Gin 内置）；
- C#：自定义 `PathNormalizationMiddleware` 在路由匹配**之前**改写 `Request.Path`。

写中间件时注意顺序：**必须在 `UseRouting()`/路由注册前生效**，否则已经匹配失败了再改写没用。

**2. `Content-Type` 不能带 `charset`。** 客户端解析对 `application/json; charset=utf-8` 不友好。三个实现各有一招：

```csharp
// C#：中间件里把 charset 抹掉
app.Use(async (ctx, next) => {
    ctx.Response.OnStarting(() => {
        var ct = ctx.Response.ContentType;
        if (ct is not null && ct.StartsWith("application/json"))
            ctx.Response.ContentType = "application/json";
        return Task.CompletedTask;
    });
    await next();
});
```

```typescript
// TS：Express 层直接摘掉
server.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => { res.setHeader('Content-Type', 'application/json'); return json(body); };
  next();
});
```

---

下一章：把 `current_user` 换成真实用户，实现 `POST /session`。
