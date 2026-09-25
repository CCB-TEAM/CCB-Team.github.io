---
title: 04 · 消息编解码 codec
---

# 04 · 消息编解码 codec

对局动作不是明文 JSON 传的，而是压成一条**自描述字符串**：

```jsonc
// POST /matches/v2/{id}/actions
{ "a": "3f000312Q2F0A7…<key>…<base64 密文>" }
```

这一章把它拆开。它的原始实现是一个 `codec.dll`，`fyserver` 用纯 C# 复刻了算法（`Services/CodecService.cs`），下面就是逐字节的还原。

::: tip 独立逆向成果
同一套方案的独立成果见 [B64XorDecryption](/projects/b64xordecryption)：C 动态库 `codec.c`、C# `DataDecoder` API，以及从二进制还原算法时的 IDA 伪代码存档（含 75 元素盐长表的内存地址）。本章的 TS 实现是按该算法新写的。
:::

## 线格式

```
 3f 000312 Q2F0 A7xKd…(key) …(base64 密文)
 │  │      │    │            └─ 密文：明文 XOR key 循环，再 Base64
 │  │      │    └────────────── 密钥：长度由表查得，字符取自 Base64 字母表
 │  │      └─────────────────── actionId：3 字节 XOR key 前 3 字节，再 Base64（固定 4 字符）
 │  └────────────────────────── 明文字节数，10 进制 6 位左补零
 └───────────────────────────── 表索引 00–74，10 进制 2 位左补零
```

| 字段 | 长度 | 说明 |
|---|---|---|
| `tableIndex` | 2 | `SALT_LENGTH_TABLE` 的下标，随机选 |
| `dataLength` | 6 | **明文的 UTF-8 字节数**（不是密文长度） |
| `b64ActionId` | 4 | 3 字节密文的 Base64（`ceil(3/3)*4 = 4`） |
| `key` | 31–103 | 变长，长度 = `SALT_LENGTH_TABLE[tableIndex]` |
| `b64Cipher` | 剩余 | 密文 Base64 |

::: warning Base64 填充：真实客户端**保留** `=`，Go 参考实现只是解码时宽容
实测真实客户端发出的包，尾部**都带** `=` 填充：

| 明文长度 | 应填充 | 实测包尾 |
|---|---|---|
| 128 B | `=` | `…EFgLexA=` |
| 142 B | `==` | `…f0JZHA==` |
| 14 360 B | `=` | `…VAxScgw=` |

而 `kardsservergo` 的解码器里写着 `strings.TrimRight(b64, "=")`——那只是**解码端宽容**，不等于"协议不带填充"。

**建议**：编码时**保留** `=`（.NET 的 `Convert.ToBase64String`、Go 的 `base64.StdEncoding` 默认就会带）；解码时**两种都收**（先把填充补回来：`b64 + strings.Repeat("=", (4-len(b64)%4)%4)`）。这样既不违背真实客户端的约定，也不会被严格解码器（.NET `Convert.FromBase64String`、Python `base64.b64decode` 默认校验）拒掉。

另外注意 `b64ActionId` **恰好 4 字符、永远不需要填充**（3 字节正好 4 字符）——别把它当成"整个包都不带填充"的证据。
:::

密钥长度表（75 项，按原始 C 源码）：

```ts
const SALT_LENGTH_TABLE = [
  47, 53, 73, 55, 61, 103, 47, 103, 33, 45,
  73, 37, 97, 71, 39, 71, 31, 61, 83, 101,
  53, 97, 79, 75, 37, 31, 33, 69, 43, 63,
  39, 43, 79, 55, 49, 73, 83, 67, 59, 69,
  103, 39, 47, 37, 41, 71, 89, 55, 49, 45,
  33, 45, 69, 49, 43, 53, 59, 31, 59, 101,
  61, 41, 79, 75, 83, 89, 75, 67, 41, 89,
  63, 101, 67, 63, 97,
];
```

