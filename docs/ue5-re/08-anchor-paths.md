---
title: 08 · 定位路径速查
---

# 08 · 定位路径速查

前面几章分别讲了 `GObjects`、`GNames`、`GWorld`、`ProcessEvent` 怎么找。这一章把它们串起来，
回答一个更实际的问题：**我手上只有一堆汇编，该从哪个入口开始走？**

::: tip 本章依据
所有代码证据取自 **CCB-TEAM 私有镜像的 UE 5.8 源码**（`release` 分支，`ENGINE 5.8.0`）。
标注 ⚠️ 的地方是「UE5 相对 UE4 有变化、需要在你自己的目标上重新验证」。
:::

## 核心思路：找函数，别找数据

新手最容易犯的错是**直接搜全局变量**。全局变量在二进制里就是一块数据，没有名字、没有特征，
除了「谁引用了它」之外没有任何线索。

正确顺序是反过来：

```
先在二进制里定位一个「好找的函数」   ← 有字符串、有可辨认的调用上下文
        ↓  看它内部引用了哪个全局量
      拿到全局量
        ↓  用全局量枚举出你要的类实例
      拿到对象
```

**函数比数据好找，因为函数有结构。** 下面是 UE5.8 里九条已经被源码证实的路径。

## 九条路径总表

| # | 入口（好找的东西） | 中间步骤 | 目标 | UE5.8 证据 |
|---|---|---|---|---|
| 1 | `StaticConstructObject_Internal` | `GUObjectArray.ObjectToIndex(Obj)` | **`GUObjectArray`** | ✅ 源码直证 |
| 2 | `StaticFindObjectFastInternal` | 对象哈希表 / 对象数组 | **`GObjects`** | ✅ 源码直证 |
| 3 | `FName::ToString` / `FName::FName` | `NamePoolData` → `FNamePool` | **名称池（GNames）** | ✅ 源码直证 |
| 4 | `UObject::ProcessEvent` | `UFunction::Invoke` → `(*Func)(...)` | **VM 入口 / `GNatives`** | ✅ 源码直证 |
| 5 | `UStruct::Script` | `FFrame::Code` | **字节码** | ✅ 源码直证 |
| 6 | `UWorld::PersistentLevel` | `ULevel` → 演员集合 | **场景里所有 Actor** | ⚠️ UE5 有变化 |
| 7 | `UGameInstance::LocalPlayers` | `ULocalPlayer` → `APlayerController` | **本地玩家 / Pawn** | ✅ 字段直证 |
| 8 | `GEngine` | `GetWorldFromContextObject` | **`UWorld` / `GWorld`** | 经验路径 |
| 9 | `UObject::StaticClass()` / `Z_Construct_UClass_*` | `UClass` → CDO | **任意类的默认对象** | 机制路径 |

---

## 路径 1：`StaticConstructObject_Internal` → `GUObjectArray`

**为什么好找**：它是对象创建的唯一入口，任何 `NewObject` / `SpawnActor` 都会走到它；
它内部还有一条独一无二的错误信息（见[第 06 章](/ue5-re/06-aob)的字符串锚点清单）。

UE 5.8 `UObjectGlobals.cpp` 里，它的签名和内部的 `GUObjectArray` 调用：

```cpp
UObject* StaticConstructObject_Internal(const FStaticConstructObjectParameters& Params)
{
    const UClass* InClass = Params.Class;
    // ...
    OldIndex = GUObjectArray.ObjectToIndex(Obj);
    OldSerialNumber = GUObjectArray.GetSerialNumber(OldIndex);
    // ...
    GUObjectArray.LockInternalArray();
    GUObjectArray.FreeUObjectIndex(Obj);
    GUObjectArray.UnlockInternalArray();
```

而 `GUObjectArray` 本身的声明（`CoreUObject/Public/UObject/UObjectArray.h`）：

```cpp
/** Global UObject allocator							*/
extern COREUOBJECT_API FUObjectArray GUObjectArray;
```

**走法**：在 IDA/Ghidra 里定位 `StaticConstructObject_Internal` → 看它内部对某个全局地址的
`lea reg, [rip+disp]` 引用 → 那个地址就是 `GUObjectArray`。拿到之后再按
[第 02 章](/ue5-re/02-gobjects)的布局表逐字段解引用。

