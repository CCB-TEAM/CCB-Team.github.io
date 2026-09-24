---
title: 附录 B · 蓝图反编译注解
---

# 附录 B · 蓝图反编译注解

[附录 A](/private-server/appendix/uht-structs) 给的是**类型**，这一页给的是**行为**：客户端拿服务端的数据干什么、按什么键读、判定条件是什么。素材全部来自 `KismetDecompiler` 对游戏包的批量反编译。

```bash
KismetDecompiler --input  "H:\.vscode\Output\Exports\kards\Content" \
                 --usmap  "H:\.vscode\m.usmap" \
                 --uhtdump "H:\sbk\KARDS\...\ue4ss\UHTHeaderDump" \
                 --inline --opt --out "Decompiled\kards"
# 34 个蓝图 / 945 个函数，约 40 秒
```

## 0. 先学会读这些伪代码

不熟悉 Kismet 字节码的话，下面这些惯用法会让你以为产物是坏的：

| 你看到的 | 它其实是 |
|---|---|
| `Temp_int_Variable_1` … `_7` 一堆 | 编译器给 select / switch 的**分支结果**分配的临时变量 |
| `return;` 之后**还有代码** | 字节码是平铺的：`return` 是某个分支的出口，后面的仍是其它分支。**不要当成死代码删掉** |
| `switch (Temp_byte_Variable) { case 1: …; }` | `K2Node_SwitchEnum`，`case N` 里的 `N` **就是枚举值**（对照 `EFactionEnum`） |
| `K2Node_SwitchEnum_CmpSuccess = NotEqual_ByteByte(faction, N)` 层层嵌套 | 同一件事的另一种编译形态（enum 分支链）：`if (faction != 0) … if (faction != 1) …`，**`else` 分支才是匹配到 N 的那条** |
| `Default__UtilityFunctions_C.PrintRed(...)` | 蓝图函数库的静态调用（CDO 调用） |
| `out X` 参数 | UHT 签名注释里带 `&` 的输出参数 |
| `{FloatConst(Value=0.2), …, FloatConst(Value=1)}` | `FLinearColor` 字面量（RGBA） |
| `UAssetAPI.Kismet.Bytecode.FScriptText` | **未能解析出的文本字面量**（空串或格式化模板） |
| `<Target>` / `<ArrayVariable>` / `<ArrayIndex>` | 通配参数 / 未解析的数组下标——渲染上限，需要看原始字节码 |

## 1. `server_options` 到底怎么被读的

`Library\ServerUtilityFunctions.uasset` 就是 `server_options` 的读取入口。它本身不知道任何键名，只做转发：

```cpp
// Library\ServerUtilityFunctions.cpp（节选 + 注解）
// UHT 签名：bool ConfigSubsystem::GetFloat(const FString& FieldName, double& Value)
void GetServerConfigFloat()
{
    LocalKey = Key;                                          // 蓝图入参：字段名
    GetEngineSubsystem_ReturnValue = GetEngineSubsystem(ConfigSubsystem);
    GetFloat_ReturnValue = GetEngineSubsystem_ReturnValue.GetFloat(LocalKey, out GetFloat_Value);
    if (GetFloat_ReturnValue)                                // ← 键存在才算数
    {
        Value = GetFloat_Value;
    }
    else
    {
        Default__UtilityFunctions_C.PrintRed("GetServerConfigFloat not found for key: ", LocalKey, "", 0, 0, __WorldContext);
        Value = DoubleConst(Value=0);                        // ← 注意：包装函数自己回落到 0
    }
}
```

::: tip 关键结论：**缺失的键不会崩，只有调用方给的默认值**
上面的包装函数在"键不存在"时回落 `0`，但真正决定行为的是**调用点**——调用方会把默认值显式传进去。这就是为什么最小 `server_options`（只给 `websocketurl`）也能进游戏：