::: warning 这不是加密
明文和密钥**循环异或**，密钥本身**就在同一条字符串里**。它只是混淆 + 防呆（对局消息不希望被随手改/随手读），不提供任何机密性或完整性。别把它当安全机制，也别用它保护任何敏感数据。
:::

## 解码

参考实现的解码（`CodecService.Decode`）逻辑如下，注意 `actionId` 是 **24 位大端**：

::: code-group

```csharp [C#]
public string Decode(string encoded, out int actionId)
{
    int tableIndex = int.Parse(encoded.Substring(0, 2));
    int dataLength = int.Parse(encoded.Substring(2, 6));   // 明文长度，可用于校验
    string body = encoded.Substring(8);

    int keyLength = SaltLengthTable[tableIndex];
    string b64ActionId = body.Substring(0, 4);
    string keyStr      = body.Substring(4, keyLength);
    string b64Cipher   = body.Substring(4 + keyLength);

    byte[] actionIdBytes = Convert.FromBase64String(b64ActionId);
    byte[] keyBytes      = Encoding.ASCII.GetBytes(keyStr);
    byte[] cipherBytes   = Convert.FromBase64String(b64Cipher);

    byte[] plainBytes = new byte[cipherBytes.Length];
    for (int i = 0; i < cipherBytes.Length; i++)
        plainBytes[i] = (byte)(cipherBytes[i] ^ keyBytes[i % keyLength]);

    actionId = ((actionIdBytes[0] ^ keyBytes[0]) << 16)
             | ((actionIdBytes[1] ^ keyBytes[1 % keyLength]) << 8)
             |  (actionIdBytes[2] ^ keyBytes[2 % keyLength]);

    return Encoding.UTF8.GetString(plainBytes);
}
```

```typescript [TypeScript]
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SALT_LENGTH_TABLE = [/* 见上表 */];

export interface Decoded { plaintext: string; actionId: number; dataLength: number; }

export function decode(encoded: string): Decoded {
  const tableIndex = parseInt(encoded.slice(0, 2), 10);
  const dataLength = parseInt(encoded.slice(2, 8), 10);
  const body = encoded.slice(8);

  const keyLength = SALT_LENGTH_TABLE[tableIndex];
  if (keyLength === undefined) throw new Error(`bad tableIndex ${tableIndex}`);

  const b64ActionId = body.slice(0, 4);
  const keyStr = body.slice(4, 4 + keyLength);
  const b64Cipher = body.slice(4 + keyLength);

  const key = Buffer.from(keyStr, 'ascii');
  const cipher = Buffer.from(b64Cipher, 'base64');
  const plain = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) plain[i] = cipher[i] ^ key[i % key.length];

  const a = Buffer.from(b64ActionId, 'base64');
  const actionId = (((a[0] ^ key[0]) << 16) | ((a[1] ^ key[1 % key.length]) << 8) | (a[2] ^ key[2 % key.length])) >>> 0;

  const plaintext = plain.toString('utf8');
  if (Buffer.byteLength(plaintext, 'utf8') !== dataLength) {
    // 长度不符 = 解错了（tableIndex/key 取位有偏差）；带病继续会污染对局状态
    throw new Error(`length mismatch: header=${dataLength} actual=${Buffer.byteLength(plaintext, 'utf8')}`);
  }
  return { plaintext, actionId, dataLength };
}
```

:::

::: details 为什么一定要校验 dataLength
解码没有校验和，`tableIndex` 或 key 取错一位就会静默产出垃圾明文。`dataLength` 是唯一的内建一致性检查：**明文 UTF-8 字节数必须等于头部声明的值**。参考的 C# 实现没有校验，TypeScript 版建议补上——出问题时能直接定位到是编解码而不是业务逻辑。
:::

## 编码

编码要随机选表项、随机生成密钥：

::: code-group

