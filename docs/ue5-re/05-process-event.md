---
title: 05 · ProcessEvent
---

# 05 · ProcessEvent

前面几章都是「读」——读对象、读名字、读字段。`ProcessEvent` 是跨到「**调用**」的那一步：它让外部代码能够调用
游戏里**任意一个反射函数**，包括蓝图生成的函数。这也是为什么它是 UE 逆向里被研究得最多的一个函数。

::: warning 风险提示
`ProcessEvent` 相关操作直接改变游戏行为，崩溃率远高于「只读」操作，而且在多数在线游戏里属于明确禁止的行为。
本章讲原理与结构，不针对任何具体游戏给出可用偏移或索引数值——那些必须由你在自己的目标上实测。
:::

## 它是谁

`UObject::ProcessEvent` 是 `UObject` 的一个虚函数，签名大致是：

```cpp
void UObject::ProcessEvent(UFunction* Function, void* Parms);
```

它定义在 `UObject` 的头文件里（UE5 为 `Engine/Source/Runtime/CoreUObject/Public/UObject/Object.h`，
可通过 [GitHub 代码搜索](https://github.com/search?q=repo%3AEpicGames%2FUnrealEngine+ProcessEvent+filename%3AObject.h&type=code)
在 Epic 的引擎仓库中检索到；UE4 的公开镜像见
[`UnrealTournament` 的同一路径](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Object.h)）。

两个参数决定了它的用法：

| 参数 | 含义 |
|---|---|
| `UFunction* Function` | 要调用的函数对象——**必须来自反射系统**，也就是你从对象数组里找到的那个 `UFunction` |
| `void* Parms` | 一块**参数缓冲区**，布局由 `UFunction` 描述 |

## UFunction 里有什么

这是全章最关键的结构。UE4 公开源码里 `UFunction` 的持久字段：

```cpp
// Persistent variables.
uint32  FunctionFlags;
uint16  RepOffset;
uint16  ParmsSize;
uint16  ReturnValueOffset;
// The event graph this function calls in to (persistent)
UFunction* EventGraphFunction;
```

（出自 Epic 公开的 UE4 源码 [`Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/Class.h)）

对逆向来说，这四个字段各有明确用途：

| 字段 | 用途 |
|---|---|
| `ParmsSize` | **参数缓冲区要分配多大**。调用前按它开内存，不能猜 |
| `ReturnValueOffset` | 返回值在缓冲区里的**偏移**（返回值本身也是「一个参数」） |
| `FunctionFlags` | 函数性质（是否蓝图可调用、是否静态、是否网络函数……），用来判断这个函数能不能按你的想法调 |
| `EventGraphFunction` | 指向事件图对应的函数，解释蓝图事件如何进入 `ExecuteUbergraph` |

::: tip 拼参数的最小流程
1. 从对象数组里找到目标 `UFunction`（按名字筛）；
2. 读它的 `ParmsSize`，分配一块这么大的缓冲区；
3. 按参数的属性（`FProperty` 链）把值写进缓冲区的对应偏移；
4. 调 `ProcessEvent(obj, func, buf)`；
5. 返回值在 `ReturnValueOffset` 处读出来。

第 3 步的「按属性写值」需要遍历 `UFunction` 的参数属性链——这也是为什么[第 01 章](/ue5-re/01-object-model)要先讲清楚
`FProperty` / `FField`。
:::

## vtable 槽位：为什么本专题不给具体数字

`ProcessEvent` 是虚函数，调用它要靠 **vtable 里的槽位索引**。问题是这个索引**会变**：

- 随 UE 版本变（不同版本 `UObject` 的虚函数数量不同）；
- 随游戏变（有些游戏自己往 `UObject` 里加了虚函数）。

最直接的证据是 Dumper-7 专门为它留了一个覆盖入口：

```cpp
// ProcessEvent
Off::InSDK::InitPE(/*PEIndex*/);
```

（出自 [Dumper-7 README · Overriding Offsets](https://github.com/Encryqed/Dumper-7#overriding-offsets)）

**一个连自动 dump 工具都要留手动覆盖口的字段，你把它写死在代码里就一定会出问题。** 正确做法是：

1. 先在目标上确认索引（用调试器看 vtable，或从 `UFunction::Invoke` / `ProcessInternal` 的调用点反推）；
2. 把索引做成配置项，而不是常量；
3. 每次游戏更新后重新确认。

## 怎么定位

三条路，按可靠性排序：

### 路线一：从 `UFunction` 反推（结构线索）

`UFunction` 也是 `UObject`，所以它**就在对象数组里**。你可以遍历对象数组，找到 `FunctionFlags` / `ParmsSize` 看起来
合理的对象，再顺着它的 vtable 或它的调用者回溯 `ProcessEvent`。这条路的优点是**只依赖 `GObjects`**，不需要额外特征码。

### 路线二：特征码

和[第 06 章](/ue5-re/06-aob)一样扫代码。注意 UE4SS 对这类签名的要求写得很具体，例如
`StaticConstructObject` 的签名要求返回 `StaticConstructObject_Internal` 的起始地址，而它的扫描方式是
「扫 `UUserWidget::InitializeInputComponent` 中间的一个 call，再解析这个 call 的位置」
（[UE4SS 文档](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)）——**先找一个好找的函数，再从它内部
的 call 走到目标函数**，是这类定位的通用套路。

### 路线三：从字符串与日志回溯

`UFunction::Invoke`、`ProcessInternal` 这类函数在出错路径上常常会引用函数名/类名字符串，用 xref 回溯也很常见。

（路线一、三为经验做法；路线二有上述一手出处。）

## Hook 方式

| 方式 | 做法 | 代价 |
|---|---|---|
| **vtable hook** | 把 `UObject`（或其某个实例）vtable 里 `ProcessEvent` 那一格改成自己的函数 | 需要处理 vtable 所在页的写保护；对「所有对象」还是「某个对象」要分清楚 |
| **inline hook / detour** | 直接改 `ProcessEvent` 函数开头的字节，跳到自己的实现 | 需要 hook 库（[MinHook](https://github.com/TsudaKageyu/minhook) 是最常用的一个）；要处理指令长度与 trampoline |
| **外部插桩** | 用 [frida](https://github.com/frida/frida) 之类从外部注入 | 不修改文件；但依赖插桩框架在目标进程里的存活 |

（三种方式的存在性有工具层面的一手依据；具体写法属于实现细节，请对照对应工具的文档。）

一个有意思的旁证：UE4SS 的致谢名单里专门有一条 **「boop / usize — New UFunction hook method」**
（出自 [UE4SS 文档首页 · Credits](https://docs.ue4ss.com/)），说明**连 hook `UFunction` 的方法本身都在演进**，
不存在「一次写对、永远可用」的实现。

## 调用的三种典型用途

理解用途有助于判断自己是不是走对了路：

1. **读游戏状态**：有些数据没有暴露成属性，但有一个 getter 函数，调它比硬解结构更稳；
2. **改游戏行为**：调用 setter、触发事件、给角色加状态——**这是风险最高的一类**；
3. **验证理解**：调一个你从静态资产里已经读懂的函数，看结果是否符合预期。**这是学习阶段最推荐的用法。**

## 常见坑

| 坑 | 表现 | 应对 |
|---|---|---|
| `ParmsSize` 没读，凭猜分配缓冲区 | 崩溃或参数错位 | 永远从 `UFunction` 读 |
| 忘了返回值也是参数 | 返回值读不到，或参数区被踩 | 用 `ReturnValueOffset` |
| vtable 索引写死 | 换版本/换游戏即崩 | 做成配置，参考 Dumper-7 的 `InitPE` 思路 |
| 对象已被 GC | 随机崩溃，难以复现 | 调用前确认对象有效；不要长期持有裸指针 |
| 在错误的线程上调用 | 时好时坏 | 与游戏主循环线程保持一致（经验做法，无一手出处） |

（前四行的依据为上述 `UFunction` 结构与工具实现；最后一行属经验做法。）

## 相关

- [01 · 对象模型](/ue5-re/01-object-model) —— `UFunction` 与 `FProperty` 在类型体系里的位置
- [02 · 定位 GObjects](/ue5-re/02-gobjects) —— `UFunction` 对象从哪来
- [04 · 定位 GWorld](/ue5-re/04-gworld) —— 常见的调用目标（World / PlayerController）怎么找
- [06 · AOB 特征码](/ue5-re/06-aob)
- [附录 · 出处清单](/ue5-re/appendix/sources)