```cpp
// Library\ServerUtilityFunctions.cpp — ReadAndSaveServerConfigDefaultOptionsForNui（节选）
GetServerConfigFloat("appscale_mobile_default",  DoubleConst(Value=1.4), __WorldContext, …);
GetServerConfigFloat("appscale_mobile_min",      DoubleConst(Value=1),   __WorldContext, …);
GetServerConfigFloat("appscale_mobile_max",      DoubleConst(Value=1.4), __WorldContext, …);
GetServerConfigFloat("appscale_desktop_default", DoubleConst(Value=1),   __WorldContext, …);
GetServerConfigFloat("appscale_desktop_min",     DoubleConst(Value=0.8), __WorldContext, …);
GetServerConfigFloat("appscale_desktop_max",     DoubleConst(Value=1.4), __WorldContext, …);
GetServerConfigFloat("appscale_tablet_default",  DoubleConst(Value=1.1), __WorldContext, …);
GetServerConfigFloat("appscale_tablet_min",      DoubleConst(Value=1),   __WorldContext, …);
GetServerConfigFloat("appscale_tablet_max",      DoubleConst(Value=1.4), __WorldContext, …);
```

**9 个 `appscale_*` 键、以及它们的默认值**，全在这里。Go 实现只发了其中 6 个（少了 `desktop_min` / `tablet_default` / `tablet_max`）——不影响运行，但**发全了才不会出现"PC 端缩放异常"这类玄学问题**。
:::

### 蓝图里实际出现的全部配置键

把 `ConfigSubsystem.GetXxx("字面量")` 与包装函数调用全部抽出来，蓝图侧总共只读 **25 个键**：

| 键 | 类型 | Go 实现是否发送 | 缺失时 |
|---|---|---|---|
| `versions` | JSONArray | ✅ | **一律放行版本检查**（见下节） |
| `brothers_in_arms_date` | String | ✅ | 资料片按未开放处理 |
| `covert_ops_date` | String | ✅ | 同上 |
| `naval_warfare_date` | String | ✅ | 同上 |
| `homefront_date` | String | ✅ | 同上 |
| `winter_war_date` | String | ✅ | 同上 |
| `presale_packs` | JSONArray | ❌ | 空 |
| `current_extended_8_day_offer` | JsonObject | ❌ | 空 |
| `account_linking_url` | String | ❌ | 空（账号关联按钮） |
| `apk_4399_provider_url` / `apk_haoyou_provider_url` / `apk_jiuyou_provider_url` | String | ❌ | 空（国内安卓渠道） |
| `android_default_mobilecontentscale` | Int | ❌ | 0 |
| `can_autoban_players_kredit_check` | Int | ❌ | 0 |
| `debug_trace_cardrender` | Bool | ❌ | false |
| `feature_virtual_keyboard` | Bool | ❌ | false |
| `appscale_mobile_default/min/max` | Float | ✅ | 1.4 / 1 / 1.4 |
| `appscale_desktop_default/max` | Float | ✅ | 1 / 1.4 |
| `appscale_desktop_min` | Float | ❌ | 0.8 |
| `appscale_tablet_default/max` | Float | ❌ | 1.1 / 1.4 |
| `appscale_tablet_min` | Float | ✅ | 1 |

::: warning 剩下的键在哪？
`websocketurl`、`nui_mobile`、`battle_wait_time`、`reconnect`、`show_full_image`、`locked_cards`、`new_reward`… 这些**在 34 个蓝图产物里一次都没出现**。它们由 **C++ 层**（`ConfigSubsystem` 的宿主、请求管理器、UI 子系统）直接读取。所以：

- 蓝图层能告诉你"哪些键有效"，**不能**告诉你"哪些键必需"；
- 判断某个键是否必需，靠**二分删除 + 跑客户端**，这是[第 1 章](/private-server/01-discovery)的验证闭环。
:::

## 2. 版本闸门：`Is Client Version OK`

这是整套协议里最值得抄的一段逻辑（`Library\VersionUtilityFunctions.cpp`）：