```csharp [C#]
public string Encode(string plaintext, int actionId)
{
    int tableIndex = Random.Shared.Next(SaltLengthTable.Length);
    int keyLength  = SaltLengthTable[tableIndex];

    // 密钥字符取自 Base64 字母表
    var keyChars = new char[keyLength];
    for (int i = 0; i < keyLength; i++) keyChars[i] = B64Chars[Random.Shared.Next(B64Chars.Length)];
    string keyStr = new string(keyChars);
    byte[] keyBytes = Encoding.ASCII.GetBytes(keyStr);

    byte[] plainBytes = Encoding.UTF8.GetBytes(plaintext);

    byte[] actionIdBytes = { (byte)((actionId >> 16) & 0xFF), (byte)((actionId >> 8) & 0xFF), (byte)(actionId & 0xFF) };
    byte[] encActionId = {
        (byte)(actionIdBytes[0] ^ keyBytes[0]),
        (byte)(actionIdBytes[1] ^ keyBytes[1 % keyLength]),
        (byte)(actionIdBytes[2] ^ keyBytes[2 % keyLength]),
    };
    byte[] cipher = new byte[plainBytes.Length];
    for (int i = 0; i < plainBytes.Length; i++) cipher[i] = (byte)(plainBytes[i] ^ keyBytes[i % keyLength]);

    return $"{tableIndex:D2}{plainBytes.Length:D6}{Convert.ToBase64String(encActionId)}{keyStr}{Convert.ToBase64String(cipher)}";
}
```

```typescript [TypeScript]
export function encode(plaintext: string, actionId: number): string {
  const tableIndex = Math.floor(Math.random() * SALT_LENGTH_TABLE.length);
  const keyLength = SALT_LENGTH_TABLE[tableIndex];

  let keyStr = '';
  for (let i = 0; i < keyLength; i++) keyStr += B64_CHARS[Math.floor(Math.random() * B64_CHARS.length)];
  const key = Buffer.from(keyStr, 'ascii');

  const plain = Buffer.from(plaintext, 'utf8');
  const cipher = Buffer.alloc(plain.length);
  for (let i = 0; i < plain.length; i++) cipher[i] = plain[i] ^ key[i % key.length];

  const actionIdBytes = Buffer.from([(actionId >> 16) & 0xff, (actionId >> 8) & 0xff, actionId & 0xff]);
  const encActionId = Buffer.from([
    actionIdBytes[0] ^ key[0],
    actionIdBytes[1] ^ key[1 % key.length],
    actionIdBytes[2] ^ key[2 % key.length],
  ]);

  const idx = String(tableIndex).padStart(2, '0');
  const len = String(plain.length).padStart(6, '0');
  return `${idx}${len}${encActionId.toString('base64')}${keyStr}${cipher.toString('base64')}`;
}
```

:::

## 双向自测

写完先自测，别等客户端：

```ts
// 随机 key 里可能含有 `+` `/`，这两个字符在 URL/表单里会被转义——先确认你只在 JSON body 里用它
for (let i = 0; i < 1000; i++) {
  const actionId = Math.floor(Math.random() * 0xffffff);
  const plaintext = JSON.stringify({ action_id: actionId, action_type: 'XActionCheat', action: 'x' });
  const { plaintext: back, actionId: id } = decode(encode(plaintext, actionId));
  if (back !== plaintext || id !== actionId) throw new Error(`roundtrip failed @${i}`);
}
```

## 用在哪

| 场景 | 形态 |
|---|---|
| 提交动作 `POST /matches/v2/{id}/actions` | `{"a": "<encode(actionJson, sendActionId)>"}` |
| 轮询动作 `PUT /matches/v2/{id}/actions` | 响应里 `actions: ["<encoded>", ...]` |
| 重连 `GET /matches/v2/reconnect` | `actions: ["<encoded>", ...]`（从头回放） |
| `fyserver` 的登录 token | `codec.Encode(username, 114)` —— 见上一章的方案 B |

::: tip 复刻时的经验
`actionId` 是**业务字段**（动作序号），`sendActionId` 是**协议字段**（编码进字符串的那个）。参考实现里 `MatchAction` 同时带 `ActionId` 和 `SendActionId`，编码时用的是后者——别混。
:::

---

下一章开始接真实玩家数据：卡牌库、物件、心跳。
