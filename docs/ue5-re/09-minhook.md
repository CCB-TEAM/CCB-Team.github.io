---
title: 09 · MinHook 上手
---

# 09 · MinHook 上手

[第 08 章](/ue5-re/08-anchor-paths)解决了「地址在哪」，这一章解决「拿到地址之后怎么挂上去」。

::: warning 边界
本章面向**单机 mod、私服研究、自己项目的调试**。**不涉及**反作弊绕过、检测规避、驱动级隐藏。
在线多人游戏里注入/hook 通常违反 EULA 与 ToS，请自行确认你的目标与授权。

下面的代码是**骨架**：所有 `OFFSET_*` 都必须你在自己的目标上实测填进去，
**不要照抄任何数值**。
:::

## 先选 hook 位置

UE 给了三个层次的介入点，代价与收益完全不同：

| 位置 | 粒度 | 优点 | 代价 |
|---|---|---|---|
| **inline hook `exec*` 函数** | 单个操作码 | 能看到每条指令级的行为 | 每个版本/每个游戏地址都不同；要处理 trampoline |
| **替换 `GNatives` 表项** ⭐ | 单个操作码，全局 | **不改指令字节、不碰页保护**；UE 独有 | 需要先定位 `GNatives` |
| **VMT hook `ProcessEvent`** | 所有跨对象调用 | 能一次看到「谁调了哪个函数」 | 要处理 vtable 写保护；拿到的是函数名不是指令 |
| **inline hook `ProcessLocalScriptFunction`** | 每次蓝图函数调用 | 能看到调用树、参数栈 | 高频，日志会爆 |

::: tip 优先级建议
**先 `ProcessEvent` 看全貌 → 再 `GNatives` 做精确干预 → 最后才 inline hook。**
反过来做的话，你会在还不知道发生了什么的时候就开始改字节。
:::

---

## MinHook 基本用法