```cpp
// Library\VersionUtilityFunctions.cpp — Is Client Version OK（节选 + 注解）
void Is Client Version OK()
{
    GetEngineSubsystem_ReturnValue = GetEngineSubsystem(ConfigSubsystem);
    GetEngineSubsystem_ReturnValue.GetJSONArray("versions", GetJSONArray_KeyExists, ({  }));
    if (GetJSONArray_KeyExists)                                  // ← 有 versions 数组才做检查
    {
        // 遍历 versions 里的每一个字符串
        GetJSONArray_Value = {  };
        GetEngineSubsystem_ReturnValue.GetJSONArray("versions", GetJSONArray_KeyExists, GetJSONArray_Value);
        Array_Get(GetJSONArray_Value, Temp_int_Array_Index_Variable, out Array_Get_Item);
        LocalVersionStringFromServer = Conv_JsonValueToString(Array_Get_Item);
        GetProjectVersion(out GetProjectVersion_projectVersion);  // ← 客户端自己的版本

        // 核心判定：客户端版本是否【以服务端给的字符串开头】
        if (BooleanOR((StartsWith(GetProjectVersion_projectVersion, Conv_JsonValueToString_ReturnValue, 1)),
                      EqualEqual_StrStr_ReturnValue))
        {
            PrintString(null, "Version OK", …);
            isIt = true;                                          // 放行
        }
        else
        {
            Default__ServerUtilityFunctions_C.IsDevServer(__WorldContext, IsDevServer_IsDevServer);
            if (!IsDevServer_IsDevServer) break;                  // ← 非 dev 直接拒绝
            // dev 服：再按 主.次.修订 逐段比较，允许"比服务端列表更新"的客户端
            PrintString(null, "ClientVersion: Allow versions greater than specified on DEV", …);
            isIt = true;
        }
        return;
    }
    isIt = true;                                                  // ← 连 versions 键都没有：放行
    return;
}
```

三条必须记住的语义：

1. **前缀匹配，不是相等**：判定是 `StartsWith(客户端版本, 服务端给的串)`。所以 `versions: ["Kards 1.5"]` 会放行 `Kards 1.54`；反过来写 `["Kards 1.54"]` 就会拒绝 `Kards 1.5`。
2. **dev 服放行更新的客户端**：先逐段比 `主.次.修订`，`rev <= server.rev` 之类条件满足即放行。
3. **完全不给 `versions` 键 = 放行**（fail-open）。

### 服务端名字从哪来：`GetServerInfo`

```cpp
// Library\UtilityFunctions.cpp — GetServerInfo（节选 + 注解）
void GetServerInfo()
{
    GetDSession(__WorldContext, GetDSession_dSession);              // ← 取客户端会话对象
    StringExplode(out StringExplode_OutputStrings, GetDSession_dSession.root_url, ".", 0, false);
    if (NotEqual_IntInt(Array_Length_ReturnValue, 1))               // ← root_url 里有 "."
    {
        ServerName = ArrayGetByRef(<ArrayVariable>, <ArrayIndex>);  // ← 取按 "." 拆分的第 2 段
    }
    else                                                            // ← 没有 "."（纯 IP）
    {
        Split(GetDSession_dSession.root_url, "//", out Split_LeftS, out Split_RightS, 1, 0);
        Split(Split_RightS, ":", out Split_LeftS_1, out Split_RightS_1, 1, 0);
        ServerName = Split_LeftS_1;                                 // ← 退化为取主机名
    }
}
```

`IsLiveServer()` / `IsDevServer()` 就是拿 `ServerName` 分别与 `"live"` / `"dev"` 比较：

```cpp
void IsDevServer()  { GetServerInfo(…, GetServerInfo_ServerName);
                      IsDevServer  = EqualEqual_StrStr(GetServerInfo_ServerName, "dev"); }
void IsLiveServer() { GetServerInfo(…, GetServerInfo_ServerName);
                      IsLiveServer = EqualEqual_StrStr(GetServerInfo_ServerName, "live"); }
```

