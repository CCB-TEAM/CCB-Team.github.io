---
title: 09 · WebSocket 实时通道
---

# 09 · WebSocket 实时通道

一个反直觉的事实：**对局动作不走 WebSocket**，仍然走第 8 章的 HTTP 轮询。WebSocket 只承担三件事：

1. **保活/在线状态**（`ping`）；
2. **对手在看你**这类轻量提示（`matchaction` / `im_here`）；
3. **服务端主动踢人**（改名、封禁、掉线判负）。

## 两种接法

| 方案 | 地址 | 采用者 |
|---|---|---|
| **独立端口** | `ws://host:5232/ws` | `kardsservergo`、NestJS 版 |
| **与 HTTP 合并** | `ws://host:5231/`（同端口根路径升级） | `fyserver` |

无论哪种，地址都由 `server_options.websocketurl` 下发（第 3 章），客户端不硬编码。

::: tip 独立端口更容易排错
`5232` 和 `5231` 分开，抓包时一眼能分清 HTTP 轮询和 WS 心跳；但如果部署环境只允许放行一个端口，就学 `fyserver` 合并。合并时注意**升级请求要在路由匹配之前处理**：

```csharp
// 程序集管线最前面 MapWebSocketEndpoint，非 WS 请求继续走后面的 HTTP 管线
httpApp.MapWebSocketEndpoint();
httpApp.UseRouting();
httpApp.MapUserEndpoints();
```
:::

## 鉴权

握手时带 `Authorization` 头，取法与 HTTP 一致（裸 token 或 `JWT `/`Bearer ` 前缀）：

::: code-group

```csharp [C#]
// C#：升级前先验，失败直接 401（别升级完再关，客户端会重连风暴）
var token = ExtractToken(ctx.Request.Headers.Authorization.ToString());
var user = token.Length > 0 ? auth.GetUserByToken(token) : null;
if (user is null) { ctx.Response.StatusCode = 401; return; }
if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }

using var socket = await ctx.WebSockets.AcceptWebSocketAsync("ws");   // ← 子协议
hub.Register(user.Id, socket);
```

```typescript [TypeScript]
// TS：ws 库的 connection 回调里查库
const wss = new WebSocket.Server({ port: ws_port });
wss.on('connection', async (ws, req) => {
  const token = String(req.headers['authorization'] ?? '').slice(4);   // 去掉 "JWT "
  const raw = await users.get(token).catch(() => null);
  if (!raw) { ws.close(1008, 'unauthorized'); return; }                // 1008 = PolicyViolation
  const user = JSON.parse(raw);
  clients[user.id] = { user, client: ws };
  ws.on('close', () => { delete clients[user.id]; onDisconnect(user.id); });
});
```

:::

::: warning 子协议必须回 `ws`
Go 的 upgrader 声明了 `Subprotocols: []string{"ws"}`。客户端请求 `Sec-WebSocket-Protocol: ws` 时，服务端**必须在握手响应里回同一个值**，否则部分客户端直接断开。C# 用 `AcceptWebSocketAsync("ws")`，Node 用 `new WebSocket.Server({ handleProtocols: () => 'ws' })`。
:::

## 帧格式

统一是这六个字段：

```jsonc
{
  "message": "matchaction",
  "channel": "notification",
  "context": "482913",
  "timestamp": "2025-07-06T04:06:03.000Z",
  "sender": 2,
  "receiver": 1
}
```

`timestamp` 格式是 `2006-01-02T15:04:05.000Z`（3 位毫秒）。`sender`/`receiver` 是**数字**玩家 id，但 `receiver` 兼容字符串（Go 实现两种都收）。

::: tip 真机抓包的 ping/pong 长这样（实测）
一份真实客户端（Android 构建）打到自建私服的抓包里有 4 条 WS 消息，两问两答：

```jsonc
// client → server
{ "sender": "", "timestamp": "", "receiver": "", "channel": "ping",
  "message": "ping", "context": "", "match_id": "<match_id>" }

// server → client
{ "timestamp": "1790320130002", "context": "", "message": "pong",
  "channel": "ping", "sender": "<player_id>", "receiver": "", "match_id": null }
```

三点值得注意：

1. **客户端发的 `timestamp` 是空字符串**，而且它接受了 **Unix 毫秒字符串**形式的 pong —— 说明**客户端不校验 `timestamp` 格式**（至少这个构建不校验）。上面那句 ISO 格式来自参考实现，两种都能用；
2. **对局中客户端会在心跳里带 `match_id`**（不在局中则不带）。服务端可以用它核对"这人还在不在那局里"，离线判定（`idel_disconnect_minutes`）靠的就是这个；
3. 心跳间隔实测约 **20 秒**，服务端必须回 pong，否则会被判离线。

