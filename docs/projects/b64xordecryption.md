---
title: B64XorDecryption —— Base64+XOR 协议编解码
---

# B64XorDecryption

对某客户端**私有协议编码方案**的逆向成果与可复用实现：从二进制中还原出「Base64 + 变长 XOR 密钥」的编解码算法，
并提供 **C 动态库**、**C# API** 与 **IDA 伪代码存档**三份材料。

| 项 | 值 |
|---|---|
| 语言 | C（`codec.c`）· C#（`Class1.cs`）· IDA 伪代码存档 |
| 许可 | AGPL-3.0（仓库内 `LICENSE.txt`） |
| 仓库 | <https://github.com/CCB-TEAM/B64XorDecryption> |
| 备注 | 仓库无 README，以下整理自源码 |

## 编码格式

报文是一个自描述的字符串，字段拼接顺序如下：

```
[2 位十进制 表索引][6 位十进制 数据长度][4 字符 Base64 actionId][keyLength 字符密钥][Base64 密文]
                    ↑                                                        ↑
              查 SALT_LENGTH_TABLE 得到 keyLength                      变长，长度由表决定
```

解码步骤（`Class1.cs` 的 `DataDecoder.Decode`）：

1. 取前 2 位十进制数字作为 `tableIndex`，前 8 位之后的 6 位十进制数字作为 `dataLength`。
2. 用 `tableIndex` 查 **75 元素**的 `SALT_LENGTH_TABLE` 得到 `keyLength`。
3. 从第 8 位起取 4 字符 Base64 作为 **actionId**，随后取 `keyLength` 个 ASCII 字符作为**密钥**，剩余部分为 Base64 密文。
4. 密文与密钥**按位循环 XOR** 得到明文；actionId 三个字节也用密钥对应字节 XOR 后拼成 24 位整数。

```csharp
var r = DataDecoder.Decode(encoded);
// r.TableIndex / r.KeyLength / r.DataLength / r.ActionId / r.Key / r.Plaintext
DataDecoder.setSaltLengthTable(newTable);   // 必须正好 75 个元素，否则抛异常
```

## 仓库内容

| 文件 | 说明 |
|---|---|
| `codec.c` | 完整 C 实现：Base64 编解码、75 元素密钥长度表、`ensure_init()` 惰性初始化，Windows 下以 `__declspec(dllexport)` 导出 |
| `Class1.cs` | C# 侧 `DataDecoder` / `DecodeResult`，含可替换的盐长表与结构化解码结果 |
| `破解加密易如反掌.cpp` | 从二进制中还原算法时的 **IDA 伪代码存档**：盐长表内存地址与元素个数（`0x4B` = 75）、字符集常量、action 回调函数还原过程 |
| `B64XorDecryptionApi.csproj` / `.slnx` | C# 项目与解决方案文件 |

C 侧的导出入口刻意使用了混淆命名（`_xR7qM2vP` 编码、`_kW3nJ9tF` 解码），
并保留了 `verify_caller()` 调用者校验钩子（当前实现为占位，恒返回 1），方便按需接入宿主校验。

## 用途

- 解析 / 伪造该协议的请求与响应，用于协议分析、本地回放与测试工具开发。
- 作为 [fyserver](/projects/fyserver) / [FyClient](/projects/fyclient) 编解码层的算法参考来源（同源的 Base64 + XOR + 查表密钥方案）。

::: warning 合规提示
本项目为逆向工程研究产物。请仅在你拥有或获授权测试的环境中使用，并自行确认当地法律、软件许可与平台规则。
:::
