---
title: 09 · 测试
---

# 09 · 测试

::: tip 本章场景
`Rules` 里的函数全是纯函数：给定输入，返回结果，不碰数据库、不读时钟、不写文件。
这类代码最值得先测——因为它们的失败不会表现为「500」，而是「对局结果错了」。
:::

## 定义

**1. 测试 = 可自动执行的断言 + 明确的退出码。** 一个测试项目本质上是：
跑一组断言，全部通过返回 `0`，有失败返回非 `0`。CI 与 `dotnet test` 都依赖这个约定。

**2. 纯函数可测性来自三个「没有」：** 没有隐藏输入（不读时间、随机、配置、全局状态）、
没有副作用（不写 IO）、没有依赖注入要求（不需要搭环境）。满足这三条，测试就只是「调用 + 比较」。

**3. 断言的最小形式：**

```fsharp
let check (name: string) (condition: bool) =
    if condition then printfn "  ok   %s" name
    else printfn "  FAIL %s" name

let equal (name: string) (expected: 'a) (actual: 'a) =
    if expected = actual then printfn "  ok   %s" name
    else printfn "  FAIL %s\n       期望：%A\n       实际：%A" name expected actual
```

`equal` 用了泛型 `'a`，因为 `=` 对所有支持结构相等的类型都成立（记录、DU、列表、元组），
所以一个函数能覆盖大部分断言。

**4. 失败信息要包含期望值与实际值。** 只打印「失败」的测试等于没测：修的人得自己去猜。

**5. 计数与退出码：**

```fsharp
let mutable failures = 0
let mutable passed = 0

// ...每个断言里 passed <- passed + 1 或 failures <- failures + 1...

printfn "通过 %d，失败 %d" passed failures
if failures = 0 then 0 else 1
```

`main` 返回 `int` 就是进程退出码（`[<EntryPoint>]` 的返回值）。

**6. 测试项目通过 `<ProjectReference>` 引用被测项目**，不复制源码。这样 `Rules` 只有一份。

**7. 为什么不默认用 xUnit / Expecto。** 它们需要额外的 NuGet 包与测试运行器；
对「一组纯函数 + 想立刻跑起来」的场景，控制台项目更直接，而且**没有任何依赖**。
需要参数化、夹具、并行执行、报告集成时再换：

```bash
dotnet new xunit -lang F# -o Duel.Tests.Xunit
dotnet add Duel.Tests.Xunit package xunit
```

**8. 测公开行为，不测私有实现。** `Rules` 里的 `private` 辅助函数不直接测；
如果它复杂到必须单独测，说明它应该被提成独立的公开函数——测试反过来会推动结构。

## 实际代码

```fsharp
[<EntryPoint>]
let main _ =
    let known = Set.ofList [ "g_001"; "g_002"; "s_001" ]

    match Rules.validateDeck known { Name = "德"; Cards = [ "g_001"; "g_002" ] } with
    | Ok deck -> equal "合法卡组返回 Ok" 2 (List.length deck.Cards)
    | Error _ -> check "合法卡组返回 Ok" false

    match Rules.validateDeck known { Name = "德"; Cards = [ "g_001"; "zzz" ] } with
    | Ok _ -> check "未知卡牌应返回 Error" false
    | Error errors -> equal "未知卡牌出现在错误里" [ "未知卡牌：zzz" ] errors

    // ... 开局、出牌、结算、非参与者、结束后出牌 ...
    0
```

实际输出（`dotnet run --project Duel.Tests`）：

```text
Rules.validateDeck
  ok   合法卡组返回 Ok
  ok   未知卡牌出现在错误里
  ok   空卡组给出提示
Rules.start / play / finish
  ok   开局轮次为 1
  ok   出牌后轮次 +1
  ok   出牌记录在最前面
  ok   非参与者错误信息
  ok   结算状态带胜者
  ok   结束后出牌的错误信息
  ok   同名玩家错误信息

通过 10，失败 0
```

## 该测什么

| 测 | 不测 |
|---|---|
| 规则的边界：空卡组、超长卡组、未知卡牌、重复出牌 | 框架的行为（Kestrel 会不会监听端口） |
| 状态转移：轮次、日志顺序、状态从 `Running` 到 `Finished` | 私有辅助函数的内部实现 |
| 错误信息的内容（客户端会看到它） | 日志文本的精确格式 |
| JSON 形状（用一次真实请求验证） | JSON 序列化器的内部细节 |

## 练习

1. 给「卡组最多 30 张」加一个边界测试：恰好 30 张通过，31 张失败。
2. 把 `check` / `equal` 换成带分组的结构（`group "Rules.validateDeck" [ ... ]`），
   让输出更像常规测试报告。
3. 写一个测试，验证 `Rules.play` 不修改传入的 `game`（`original.Turn` 不变）。

## 常见错误

**测试里用当前时间或随机数。** 同一个测试两次结果不同，等于没有测试；需要随机就固定种子，
需要时间就把它作为参数传进去。

**断言失败但返回 0。** 只打印「FAIL」不设置退出码，CI 会认为通过。

**测私有函数。** F# 的 `private` 会真的拒绝访问，测试项目也不例外；这通常说明该函数值得公开。

**测试项目没引用被测项目。** 报「未定义」，看起来像命名问题，其实是 `<ProjectReference>` 漏了。

**把集成测试写成单元测试。** 「启动一个 Kestrel、发 HTTP 请求」不属于纯函数测试；
它需要端口、超时、清理，应该单独一类（本文的 curl 验证就是这一类的手工版本）。
