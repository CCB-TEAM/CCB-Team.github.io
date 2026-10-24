# 10 · UE4SS Lua 模块

前九章讲的是**手动**找锚点：自己扫特征码、自己解 RIP 相对地址、自己挂 hook。
这一章讲另一条路——**用 UE4SS 的 Lua 层**，把同样的能力写成脚本。

两者不是替代关系。理解这一章的前提，恰恰是前九章：UE4SS 的 Lua API 看起来是
「`obj.SomeProperty`、`obj:SomeFunction()`」这种自然语法，但**它底下用的就是
`GUObjectArray` 和名称池**——也就是你在[第 02 章](/ue5-re/02-gobjects)和
[第 03 章](/ue5-re/03-gnames)里手工定位的那两个全局量。**UE4SS 只是把它们包装成了脚本接口。**

本章依据

- 官方 API 定义：[UE4SS Documentation · Lua API](https://docs.ue4ss.com/dev/lua-api.html)（文档标注版本 4.0.0；
  本章实测环境是 UE4SS v3.0.1 Beta，个别 API 可能尚未存在）
- 安装与目录结构：[UE4SS Documentation · Installation](https://docs.ue4ss.com/dev/installation-guide.html)
- 代码实例：KARDS（UE 5.6）实际安装目录下的 mod，非二手转述

## 目录结构：mod 是怎么被找到的

UE4SS 的安装分两个目录（官方文档的核心概念）：

| 概念 | 内容 |
|---|---|
| **root directory** | 放 `UE4SS.dll` 本身 |
| **working directory** | 放配置与 mod，通常在 root 下的 `ue4ss/` |
| **game executable directory** | 游戏真正的 exe 所在目录（如 `.../Binaries/Win64/`） |

基础安装把三者合一：所有文件丢进 `game executable directory`，靠一个代理 DLL
（默认 `dwmapi.dll`）让游戏加载 UE4SS。**这正是[第 09 章](/ue5-re/09-minhook)里
「怎么把它送进游戏」那条代理 DLL 路线**——UE4SS 自己就是这么进场的。

mod 的目录形态：

```
ue4ss/
├─ UE4SS.dll
├─ UE4SS-settings.ini
├─ UE4SS.log
└─ Mods/
   ├─ mods.txt                  ← 全局加载顺序 + 开关
   ├─ shared/                   ← 共享库（require 从这里找）
   │  └─ UEHelpers/UEHelpers.lua
   ├─ ConsoleEnablerMod/
   │  └─ Scripts/main.lua       ← 入口固定叫 main.lua
   └─ UMGInspectorMod/
      └─ Scripts/main.lua
```

三条规则：

1. **入口固定是 `Scripts/main.lua`**。目录名就是 mod 名。
2. **`Mods/mods.txt` 控制加载与顺序**，格式是 `ModName : 1`（1 开，0 关）：
   ```
   ConsoleEnablerMod : 1
   SplitScreenMod : 0
   ```
   顺序有意义——后加载的可以覆盖前面的。
3. **`shared/` 下的东西可以被 `require`**。实测的 `UEHelpers` 就是这么被引用的：
   ```lua
   local UEHelpers = require("UEHelpers")
   ```

`UE4SS-settings.ini` 里另有一批总开关，实测这个安装开了
`bUseUObjectArrayCache = true`（对象数组缓存，影响遍历性能）与
`GuiConsoleEnabled = 1`。

## 核心原理：一个 `__index` 元方法撑起整个对象模型

这是整章最该记住的一点。

UE4SS **没有**为每个 UE 类生成 Lua 绑定。你打开任意一个 mod，都找不到
`UPlayerController.lua` 这类文件。它做的是：给 `UObject` 包一层 Lua 表，
用 `__index` / `__newindex` 元方法**在运行时查反射**。

所以这两行能工作：

```lua
local Keys = InputSettings.ConsoleKeys        -- 读属性
card:K2_SetActorRotation(newRot, false)       -- 调用 UFunction
```

机制上，`InputSettings.ConsoleKeys` 触发的是一次 `__index("ConsoleKeys")`：
拿这个对象的 `UClass`，在它的反射数据里按名字找 `FProperty`，找到就按偏移读内存。
`card:K2_SetActorRotation` 触发的是一次 `__index("K2_SetActorRotation")`：
同样按名字找，但找到的是 `UFunction`，返回一个可调用对象。

官方 API 文档对 `UObject.__index` 的描述是「Attempts to return either a member
variable or a callable UFunction」——**读属性和取函数走的是同一个入口**，这正是它能
「对任何游戏的任何类都生效」的原因：它不需要预先知道类长什么样。

代价也很直接：

- **拼错名字只在运行时炸**，没有编译期检查；
- 每次访问都是一次按名字的反射查找，比原生偏移慢；
- 所以高频逻辑要**先把对象和值取出来**，不要在内层循环里反复 `obj.A.B.C`。

配套的两个概念：

| 类型 | 含义 |
|---|---|
| `RemoteObject` | 包装一个**游戏拥有**的 C++ 对象，持有指针 |
| `LocalObject` | 完全由 Lua 拥有的内联对象（如 `FName`） |

以及 `IsValid()`——**每个 `RemoteObject` 都有**。这不是形式主义：对象会被 GC 掉，
你手上的指针下一秒可能就无效了。官方定义里 `CreateInvalidObject()` 的存在也说明
「无效对象」是一等公民。

## 对象查找：全部通向 GObjects + GNames

这是与[第 02 章](/ue5-re/02-gobjects)、[第 03 章](/ue5-re/03-gnames)衔接最紧的一节。

UE4SS 提供了一整族查找函数：

| 函数 | 走什么 |
|---|---|
| `StaticFindObject("/Script/Engine.Default__InputSettings")` | 按**完整路径**查，等价于引擎的 `StaticFindObject` |
| `FindFirstOf("BP_BoardCard_C")` | 按**短类名**找第一个非默认实例 |
| `FindAllOf("BP_BoardCard_C")` | 按**短类名**找全部非默认实例 |
| `FindObject(ClassName, ShortName, ...)` | 按类名或短名 |
| `FindObjects(N, ClassName, ...)` | 批量版本 |
| `ForEachUObject(function(obj, ChunkIndex, ObjectIndex) ... end)` | **直接遍历 `GUObjectArray`** |

`ForEachUObject` 的回调签名把底牌亮出来了：`(object, ChunkIndex, ObjectIndex)`。
**ChunkIndex 就是分块数组的块号**——和第 02 章讲的那个
`FChunkedFixedUObjectArray` 一模一样。

换句话说：**你在第 02 章手写的「遍历对象数组、按类名筛」，UE4SS 把它变成了 `FindAllOf`。**
区别只是它内部还要用名称池把每个对象的 `ClassPrivate` 解成字符串来比对——正是
第 03 章讲的那条链。

实测例子（`UMGInspectorMod`，把桌上每张牌持续旋转）：

```lua
local cards = FindAllOf("BP_BoardCard_C")
for _, card in ipairs(cards) do
    if card and card:IsValid() and not string.find(card:GetFullName(), "Default__") then
        local currentRot = card:K2_GetActorRotation()
        card:K2_SetActorRotation({ Pitch = currentRot.Pitch,
                                   Yaw = currentRot.Yaw + 15,
                                   Roll = currentRot.Roll }, false)
    end
end
```

三个细节值得注意：

1. **`Default__` 过滤**。`FindAllOf` 会连带返回**类默认对象（CDO）**，它的名字形如
   `Default__BP_BoardCard_C`。CDO 不是场景里的实体，改它等于改所有实例的默认值——
   想要「只改这一个」就必须过滤掉。这和上一章实测里 `UWorld` 枚举出 `Default__World`
   是同一件事。
2. **`IsValid()` 在每次使用前都调**。遍历和后续操作之间对象可能已被 GC。
3. **`K2_` 前缀**是蓝图可调用函数的命名约定（`K2_` 源于 Kismet）。带这个前缀的
   UFunction 就是蓝图里能直接拖出来的那些。

## Hook 体系

UE4SS 的 hook 分几层，粒度从粗到细：

### `RegisterHook`：挂某个 UFunction

```lua
local Pre, Post = RegisterHook("/Script/Engine.PlayerController:ClientRestart",
function(Context)
    CreateConsole()
end)
```

路径格式是 `/<包路径>.<类>:<函数名>`。

**返回的是两个 id，两个都要留着**——注销时两个都得传：

```lua
UnregisterHook("/Script/Engine.PlayerController:ClientRestart", Pre, Post)
```

（官方定义原文：「Returns two ids, both of which must be passed to `UnregisterHook`」。
只存一个的代码在注销时会静默失败或报错，这是常见笔误。）

`Pre` 在目标函数执行前触发、`Post` 在执行后触发，两个 id 对应这两个时机。

### `NotifyOnNewObject`：对象构造时回调

```lua
NotifyOnNewObject("/Script/Engine.Actor", function(NewActor)
    -- 每个 AActor（含子类）被构造时都会进来
end)
```

**这一条直接连着[第 09 章](/ue5-re/09-minhook)。** 「对象被构造时回调」这个能力，
引擎里唯一能挂的点就是 `UObject::StaticConstructObject_Internal`——也就是本专栏
第 09 章让你用 MinHook 挂的那个函数。UE4SS 的实现方式一样是 inline hook，
它在自己的日志里把这件事写得很清楚：

```text
[PS] Found EngineVersion: 5.6
StaticConstructObject_Internal address: 0x7ff633f96c80 <- Lua Script
Waiting for object construction...
```

那行 `Waiting for object construction...` 就是它挂完 `StaticConstructObject` 之后的等待。

**推论**：`NotifyOnNewObject` 的粒度是**全引擎每一次对象构造**。启动期这个函数每秒被调用
上千次（本专栏实测：45 秒 72,423 次）。所以回调里做重活会直接把游戏拖垮——和第 09 章
「detour 里零 I/O」是同一条纪律。

### `RegisterCustomEvent`：按蓝图事件名

```lua
RegisterCustomEvent("SomeBlueprintEventName", function(...) end)
```

注册后，任何蓝图调用同名事件都会进你的回调。不需要知道是哪个类——按名字匹配。

### 专用 hook

一批常用时机被做成了专用函数，省掉自己写路径：

`RegisterLoadMapPreHook` / `RegisterLoadMapPostHook`、`RegisterInitGameStatePreHook` /
`PostHook`、`RegisterBeginPlayPreHook` / `PostHook`、
`RegisterProcessConsoleExecPreHook` / `PostHook`、
`RegisterCallFunctionByNameWithArgumentsPreHook` / `PostHook`、
`RegisterULocalPlayerExecPreHook` / `PostHook`。

**它们的回调参数是「引用包装」而不是值**：官方定义反复强调
「Params (except strings & bools & FOutputDevice) must be retrieved via `Param:Get()`
and set via `Param:Set()`」。也就是说你拿到的是 `RemoteUnrealParam`，要显式 `:Get()`
取值、`:Set()` 写回。**能写回这一点很关键**——这类 hook 可以改参数、甚至改返回值
（文档说明了返回 `true`/`false` 会覆盖原返回值）。

### 控制台命令

```lua
RegisterConsoleCommandHandler("mycommand", function(Cmd, Parts, Ar)
    Ar:Log("hello\n")
    return true   -- 返回 true 表示不再传给其他 handler
end)
```

两个变体：`RegisterConsoleCommandHandler` 只在 `UGameViewportClient` 上下文运行，
`RegisterConsoleCommandGlobalHandler` 对所有上下文生效。

## 线程模型：为什么需要 `ExecuteInGameThread`

UE 的对象操作**不是线程安全的**。UE4SS 的 Lua 回调可能不在游戏线程上执行，
所以它提供了一组调度函数：

| 函数 | 语义 |
|---|---|
| `ExecuteInGameThread(fn)` | 用 `ProcessEvent` 把 `fn` 塞进游戏线程，游戏有空时执行 |
| `ExecuteAsync(fn)` | 异步执行 |
| `ExecuteWithDelay(ms, fn)` | 延迟执行 |
| `LoopAsync(ms, fn)` | 循环执行，回调返回 `true` 时停止 |

实测的 `ConsoleEnablerMod` 把它当成了兜底：

```lua
--- In cases where ClientRestart runs earlier than ExecuteInGameThread
if (not WasConsoleCreated or IsDynamicViewport) then
    ExecuteInGameThread(CreateConsole)
end
```

**这条纪律和上一章一样**：上一章是「detour 里不做重活」，这里是「碰 UE 对象要回游戏线程」。
两者都是同一个原因——你是在别人的进程里、别人的时序上做事。

## 签名系统：`UE4SS_Signatures/`

UE4SS 的内置签名覆盖不到所有游戏时，需要你自己补。目录是
`<working directory>/UE4SS_Signatures/`，**文件名必须与目标同名且大小写敏感**。

每个签名是一个 Lua 文件，两个函数：

```lua
function Register()
    return "4C 8B DC 55 53 41 56 49 8D AB 28 FE FF FF 48 81 EC C0 02 00 00 ..."
end

function OnMatchFound(MatchAddress)
    return MatchAddress
end
```

- `Register()` 返回 AOB 字符串，`??` 是通配符
- `OnMatchFound(MatchAddress)` 拿到命中地址后做后处理——**RIP 相对寻址的解算就写在这里**
  （[第 06 章](/ue5-re/06-aob)的三种写法），返回最终地址

这一整套和第 06 章讲的特征码是同一件事，只是把「写在 C++ 里」换成了「写在 Lua 里」。
第 06 章新增的**位移特征码**技巧在这里同样适用。

## 实测：一个完整 mod 长什么样

`ConsoleEnablerMod` 只有 88 行，但把主要机制都用上了：

```lua
-- 1) 引用共享库
local UEHelpers = require("UEHelpers")

-- 2) 准备 FName（名称池查询）
local KeysToAdd = { UEHelpers.FindFName("Tilde"), UEHelpers.FindFName("F10") }

-- 3) 按完整路径找对象，读写它的属性
local InputSettings = StaticFindObject("/Script/Engine.Default__InputSettings")
local ConsoleKeys = InputSettings.ConsoleKeys
for i = 1, #ConsoleKeys do
    print(string.format("ConsoleKey[%d]: %s\n", i, ConsoleKeys[i].KeyName:ToString()))
end

-- 4) 找一个 UClass，然后构造对象（就是第 09 章 hook 的那个函数）
local ConsoleClass = StaticFindObject("/Script/Engine.Console")
local CreatedConsole = StaticConstructObject(ConsoleClass, GameViewport)
GameViewport.ViewportConsole = CreatedConsole

-- 5) 挂 hook，并在不需要时注销
local Pre, Post = RegisterHook("/Script/Engine.PlayerController:ClientRestart",
function(Context) CreateConsole() end)
```

注意 `UEHelpers` 这个共享库——它是社区维护的**常用链封装**，把第 04、08 章那些
「从 `UWorld` 走到 `PlayerController`」的路径做成了函数：

```lua
UEHelpers.GetEngine()            UEHelpers.GetGameInstance()
UEHelpers.GetWorld()             UEHelpers.GetPlayerController()
UEHelpers.GetPlayer()            UEHelpers.GetPersistentLevel()
UEHelpers.GetGameModeBase()      UEHelpers.GetGameStateBase()
UEHelpers.GetAllPlayers()        UEHelpers.GetActorFromHitResult(HitResult)
UEHelpers.FindFName(Name)        UEHelpers.FindOrAddFName(Name)
```

**这些正是第 08 章「路径 7：本地玩家链」那类工作**。区别是那些链在 Lua 里可以直接
顺着属性走，因为每个 `UPROPERTY` 的偏移都能从 SDK dump 里查到，不需要扫特征码——
这也印证了第 08 章结尾那句「能用反射解决的，不要用内存扫描」。

## 常见坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 忘了过滤 CDO | 改了「所有牌」的默认值，或者改完没反应 | `GetFullName()` 里含 `Default__` 的是 CDO，过滤掉 |
| 不调 `IsValid()` | 随机崩溃，难复现 | 取到对象后、使用前都判一次；GC 随时会回收 |
| 在 hook 回调里做重活 | 游戏卡顿 | `NotifyOnNewObject` / `RegisterHook` 的回调每秒可能上千次，只做记账与入队 |
| 跨线程碰对象 | 随机崩、数据错乱 | 用 `ExecuteInGameThread` / `ExecuteWithDelay` |
| `RegisterHook` 只存一个 id | 注销失败 | 返回的是 `Pre, Post` 两个，注销时都要传 |
| 专用 hook 的参数当值用 | 拿到的是包装对象，比较/打印结果不对 | `Param:Get()` / `Param:Set()` |
| 拼错属性名 | 运行时才炸 | 没有编译期检查，改名前先用 `Reflection():GetProperty(name)` 确认存在 |
| `mods.txt` 里顺序不对 | 覆盖没生效 | 后加载的覆盖先加载的 |

（表中内容为官方 API 定义与实测代码的推论，未逐条标注一手出处。）

## 与手动路线怎么选

| 场景 | 建议 |
|---|---|
| 改属性、调函数、按类名找对象 | **用 UE4SS Lua**。这些全是反射能解决的，手写 C++ 是重复劳动 |
| 拦某个具体函数的参数/返回值 | UE4SS 的 `RegisterHook` 够用；要指令级干预才上 MinHook |
| 高频、低延迟、性能敏感 | **手写 C++**。Lua 的反射查找和 GC 不适合热路径 |
| 反射覆盖不到的东西（真正的全局量、非反射状态） | **手写**，见第 08 章 |
| 游戏没装 UE4SS，或不想装 | 手写，见第 09 章 |

一句话：**能用反射解决的用 Lua，反射覆盖不到的才动内存扫描。** 这也是第 08 章
结尾给的那条优先级建议，只是换了个实现层。

## 相关

- [02 · 定位 GObjects](/ue5-re/02-gobjects) —— `ForEachUObject` 底下的那个数组
- [03 · 定位 GNames](/ue5-re/03-gnames) —— `FindAllOf` 按类名筛靠的就是它
- [06 · AOB 特征码](/ue5-re/06-aob) —— `UE4SS_Signatures/*.lua` 里写的东西
- [08 · 定位路径速查](/ue5-re/08-anchor-paths) —— `UEHelpers` 那批函数对应的路径
- [09 · MinHook 上手](/ue5-re/09-minhook) —— `NotifyOnNewObject` 底下挂的是什么
- [附录 · 出处清单](/ue5-re/appendix/sources)