[MinHook](https://github.com/TsudaKageyu/minhook) 是 Windows x86/x64 的 inline hook 库。
API 很窄（以下签名出自其 `include/MinHook.h`）：

```c
MH_STATUS MH_Initialize(void);
MH_STATUS MH_Uninitialize(void);

MH_STATUS MH_CreateHook(LPVOID pTarget, LPVOID pDetour, LPVOID *ppOriginal);
MH_STATUS MH_CreateHookApi(LPCWSTR pszModule, LPCSTR pszProcName, LPVOID pDetour, LPVOID *ppOriginal);

MH_STATUS MH_EnableHook(LPVOID pTarget);
MH_STATUS MH_DisableHook(LPVOID pTarget);
MH_STATUS MH_RemoveHook(LPVOID pTarget);

MH_STATUS MH_QueueEnableHook(LPVOID pTarget);
MH_STATUS MH_QueueDisableHook(LPVOID pTarget);
MH_STATUS MH_ApplyQueued(void);
```

两个必须知道的点：

1. **`MH_ALL_HOOKS` 是 `NULL`，但只有 `Enable`/`Disable`/`QueueEnable`/`QueueDisable` 认它**：
   `MH_EnableHook(MH_ALL_HOOKS)` 会启停全部已创建的 hook。**`MH_RemoveHook` 不认**——见下面的警告；
2. **多个 hook 要用队列 API**。官方 README 的原话是：
   *"This is the preferred way of handling multiple hooks as every call to `MH_EnableHook` or `MH_DisableHook`
   suspends and resumes all threads."*——**每次 `MH_EnableHook` 都会挂起并恢复所有线程**，
   挂 10 个 hook 就是 10 次全局停顿。

### 最小骨架

```cpp
#include <MinHook.h>

bool InitHooks()
{
    if (MH_Initialize() != MH_OK) return false;

    // 1) 创建：pTarget 是你在第 08 章找到的地址
    if (MH_CreateHook((LPVOID)OFFSET_PROCESS_EVENT,
                      (LPVOID)&hkProcessEvent,
                      (LPVOID*)&origProcessEvent) != MH_OK) return false;

    // 2) 启用：多个 hook 时用 QueueEnableHook + ApplyQueued
    MH_QueueEnableHook((LPVOID)OFFSET_PROCESS_EVENT);
    if (MH_ApplyQueued() != MH_OK) return false;

    return true;
}

void UninitHooks()
{
    MH_DisableHook(MH_ALL_HOOKS);
    MH_RemoveHook(g_target);   // ← 必须传目标地址，MH_ALL_HOOKS 在这里无效
    MH_Uninitialize();
}
```

::: warning 卸载顺序
`MH_DisableHook` → `MH_RemoveHook` → `MH_Uninitialize`。
顺序错了会在游戏退出时崩——这类崩溃很容易被误判成「hook 写错了」。
:::

::: danger `MH_RemoveHook(MH_ALL_HOOKS)` 是个静默空操作
上面的卸载片段在社区里流传很广（本章早期版本也这么写），但**那一行是错的**。

MinHook 的 `hook.c` 里，`MH_EnableHook` / `MH_DisableHook` / `MH_QueueEnableHook` /
`MH_QueueDisableHook` 都有 `pTarget == MH_ALL_HOOKS` 的分支，**`MH_RemoveHook` 没有**：

```c
MH_STATUS WINAPI MH_RemoveHook(LPVOID pTarget)
{
    ...
    UINT pos = FindHookEntry(pTarget);   // 没有 MH_ALL_HOOKS 分支
    if (pos != INVALID_HOOK_POS) { /* 移除这一个 */ }
    else status = MH_ERROR_NOT_CREATED;
    ...
}
```

而 `FindHookEntry` 是拿参数和每个 hook 的 `pTarget` 逐项比地址。`MH_ALL_HOOKS` 就是 `NULL`，
于是它去找「target 为 `NULL` 的 hook」，找不到，返回 `MH_ERROR_NOT_CREATED`。
**一个 hook 都不会被移除，而返回值通常被忽略。**

后果分两种：

| 场景 | 后果 |
|---|---|
| `Remove` 之后紧跟 `MH_Uninitialize` | 基本无害——`MH_Uninitialize` 内部会 `EnableAllHooksLL(FALSE)` 并释放 trampoline |
| 只想摘掉一个 hook、保留 MinHook 初始化继续跑 | **真的漏**：hook 项与 trampoline 都留着 |

正确写法是传**真实的目标地址**：

```cpp
MH_DisableHook(g_target);
MH_RemoveHook(g_target);   // 必须传地址
```

（依据：MinHook `src/hook.c` 的 `MH_RemoveHook` 与 `FindHookEntry` 源码，非二手转述。
本站在 KARDS（UE 5.6）上实测确认 `MH_RemoveHook(MH_ALL_HOOKS)` 返回 `MH_ERROR_NOT_CREATED`
且不产生任何移除效果。）
:::

---

## 示例 1：VMT hook `ProcessEvent`（推荐起点）

`ProcessEvent` 是虚函数，所以最自然的挂法是**换 vtable 里的那一格**。
注意：**这不是 MinHook 的活**——MinHook 做的是 inline hook，VMT 要自己改指针。

```cpp
// 1) 拿到一个已知对象的 vtable（例如从 GUObjectArray 取第一个对象）
void** vtable = *(void***)someUObject;

// 2) 找到 ProcessEvent 在 vtable 里的槽位
//    ⚠️ 这个索引随版本/游戏变化，必须实测（见运行时逆向 05 章）
constexpr int PROCESS_EVENT_INDEX = /* 实测 */ -1;

// 3) 改页保护，替换槽位，恢复保护
DWORD oldProtect;
VirtualProtect(vtable, sizeof(void*) * VTABLE_SIZE, PAGE_EXECUTE_READWRITE, &oldProtect);
origProcessEvent = (ProcessEventFn)vtable[PROCESS_EVENT_INDEX];
vtable[PROCESS_EVENT_INDEX] = (void*)&hkProcessEvent;
VirtualProtect(vtable, sizeof(void*) * VTABLE_SIZE, oldProtect, &oldProtect);
```

Detour 的签名——**x64 下 `this` 走 RCX，后面依次是 RDX / R8 / R9**：

```cpp
using ProcessEventFn = void(__fastcall*)(void* self, void* function, void* parms);
ProcessEventFn origProcessEvent = nullptr;

void __fastcall hkProcessEvent(void* self, void* function, void* parms)
{
    // 在这里读 self / function，但**不要**在这里做重活
    LogCall(self, function);
    origProcessEvent(self, function, parms);   // 一定要调回去
}
```

::: warning 三个坑
1. **要 hook 哪个 vtable？** 不同类有各自的 vtable。想让**所有**对象都生效，得改基类
   （`UObject`）的那张，或者对每个类分别改；
2. **vtable 所在页可能是只读的**，必须 `VirtualProtect`；
3. **`ProcessEvent` 是高频函数**。在里面做 I/O、加锁、分配内存，会让游戏卡到不能玩。
   正确做法是**只往环形缓冲里写指针，另开线程消费**。
:::

---

## 示例 2：替换 `GNatives` 表项（UE5 最干净的 hook）

[13 章](/ue5-bp/13-vm)讲过，UE5 的 VM 分派是查表：

```cpp
int32 B = *Code++;
(GNatives[B])(Context, *this, RESULT_PARAM);
```

而 `GNatives` 是一张可写的全局表（`TStaticArray<FNativeFuncPtr, EX_Max>`）。
**换一格 = 换掉某个操作码的全局行为，且不改任何指令字节。**

```cpp
using NativeFn = void(__fastcall*)(void* Context, void* Stack, void* Result);

// OFFSET_GNATIVES 是 GNatives 数组的基址（不是指针！TStaticArray 是内联数组）
NativeFn* gNatives = (NativeFn*)OFFSET_GNATIVES;
NativeFn  origExecJump = nullptr;

void __fastcall hkExecJump(void* Context, void* Stack, void* Result)
{
    // 例：统计 EX_Jump 的命中次数
    ++gJumpCount;
    origExecJump(Context, Stack, Result);
}

void InstallNativeHook()
{
    constexpr int EX_JUMP = 0x06;                 // 见 12 章的 token 表
    DWORD oldProtect;
    VirtualProtect(&gNatives[EX_JUMP], sizeof(void*), PAGE_EXECUTE_READWRITE, &oldProtect);
    origExecJump = gNatives[EX_JUMP];
    gNatives[EX_JUMP] = (NativeFn)&hkExecJump;
    VirtualProtect(&gNatives[EX_JUMP], sizeof(void*), oldProtect, &oldProtect);
}
```

**为什么这个位置特别好**：

- 不需要 MinHook（没有 trampoline、没有指令长度问题）；
- 不需要改代码段页保护，只改一个数据指针；
- 粒度精确到**单个操作码**；
- 卸载就是换回来，干净。

**代价**：你得先找到 `GNatives`。它是个全局数组，走
「`FFrame::Step` 里那条 `(GNatives[B])(...)` 指令 → 解出基址」最直接。

---

## 示例 3：inline hook VM 主循环

想观察「每个蓝图函数被调用了几次」，挂 `ProcessLocalScriptFunction` 最直接
（签名见 [13 章](/ue5-bp/13-vm)）：

```cpp
using ProcessLocalFn = void(__fastcall*)(void* Context, void* Stack, void* Result);
ProcessLocalFn origProcessLocal = nullptr;

void __fastcall hkProcessLocal(void* Context, void* Stack, void* Result)
{
    // Stack 是 FFrame&，Node 在偏移 0（见 Stack.h 的字段顺序）
    void* function = *(void**)Stack;
    RecordFunctionCall(function);          // 只记账，别做重活

    origProcessLocal(Context, Stack, Result);
}
```

::: danger 这个函数是递归的
`ProcessLocalScriptFunction` 会在每次函数调用时重入（[13 章](/ue5-bp/13-vm)里那句
`++BpET.Recurse == GScriptRecurseLimit` 就是它的递归计数）。

**在里面做任何「分配内存 / 加锁 / 写文件」都可能触发无限递归或死锁。**
只做无锁的计数与入队。
:::

---

## 一个完整的可编译骨架：打印「谁调了哪个函数」

把前面的东西拼起来，这是最实用的起步工具。

```cpp
// ue_hook.cpp —— 骨架，OFFSET_* 需自行实测
#include <windows.h>
#include <MinHook.h>
#include <cstdio>
#include <atomic>

// ---------- 需要你自己填的东西 ----------
static constexpr uintptr_t OFFSET_GOBJECTS   = 0;   // GUObjectArray 地址
static constexpr uintptr_t OFFSET_NAMEPOOL   = 0;   // NamePoolData 地址
static constexpr int       VTABLE_PE_INDEX   = 0;   // ProcessEvent 槽位
static constexpr uintptr_t OFFSET_UOBJECT_VTABLE = 0; // UObject 的 vtable
// ---------------------------------------

// FName → 字符串。UE5 的名称池按块 + 步长解，常量见 08 章：
//   OffsetBits = 16, BlockBits = 13, EntryStride = alignof(FNameEntry)
static const char* ResolveName(uint32_t comparisonIndex)
{
    // TODO: 用 OFFSET_NAMEPOOL + 位布局解出 FNameEntry，再读它的字符串
    return "<todo>";
}

// 从对象读出它的 FName（偏移需按 SDK 填）
static uint32_t ObjectNameIndex(void* obj) { return *(uint32_t*)((uint8_t*)obj + /* ClassNameOffset */ 0); }

static std::atomic<uint64_t> gCallCount{ 0 };

using ProcessEventFn = void(__fastcall*)(void*, void*, void*);
static ProcessEventFn gOrigProcessEvent = nullptr;

void __fastcall hkProcessEvent(void* self, void* function, void* parms)
{
    // 只做最轻的事：计数 + 少量采样输出
    uint64_t n = ++gCallCount;
    if (n % 1000 == 0) {
        printf("[pe] calls=%llu func=%s\n", (unsigned long long)n, ResolveName(ObjectNameIndex(function)));
    }
    gOrigProcessEvent(self, function, parms);   // 必须调回原函数
}

BOOL WINAPI DllMain(HINSTANCE, DWORD reason, LPVOID)
{
    if (reason != DLL_PROCESS_ATTACH) return TRUE;
    DisableThreadLibraryCalls(GetModuleHandleW(nullptr));

    MH_Initialize();

    void** vtable = *(void***)OFFSET_UOBJECT_VTABLE;
    DWORD oldProtect;
    VirtualProtect(&vtable[VTABLE_PE_INDEX], sizeof(void*), PAGE_EXECUTE_READWRITE, &oldProtect);
    gOrigProcessEvent = (ProcessEventFn)vtable[VTABLE_PE_INDEX];
    vtable[VTABLE_PE_INDEX] = (void*)&hkProcessEvent;
    VirtualProtect(&vtable[VTABLE_PE_INDEX], sizeof(void*), oldProtect, &oldProtect);

    return TRUE;
}
```

### 怎么把它送进游戏

两种常见方式（[06 章](/ue5-re/06-aob)里 UE4SS 的做法是第一种）：

| 方式 | 做法 | 特点 |
|---|---|---|
| **代理 DLL** | 把 DLL 改名成游戏会加载的系统库名（如 `dwmapi.dll`）放进 exe 同目录 | 不需要注入器；名字挑错就不加载 |
| **注入器** | 用任意注入器把 DLL 送进去 | 可控；但注入本身可能被杀软/反作弊盯上 |

---

## 调用约定速查（x64 Windows）

写 detour 最容易错的就是签名。UE5 里几个常用函数的形状：

| 函数 | 形状 | 说明 |
|---|---|---|
| `UObject::ProcessEvent(UFunction*, void*)` | `void(__fastcall*)(void* self, void* fn, void* parms)` | `this` 在 RCX |
| `UFunction::Invoke(UObject*, FFrame&, void*)` | `void(__fastcall*)(void* self, void* obj, void* stack, void* result)` | 4 个参数，全走寄存器 |
| `exec*`（VM 操作码处理函数） | `void(__fastcall*)(void* Context, void* Stack, void* Result)` | **是静态成员**，没有 `this`——`GNatives[B])(Context, *this, RESULT_PARAM)` 就是这么调的 |
| `ProcessLocalScriptFunction` | 同上 | 自由函数 |

::: tip `FFrame&` 是引用，但寄存器里就是指针
`(Context, *this, RESULT_PARAM)` 里的 `*this` 传的是 `FFrame` 的地址。
所以 detour 里把它当 `void*` 收下、再按 [Stack.h 的字段顺序](/ue5-bp/13-vm)解引用即可。
:::

---

## 崩溃排查清单

hook 之后崩溃，按这个顺序查：

| 症状 | 常见原因 |
|---|---|
| 一注入就崩 | 地址算错（`OFFSET_*` 是 RVA 还是 VA 搞混了；忘了加模块基址） |
| 调用几次后崩 | detour 里分配了内存 / 加了锁 / 递归调用自己 |
| 退出时崩 | 卸载顺序错（应 Disable → Remove → Uninitialize）；或 hook 还挂着但 DLL 已卸载 |
| 随机崩、难复现 | 对象被 GC 了；或没在游戏主线程上操作 |
| 游戏卡顿严重 | detour 里做了 I/O 或格式化字符串（`printf` 很贵） |
| 行为诡异但不崩 | 忘了调回原函数，或调回时参数被改过 |

::: warning 最重要的一条
**先只读不写。** 第一阶段只打印/计数，确认 hook 位置对了、参数解对了，再去改行为。
「一次改对」在这个领域基本不存在，能快速回退才是效率。
:::

## 相关

- [08 · 定位路径速查](/ue5-re/08-anchor-paths) —— 地址从哪来
- [06 · AOB 特征码](/ue5-re/06-aob) —— 让地址跨版本可用
- [05 · ProcessEvent](/ue5-re/05-process-event) —— vtable 槽位与 Hook 方式
- [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm) —— `GNatives` 与 `exec*` 的确切结构
- [附录 · 出处清单](/ue5-re/appendix/sources)
