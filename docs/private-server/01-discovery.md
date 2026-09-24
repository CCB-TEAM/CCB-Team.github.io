---
title: 01 · 协议是怎么知道的
---

# 01 · 协议是怎么知道的

写私服最难的不是写代码，是**知道客户端到底想要什么**。这一章讲三种取证手段，以及怎么互相验证。

## 三种取证手段

| 手段 | 能拿到什么 | 局限 |
|---|---|---|
| **抓包**（mitmproxy / Fiddler） | 请求路径、方法、真实请求体、响应字段的实际取值 | 只有你走到过的流程；加密动作体看不穿 |
| **UHT 头文件** | 客户端**结构体字段名**——这是字段名的权威来源 | 只有类型，没有取值和顺序 |
| **蓝图反编译** | 业务逻辑、硬编码常量、URL、枚举 | 字节码还原有损，需交叉验证 |

三者结论一致时，协议基本就确定了。

## 一、UHT：字段名的权威来源

游戏的打包产物里带 UE4SS 的 `UHTHeaderDump`（本项目用的是
`H:\sbk\KARDS\default\game\kards\Binaries\Win64\ue4ss\UHTHeaderDump`）。
kards 的协议层就躺在 `kards\Public\` 下：

```cpp
// UHTHeaderDump\kards\Public\KardsEndpoints2.h
USTRUCT(BlueprintType)
struct FKardsEndpoints2 {
    FString auth;          FString leaderboards;  FString lobbyplayers;
    FString my_player;     FString players;       FString matches;
    FString store;         FString transactions;  FString draft;
    FString my_draft;      FString tourneys;
};
```

**这个结构体就是 `GET /` 返回的 `endpoints` 对象**。客户端不是硬编码业务路径的，它把这个 JSON 反序列化成 `FKardsEndpoints2`，再去调用其中的 URL。所以：

- 只要 `endpoints` 里给全，客户端就会去连你的地址；
- 想加自己的接口（比如自定义商店），把 `store` 指向自己的路径即可，**不用改客户端**。

对应的会话级结构体是 `FSessionEndpoints`：

```cpp
// UHTHeaderDump\kards\Public\SessionEndpoints.h
USTRUCT(BlueprintType)
struct FSessionEndpoints {
    FString clients;   FString draft;    FString Email;      // ← 注意大写 E
    FString lobbyplayers; FString matches; FString matches2;
    FString my_draft;  FString my_items; FString my_player;
    FString players;   FString Root;     // ← 注意大写 R
    FString session;   FString store;    FString transactions;
    FString users;     FString tourneys;
};
```

::: tip 命名不一致正是线索
`Email`、`Root` 在头文件里是大写开头（UE 属性名习惯），而三个服务端实现下发的 JSON 键都是小写 `email`、`root`。这说明客户端反序列化是**大小写不敏感**的——你可以自己决定用哪种写法，但不要两种混着写同一个键。
:::

还有 `UServerConfig`，它解释了为什么有些配置我们"查不到字段名"：

```cpp
// UHTHeaderDump\kards\Public\ServerConfig.h
UCLASS(Blueprintable)
class UServerConfig : public UObject {
    UPROPERTY(BlueprintReadWrite, EditAnywhere)
    FString JsonString;                       // ← 一整坨 JSON 塞在字符串里
    UFUNCTION(BlueprintCallable) void GetStringFromS3(const FString& Key, bool& KeyExists, FString& Value);
    UFUNCTION(BlueprintCallable) void GetIntFromS3(const FString& Key, bool& KeyExists, int32& Value);
    UFUNCTION(BlueprintCallable) void FetchConfig();
};
```

`JsonString` + `GetXxxFromS3(Key, ...)` 就是 `server_options` 的真身：**一个字符串，里面还是 JSON**。

```jsonc
// POST /session 响应里的 server_options 字段（值本身是字符串，不是对象！）
"server_options": "{\"nui_mobile\":1,\"battle_wait_time\":60,\"websocketurl\":\"ws://192.168.1.16:5232/ws\"}"
```

这就是为什么在头文件里 grep `websocketurl` 一无所获：它不是结构体字段，而是被动态解析的 JSON 键。两个 Go/TS 实现都用 `json.Marshal(struct)` / 模板字符串构造它，字段名随便写，只要和客户端解析代码一致——而那段代码就在蓝图/CS 里。

## 二、蓝图反编译：业务逻辑与硬编码常量

字段名靠 UHT，**取值和逻辑**要靠蓝图。本系列所有反编译结论都出自 [`KismetDecompiler`](/projects/kismetdecompiler)（UAssetAPI + Kismet 字节码还原）。

```bash
# 批量：一个目录一条命令，每个资产输出一个文件级伪代码（不是每函数一个 txt）
KismetDecompiler --input  "H:\.vscode\Output\Exports\kards\Content" \
                 --usmap  "H:\.vscode\m.usmap" \
                 --uhtdump "H:\sbk\KARDS\...\ue4ss\UHTHeaderDump" \
                 --inline --opt \
                 --out    "Decompiled\kards"