::: tip 为什么这条比 AOB 扫 `GUObjectArray` 更稳
因为 `GUObjectArray` 的**布局**逐游戏不同（[第 02 章](/ue5-re/02-gobjects)列了四个特例），
但 `StaticConstructObject_Internal` **一定存在、一定会引用它**。
从函数走进去，你拿到的是「真正的那个全局量」，不用赌特征码的唯一性。
:::

## 路径 2：`StaticFindObjectFastInternal` → 对象查找链

`StaticFindObject` 家族是「按名字找对象」的入口，也是蓝图里 `FindObject` 节点的实现。
UE 5.8 里能看到它依赖对象哈希表：

```cpp
UObject* FoundObject = StaticFindObjectFastInternal(ObjectClass, ObjectPackage, ObjectName,
                                                    Flags, ExclusiveFlags, ExclusiveInternalFlags);

if (!FoundObject)
{
    FoundObject = StaticFindObjectWithChangedLegacyPath(ObjectClass, ObjectPackage, ObjectName, ...);
}
```

以及一连串「不能在 GC/序列化期间调用」的断言——**这些断言里的字符串同样是极好的锚点**：

```cpp
UE_CLOGF(UE::IsSavingPackage(nullptr), LogUObjectGlobals, Fatal,
         "Illegal call to StaticFindObjectFast() while serializing object data!");
UE_CLOGF(IsGarbageCollectingAndLockingUObjectHashTables(), LogUObjectGlobals, Fatal,
         "Illegal call to StaticFindObjectFast() while garbage collecting!");
```

**走法**：搜字符串 `"Illegal call to StaticFindObjectFast()"` → 找到引用它的函数 → 函数里的全局引用就是对象数组或哈希表。

::: warning 哈希表 vs 对象数组
UE 的对象查找走**哈希表**（`GUObjectHashTables`），数组是遍历用的。
**要枚举所有对象用数组，要按名字查找用哈希表**——两条路通到同一个对象体系，但入口字段不同。
:::

## 路径 3：`FName::ToString` → 名称池

名称池的全局量在 UE5.8 里叫 `NamePoolData`。最直接的证据是引擎自己的调试可视化器：

```cpp
uint8** FNameDebugVisualizer::GetBlocks()
{
    static_assert(EntryStride == FNameEntryAllocator::Stride, "Natvis constants out of sync with actual constants");
    static_assert(BlockBits == FNameMaxBlockBits,            "Natvis constants out of sync with actual constants");
    static_assert(OffsetBits == FNameBlockOffsetBits,        "Natvis constants out of sync with actual constants");

    return ((FNamePool*)(NamePoolData))->GetBlocksForDebugVisualizer();
}
```

（UE 5.8 `Core/Private/UObject/NameTypes.cpp`）

### 名称池的位布局（UE5.8 实测常量）

同一个文件里，`FNameEntryAllocator` 的常量是：

```cpp
static constexpr uint32 EntryStride = alignof(FNameEntry);
static constexpr uint32 OffsetBits  = 16;
static constexpr uint32 BlockBits   = 13;
```

**这三个常量是解名称池的钥匙**：

| 常量 | 值 | 含义 |
|---|---|---|
| `OffsetBits` | **16** | 块内偏移占低 16 位 |
| `BlockBits` | **13** | 块索引占高 13 位 |
| `EntryStride` | `alignof(FNameEntry)` | 每个条目在块内的步长 |

也就是说，一个 `FNameEntryId` 大致是 `(BlockIndex << 16) | OffsetInBlock`——
**先右移 16 位拿块号，再取低 16 位拿块内偏移，然后 `块基址 + 偏移 × Stride` 就是条目地址**。

（这就是[第 03 章](/ue5-re/03-gnames)里 Dumper-7 那两个运行时探测参数
`FNamePoolBlockOffsetBits` / `FNameEntryStride` 的由来——它们本来就不是固定的。）

**走法**：定位 `FName::ToString`（或 `FName::FName`）→ 它内部会访问 `NamePoolData` → 拿到名称池。
验证方式：用已知字符串（如 `"ByteProperty"`）反查。