完整调用序列见[附录 H](/private-server/appendix/client-capture)第九节。
:::

## 四个 channel

| channel | 方向 | 行为 |
|---|---|---|
| `ping` | C→S | 回 `pong` 给自己，`sender` = 自己、`receiver` = `""` |
| `touchcard` | C→S→C | 「摸牌预览」动画，**原样转发给 `receiver`** |
| `emoji` | C→S→C | 表情，同 `touchcard`（**Go 实现漏了这个 channel**；[fyserver](/projects/fyserver) 与 TS 版都有） |
| `notification` | C→S→C | 只在 `message` 是 `websocketcheck` / `matchaction` / `im_here` 时转发 |
| `disconnect` | S→C | 服务端主动踢人，`message` 是给玩家看的理由 |

::: code-group

```csharp [C#]
// C#：消息循环
while (socket.State == WebSocketState.Open)
{
    var frame = await ReceiveJson(socket);
    if (frame is null) break;                                  // 断开

    switch (frame.Channel)
    {
        case "ping":
            await Send(socket, new WsNotification(
                Message: "pong", Channel: "ping", Context: "",
                Timestamp: DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                Sender: user.Id, Receiver: ""));
            break;

        case "touchcard":
        case "emoji":
            await hub.Forward(frame with { Sender = user.Id });  // 原样转发
            break;

        case "notification":
            if (frame.Message is "websocketcheck" or "matchaction" or "im_here")
                // im_here 要清空 context
                await hub.Forward(frame with { Sender = user.Id, Context = frame.Message == "im_here" ? "" : frame.Context });
            break;
    }
}
```

```typescript [TypeScript]
// TS：同一个 switch
ws.on('message', async (raw: Buffer) => {
  const msg = JSON.parse(raw.toString());
  const reply = (message: string, context: string) => clients[msg.receiver]?.client.send(JSON.stringify({
    message, channel: msg.channel, context,
    timestamp: new Date(), sender: user.id, receiver: msg.receiver,
  }));

  switch (msg.channel) {
    case 'ping':
      ws.send(JSON.stringify({ message: 'pong', channel: 'ping', context: '', timestamp: new Date(), sender: user.id, receiver: '' }));
      break;
    case 'touchcard':
    case 'emoji':
      reply(msg.message, msg.context);
      break;
    case 'notification':
      if (msg.message === 'im_here') reply('im_here', '');                 // ← context 清空
      else if (msg.message === 'websocketcheck' || msg.message === 'matchaction') reply(msg.message, msg.context);
      break;
  }
});
```

:::

::: tip `im_here` 是"我在线"广播
对手客户端靠它判断"对面还在牌桌上"。**注意 `im_here` 的 `context` 必须清空**，而 `matchaction` 的 `context` 要原样带上（里面是 `match_id`）——两个实现的代码都在这一点上做了特判，照抄即可。
:::

## 服务器主动踢人

```jsonc
// 改名未完成
{ "channel": "disconnect", "message": "请改名",       "context": null, "sender": "Server", "receiver": null }
// 被封禁
{ "channel": "disconnect", "message": "该账户已被封禁", "context": null, "sender": "Server", "receiver": null }
```

封禁时先把人踢下线再落库（第 3 章的 `BannedResponse`）：

```csharp
await webSockets.DisconnectAsync(user.Id, "该账户已被封禁");
user.Banned = true;
await users.SaveUserAsync(user);
match.WinnerSide = user.Id == match.Left?.PlayerId ? "right" : "left";
```

## 掉线即判负

这是 WS 唯一与对局强相关的地方：**连接断开 = 投降**。

```go
defer func() {
    gm.OnlineClients.Delete(user.ID)
    gm.SetPlayerOnlineStatus(user.ID, false)
    gm.EndMatchBySurrender(user.ID, "surrender")     // ← 断线判负
    conn.Close()
}()
```

::: warning 断线处理要留缓冲
移动端网络抖动、切后台都会断 WS。参考实现是**立刻判负**（简单、可预期）；要做得友好一点，可以：

1. `close` 后不立刻结算，给 30–60 秒宽限期；
2. 玩家用 `GET /matches/v2/reconnect` 回来则取消判负；
3. 宽限期过后仍无连接，再走 `surrender`。

注意 `EndMatchBySurrender` 要**幂等**：同一局重复调用不能覆盖已经确定的胜负。
:::

## 在线状态表

在线状态只有一个数据源：**WS 连接表**（`userId → socket`）。心跳接口（`PUT /players/{id}/heartbeat`）只返回 `{}`，不参与判定。这样做的好处是"掉线"和"离线"永远一致，不会出现心跳还在发但连接已死的中间态。

---

协议到这里就闭环了。最后一章：部署、反代和那些会浪费你一整晚的兼容坑。