::: tip 对私服的直接含义
`endpoints.root` 里域名第二段决定你是谁（见[附录 A](/private-server/appendix/uht-structs)）。所以：

- 想让**较新客户端**也能连（本地开发常见），把 root 写成 `http://kards.dev.lan:5231` 这类第二段为 `dev` 的域名，或者干脆**在 `server_options` 里给出匹配的前缀**（如 `versions: ["Kards 1.5"]`）；
- 用纯 IP（`http://127.0.0.1:5231`）时既不是 dev 也不是 live，**判定落在前缀匹配或 fail-open 上**——这也是"用 IP 部署反而更宽松"的原因。
:::

## 3. 阵营逻辑：哪五个国家有等级

[第 3 章](/private-server/03-session)的 `*_level` / `*_level_claimed` / `*_xp` 为什么只有五国？客户端的取值函数直接回答了：

```cpp
// Library\UtilityFunctions.cpp — GetCurrentFactionLevel（完整 + 注解）
void GetCurrentFactionLevel()
{
    GetKardsGameInstancePure(__WorldContext, GetKardsGameInstancePure_instance);
    Temp_byte_Variable = faction;                       // ← 入参就是 EFactionEnum
    Temp_int_Variable = 0; Temp_int_Variable_1 = 0; … Temp_int_Variable_7 = 0;   // ← 其余国家的返回值：0
    level = switch (Temp_byte_Variable) {
    case 0:  Temp_int_Variable_7;                                             // NotAvailable → 0
    case 1:  GetKardsGameInstancePure_instance.kardsPlayerInfo.germany_level;  // Germany
    case 2:  GetKardsGameInstancePure_instance.kardsPlayerInfo.britain_level;  // Britain
    case 3:  GetKardsGameInstancePure_instance.kardsPlayerInfo.japan_level;    // Japan
    case 4:  GetKardsGameInstancePure_instance.kardsPlayerInfo.soviet_level;   // Soviet
    case 5:  GetKardsGameInstancePure_instance.kardsPlayerInfo.usa_level;      // USA
    case 6:  Temp_int_Variable_6;   // France  ┐
    case 7:  Temp_int_Variable_5;   // Italy   │
    case 8:  Temp_int_Variable_4;   // Poland  ├─ 全是 0
    case 9:  Temp_int_Variable_3;   // Finland │
    case 10: Temp_int_Variable_2;   // Anzac   │
    case 11: Temp_int_Variable_1;   // Allies  │
    case 12: Temp_int_Variable;     // Neutral ┘
    default: K2Node_Select_Default;
    };
}
```

**这就是权威答案**：只有 Germany / Britain / Japan / Soviet / USA 有等级字段，其余阵营恒返回 0。所以会话响应里的五国等级字段不是"实现偷懒"，而是客户端结构决定的。

### 阵营颜色表：`GetFactionColor`

```cpp
// Library\UtilityFunctions.cpp — GetFactionColor（完整分支 + 注解）
void GetFactionColor()
{
    // 逐级 NotEqual_ByteByte 链 = switch(faction)：else 分支才是命中项
    …
    factionColor = {FloatConst(Value=1),        FloatConst(Value=1),        FloatConst(Value=1),        FloatConst(Value=1)};        // case 0  NotAvailable → 白
    factionColor = {0.176427, 0.215,    0.192414, 1};   // case 1  Germany
    factionColor = {0.477431, 0.393208, 0.231255, 1};   // case 2  Britain
    factionColor = {0.533277, 0.327778, 0.078187, 1};   // case 3  Japan
    factionColor = {0.203,    0.137,    0.081,    1};   // case 4  Soviet
    factionColor = {0.20234,  0.23,     0.11615,  1};   // case 5  USA
    factionColor = {0.126519, 0.156197, 0.276042, 1};   // case 6  France
    factionColor = {0.21875,  0.213592, 0.207357, 1};   // case 7  Italy
    factionColor = {0.21875,  0.19,     0.127604, 1};   // case 8  Poland
    factionColor = {0.765625, 0.730399, 0.578206, 1};   // case 9  Finland
    factionColor = {0.327778, 0.158961, 0.03434,  1};   // case 10 Anzac
    /* case 11 Allies：无赋值 —— 走到这里颜色保持默认 */ 
    factionColor = {0.070448, 0.070704, 0.078125, 1};   // case 12 Neutral → 深灰
}
```