## 路径 4：`ProcessEvent` → VM 分派表

这条链在 [13 章](/ue5-bp/13-vm)已经完整拆过，这里只留结论：

```
UObject::ProcessEvent(Function, Parms)
   → UFunction::Invoke(...)   → (*Func)(Obj, Stack, RESULT_PARAM)
   → Func == &UObject::ProcessInternal   （蓝图函数）
   → ProcessLocalScriptFunction → while (*Code != EX_Return) → (GNatives[opcode])(...)
```

**`GNatives` 是 UE5 独有的一个「整体替换」hook 点**：
它是一张 `TStaticArray<FNativeFuncPtr, EX_Max>`，按操作码索引。
改一个表项就能改变某个操作码的全局行为，**不需要改指令字节**。详见[第 09 章](/ue5-re/09-minhook)。

## 路径 5：`UStruct::Script` → 字节码

`UStruct::Script` 是 `TArray<uint8>`（UE 5.8 `Class.h`，注释原文 *Script bytecode associated with this object*），
运行时的 `FFrame` 直接指向它：

```cpp
inline FFrame::FFrame(UObject* InObject, UFunction* InNode, void* InLocals, ...)
    : Node(InNode)
    , Code(InNode->Script.GetData())     // ← 字节码
    , Locals((uint8*)InLocals)
```

**走法**：定位 `ProcessLocalScriptFunction` → 它内部会读 `Stack.Node->Script`。
拿到 `UFunction` 对象后，`Script` 的偏移固定（就是 `UStruct` 的那个成员），
**这也是「静态反编译」和「运行时读字节码」共用同一份数据的证明**。

## 路径 6：`UWorld::PersistentLevel` → 场景演员 ⚠️

UE 5.8 里 `UWorld` 的成员：

```cpp
/** Returns this collection's PersistentLevel. */
ULevel* GetPersistentLevel() const { return PersistentLevel; }

UPROPERTY()
TObjectPtr<class ULevel> PersistentLevel;
```

这条链的前半段没问题。**但后半段在 UE5 里变了**：

`Level.h` 里那个扁平数组带着这样的注释——

```cpp
/** Array of all actors in this level, used by FActorIteratorBase and derived classes */
TArray<TObjectPtr<AActor>> Actors;
```

**而它位于 `#if WITH_EDITORONLY_DATA` 块内**。同一个文件里另有一个
`TMap<FName, TObjectPtr<AActor>> Actors`（属于 actor 容器体系）。

::: warning 「PersistentLevel → Actors 数组」这条 UE4 经典路径，在 UE5 的 cooked 包里要重新验证
UE5 引入了 actor 容器 / 集群，**打包后演员不一定躺在那个扁平数组里**。

建议：

- **在引擎内部**用 `FActorIterator` / `TActorIterator`（它们会走正确的路径）；
- **在外部**（注入进程）先 dump `ULevel` 的内存布局，确认那个数组还在不在、是不是编辑器专用；
- 或者改用 `UWorld` 上的其它入口（`GameState`、`Levels` 集合）交叉验证。

这一条我**没有实测**，只从源码结构读出「扁平数组是 editor-only」这个事实。**请在自己的目标上验证后再下结论。**
:::

## 路径 7：本地玩家链

UE 5.8 里这条链的三个关键字段（注释为原文）：

```cpp
// UGameInstance
/** List of locally participating players in this game instance */
UPROPERTY()
TArray<TObjectPtr<ULocalPlayer>> LocalPlayers;

// APlayerController
/** Used in net games so client can acknowledge it possessed a specific pawn. */
UPROPERTY()
TObjectPtr<APawn> AcknowledgedPawn;
```

中间的 `ULocalPlayer → APlayerController` 一步，引擎提供了访问器
`FLocalPlayerContext::GetPlayerController()`（见 [04 章](/ue5-re/04-gworld)）。

**完整链**：

```
UWorld → OwningGameInstance → LocalPlayers[0] → PlayerController → AcknowledgedPawn
```