```

`--inline` 与 `--opt` 是实验特性：前者把 `ExecuteUbergraph` 的 dispatch case 体**内联回**事件函数（读起来才像正常代码），后者做临时量值流内联与命名简化。`--uhtdump` 会额外把 import 调用的真实签名（含 `out` 修饰）注进函数头注释，例如：

```cpp
// ----------------------------------------------------------------------------
// Function: DirectClientLogger
// ----------------------------------------------------------------------------
// UGameInstanceSubsystem* SubsystemBlueprintLibrary::GetGameInstanceSubsystem(UObject* ContextObject, TSubclassOf<UGameInstanceSubsystem> Class)
// void LoggerSubsystem::LogError(const FString& Error, bool skipScreen)
void DirectClientLogger()
{
    GetGameInstanceSubsystem_ReturnValue = GetGameInstanceSubsystem(__WorldContext, -8);
    GetGameInstanceSubsystem_ReturnValue.LogError(MessageToLog, false);
    return;
}
```

找协议线索时，直接 grep 产物里的字符串字面量和 URL：

```bash
# 硬编码 URL / 域名
rg -n 'https?://' Decompiled/kards
# Library\PlatformUtilityFunctions.cpp:115:
#   OutLink = "https://kards-hk-information.kardsplayer.com/";

# JSON 处理函数（说明该蓝图在解析服务端响应）
rg -n 'BlueprintJsonLibrary|Conv_JsonValueToString' Decompiled/kards
```

::: details 反编译读起来为什么"不像代码"
Kismet 字节码是栈式的，临时变量满天飞，控制流是跳转。你会看到 `-62.useChinaAlternatives(...)` 里的负数——那是**未解析的 import 索引**（目标是 `/Script/kards` 里的对象）；实验性渲染会把它解析成名字。阅读时的经验法则：

1. `StructMemberContext(...)` = 读写某个结构体字段，字段名在 `<StructExpression>` 里；
2. `SwitchValue(...)` = `K2Node_SwitchEnum`，**每个 case 就是一条业务分支**（比如阵营 → 颜色）；
3. `K2Node_SwitchEnum_CmpSuccess = NotEqual_ByteByte(x, N)` 连续出现 = 一个 enum 分支链，`N` 是枚举值。
:::

## 三、抓包：把"应该是什么"变成"实际是什么"

UHT 告诉你字段名，蓝图告诉你逻辑，**但顺序、大小写、null 还是 `[]`、时间格式，只有抓包能确定**。本系列里几个典型坑都是抓包发现的：

- `SessionResponse` 的字段是**按字母序**排列的（Go 实现里结构体注释写着"字段顺序与示例完全一致"）——某些客户端版本对顺序敏感；
- 空数组 `[]` 和 `null` 不等价：`decks.headers` 必须是 `[]`，`email` 可以是 `null`；
- 时间格式是 `2025-07-03T12:13:36.889692Z`（6 位小数 + `Z`），而 `server_time` 却是 `2025.07.06-04.06.03`（点号分隔）。

## 验证闭环

写完一个接口，用这个循环收敛：

```
改服务端字段/顺序
        │
        ▼
启动客户端 → 登录 → 走到那个界面
        │
        ├─ 正常：记下响应，作为"已知良好样本"
        └─ 报错：客户端日志/Pak 里的 UE_LOG 会指出解析失败的字段
                 （找不到就二分删字段，直到能过）
```

::: warning 不要一开始就追求全字段
参考实现的做法都是**先塞常量占位**：等级全部 500、金币 999999、`tutorials_finished` 直接给全量数组。客户端只要能解析，就会进入主界面；之后再逐个接真实数据。下一章就从最小的 `GET /` 开始。
:::

::: tip 本系列的"取证附录"
正文以可运行的实现为主线，客户端侧的字段与行为集中在三篇附录里，遇到"客户端到底怎么判的"这类问题直接查：

- [附录 A · UHT 结构体与枚举注解](/private-server/appendix/uht-structs) —— 客户端结构体定义（字段名的权威来源）
- [附录 B · 蓝图反编译注解](/private-server/appendix/decompile-notes) —— 配置键清单、版本闸门、阵营等级/颜色表
- [附录 C · 客户端如何解析端点与配置](/private-server/appendix/client-flow) —— 从硬编码基址到进对局的完整链路
:::