**整张颜色表都在客户端**。服务端只发阵营 ID（数字或小写名字），颜色由客户端决定——所以私服无法也不应该"自定义阵营颜色"。

### 阵营名字：`GetFactionName`（读数据表）

```cpp
// Library\UtilityFunctions.cpp — GetFactionName（节选 + 注解）
void GetFactionName()
{
    GetDataTableRowNames(DT_FactionNames, out ({  }));       // ← 遍历 DT_FactionNames 数据表
    …
    EnumCompareFaction(GetDataTableRowFromName_OutRow.faction_2_…, faction, out EnumCompareFaction_Branches);
    if (!NotEqual_ByteByte(EnumCompareFaction_Branches, 0))  // ← 命中相等分支
    {
        factionName = GetDataTableRowFromName_OutRow.factionName_6_…;
        return;
    }
    factionName = …;                                          // 未命中
}
```

::: warning 阵营显示名不在协议里
`DT_FactionNames` 是**客户端内置数据表**。服务端从不下发、也无法下发阵营显示名——它只发 ID。想做本地化用的"德国/英国"，得改客户端的资源包，不是改服务端。
:::

## 4. 会话字段：蓝图读什么、不读什么

统计 34 个蓝图产物里 `dSession.<字段>` 的引用次数，结果很说明问题：

| 字段 | 次数 | 说明 |
|---|---|---|
| `cards_reserve_changes` | 12 | 卡牌替补池变更（服务端下发） |
| `root_url` | 4 | 仅用于 dev/live 判定 |
| `locked_cards` / `all_knockout_tourneys` | 3 / 2 | 锁卡与淘汰赛 |
| `server_time_on_logon`、`IsNoIAP`、`current_mini_sit_n_go` … | 1 | 零散读取 |

而 **`backend_endpoints`、`matches2`、`lobbyplayers`、`actions_url`、`match_url` 在蓝图产物里零命中**。结论：

> **URL 拼装与请求发起全在 C++ 层**（会话/请求管理器），蓝图只消费"数据字段"。所以想靠反编译蓝图搞清端点拼接顺序是走不通的——那部分只能靠抓包（[第 1 章](/private-server/01-discovery)）。

## 5. 自己复现这些结论

```bash
# 1) 批量反编译（--inline 把 dispatch 体内联回事件函数，--opt 做临时量值流内联）
KismetDecompiler --input <导出目录> --usmap <m.usmap> \
                 --uhtdump <UHTHeaderDump> --inline --opt --out Decompiled\kards

# 2) 找某个配置键的读取点
rg -n 'GetServerConfig(Float|Int|Bool)\("'        Decompiled/kards
rg -n 'Get(String|Bool|Int|Float|JSONArray|JSONObject)\("[^"]+"' Decompiled/kards

# 3) 找枚举分支与颜色/等级表
rg -n 'NotEqual_ByteByte\(' Decompiled/kards/Library/UtilityFunctions.cpp
rg -n 'switch \(Temp_byte_Variable\)' Decompiled/kards
```

::: details 反编译产物的已知上限
- 未解析的文本字面量会显示成 `UAssetAPI.Kismet.Bytecode.FScriptText`（例如 `Format` 的模板串）；
- 通配/数组下标会显示成 `<Target>` / `<ArrayVariable>` / `<ArrayIndex>`；
- 大型蓝图（如 `BP_BaseCard`）产物极大（百 MB 量级），**不要整体阅读**，用 `rg` 定位函数再读那一段。
:::