**走法**：这条链的每一段都是 `UPROPERTY`，**偏移可以从 dump 出来的 SDK 里直接读到**，
不需要扫特征码。所以实务上更常见的是「先拿到 `UWorld`，再顺着链走」而不是逐段找。

## 路径 8：`GEngine` → `UWorld`

`GEngine` 也是一个全局量（`UEngine*`），它的价值在于提供了一批**按上下文取世界**的接口，
例如 `GetWorldFromContextObject`。

**走法**：这条属于经验路径——`GEngine` 本身也要先定位。实务顺序通常是
**先拿 `GObjects`，遍历出 `UWorld` 实例**（[04 章](/ue5-re/04-gworld)的路线一），
再回头用 `GEngine` 做交叉验证。

## 路径 9：`StaticClass()` / `Z_Construct_UClass_*` → 任意类的 CDO

UHT 为每个 `UCLASS` 生成 `Z_Construct_UClass_<名字>` 函数和 `StaticClass()` 访问器。
拿到某个 `UClass*`，就能：

- 读它的 `ClassDefaultObject`（CDO）——**改默认值比改实例更省事**；
- 顺着 `Children` 找到它的所有 `UFunction`（[07 章](/ue5-bp/07-structures)）；
- 用 `FindFunctionByName` 拿函数，再 `ProcessEvent` 调用。

**走法**：`Z_Construct_UClass_*` 函数在二进制里通常带符号（如果没 strip），
或者在字符串表里能搜到 `/Script/包名.类名` 这类路径。

---

## 优先级建议

如果目标是「尽快把工具跑起来」，按这个顺序：

| 顺序 | 做什么 | 为什么 |
|---|---|---|
| 1 | **用现成工具 dump 一遍**（Dumper-7 / UE4SS） | 拿到 SDK 就有全部偏移，能省掉 90% 的手工活 |
| 2 | **定位 `GUObjectArray`** | 收益最大：有了它，`UWorld`、`UClass`、`UFunction` 全都能枚举出来 |
| 3 | **定位名称池** | 没有名字，对象数组只是一堆指针 |
| 4 | 用对象数组枚举 `UWorld` | 比扫特征码找 `GWorld` 容易得多 |
| 5 | 顺 `UPROPERTY` 链走（玩家链、Level 链） | 这些偏移 SDK 里都有，不用扫 |
| 6 | 最后才动 `ProcessEvent` | 从「读」跨到「调用」，风险最高 |

::: tip 一条被反复验证的经验
**能用反射解决的，不要用内存扫描。** 找类、找函数、读属性名、走对象链——这些走
`GObjects` + `GNames` + SDK 偏移就够了。内存扫描留给反射覆盖不到的东西：
真正的全局变量（`GWorld`）、非反射的运行时状态、引擎内部函数。
:::

## 反向验证：怎么知道自己走对了

每条路径都要有**第二个独立证据**。可用的手段：

| 手段 | 怎么做 |
|---|---|
| **字符串反查** | 用已知的类名/函数名去名称池里查，能解出正常字符串才说明名称池对 |
| **枚举计数** | 对象数组遍历出的对象数应该在十万量级；太少说明布局错，太多说明越界 |
| **类型自洽** | `obj->ClassPrivate->Name` 解出来的名字应该像类名（`World`、`PlayerController`…） |
| **链式交叉** | 从 `UWorld` 走到 `PlayerController`，再用 `PlayerController->GetWorld()` 走回来，应该回到同一个对象 |

（最后一条是本站实践中最有效的自检：**能走回来的链才是对的链**。）

## 相关

- [02 · 定位 GObjects](/ue5-re/02-gobjects) · [03 · 定位 GNames](/ue5-re/03-gnames) ·
  [04 · 定位 GWorld](/ue5-re/04-gworld) · [05 · ProcessEvent](/ue5-re/05-process-event)
- [06 · AOB 特征码](/ue5-re/06-aob) —— 怎么把入口函数变成一条可复用的特征码
- [09 · MinHook 上手](/ue5-re/09-minhook) —— 拿到地址之后怎么挂上去
- [13 · UE5 蓝图虚拟机](/ue5-bp/13-vm) —— `ProcessEvent` 之后发生了什么
- [附录 · 出处清单](/ue5-re/appendix/sources)
