---
title: 02 · 定位 GObjects
---

# 02 · 定位 GObjects

`GObjects` 是整套手动逆向里**性价比最高的一个锚点**：拿到它，你就能遍历进程里所有 UE 对象，按类名和名字筛出
`UWorld`、`UGameInstance`、`APlayerController`……后面几章要找的东西，大半都能靠它「枚举」出来，而不必再扫特征码。

## 它在引擎里是什么

`GUObjectArray` 是一个**全局变量**，类型是 `FUObjectArray`。它内部维护一个对象数组，数组元素是 `FUObjectItem`：

```cpp
struct FUObjectItem
{
    // Pointer to the allocated object
    class UObjectBase* Object;
    // Internal flags
    int32 Flags;
    // UObject Owner Cluster Index
    int32 ClusterIndex;
    // Weak Object Pointer Serial number associated with the object
    int32 SerialNumber;
    // ...
};
```

（出自 Epic 公开的 UE4 源码 [`Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectArray.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectArray.h)）

注意这个结构里**没有名字**——名字在 `UObject` 自己身上（通过 `FName` 索引到名称池，见[第 03 章](/ue5-re/03-gnames)）。
所以「遍历对象数组 + 读每个对象的类名」这套操作，实际依赖两个全局量协同：`GObjects` 与 `GNames`。

## 两种数组形态

UE 在这个结构上改过一次，而且改得不小：

| 版本 | 结构 | 默认布局 |
|---|---|---|
| UE4.11 – UE4.20 | `FFixedUObjectArray`（定长） | `ObjectsOffset = 0x0`、`MaxObjectsOffset = 0x8`、`NumObjectsOffset = 0xC` |
| UE4.21 – UE5.7 | `FChunkedFixedUObjectArray`（分块） | `ObjectsOffset = 0x00`、`MaxElementsOffset = 0x10`、`NumElementsOffset = 0x14`、`MaxChunksOffset = 0x18`、`NumChunksOffset = 0x1C` |

（出自 [Dumper-7 README · Overriding GObjects-Layout](https://github.com/Encryqed/Dumper-7#overriding-gobjects-layout)）

分块数组的意义是：对象数量超过一块的容量时，追加一个新块，而不是整体重分配。**块大小是 Dumper-7 的初始化参数之一**：

```cpp
ObjectArray::Init(/*GObjectsOffset*/, /*ChunkSize*/, /*bIsChunked*/);
```

（出自 [Dumper-7 README](https://github.com/Encryqed/Dumper-7#overriding-offsets)）

### 但「默认布局」经常不成立

同一份 README 之外，源码里还留了若干特例——这是「不能写死偏移」最有说服力的证据：

| 目标 | Objects | MaxElements | NumElements | MaxChunks | NumChunks |
|---|---|---|---|---|---|
| 默认 UE4.21–5.7 | `0x00` | `0x10` | `0x14` | `0x18` | `0x1C` |
| UE5.8 Development Build | `0x00` | `0x0C` | `0x08` | `0x14` | `0x10` |
| Back4Blood | `0x10` | `0x00` | `0x04` | `0x08` | `0x0C` |
| Multiversus | `0x18` | `0x10` | `0x00` | `0x14` | `0x20` |

（出自 [`Dumper/Engine/Private/Unreal/ObjectArray.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/Unreal/ObjectArray.cpp)）

**字段顺序都能变**，所以任何「UE5 就是 0x10 0x14 0x18 0x1C」的记忆都是靠不住的。

## 三条定位思路

### 思路一：AOB 特征码（最通用）

扫一段能唯一确定「访问 `GUObjectArray`」的代码，解出 RIP 相对地址。UE4SS 对这条签名有明确要求：

> `GUObjectArray` —— 必须返回名为 `GUObjectArray` 的**全局变量的确切地址**。

（出自 [UE4SS 文档 · Fixing missing AOBs](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)）

两个真实签名（含逐字节的偏移推导）见[第 06 章](/ue5-re/06-aob)：

- [Avowed 的 `GUObjectArray.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Avowed/UE4SS_Signatures/GUObjectArray.lua)：特征码命中一段 `lea rcx, [rip+disp]`，解出地址；
- [FF7 Rebirth 的 `GUObjectArray.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Final%20Fantasy%207%20Rebirth/UE4SS_Signatures/GUObjectArray.lua)：命中处偏移 +2 有个 4 字节偏移，下一条指令地址 + 该偏移得到目标。

### 思路二：从已知函数回溯

`GUObjectArray` 会被引擎里很多函数访问（分配对象、查找对象、GC……）。所以可以先定位一个**好找的函数**，再从它内部
的引用反查全局量。UE4SS 自己就是这么干的：

- 找 `StaticConstructObject_Internal`：扫 `UUserWidget::InitializeInputComponent` 中间的一个 `call`，再解析这个 call 的位置；
- 找 `GMalloc`：扫 `FMemory::Free`，再取离第一个 `call` 最近的 `MOV`。

（同上出处）

这条思路的价值在于：**函数比全局变量好找**——函数有稳定的序言、有可辨认的调用上下文，而全局变量只是一块数据。

### 思路三：结构启发式统计（不扫特征码）

Dumper-7 找 `UObject::Flags` 偏移的方式完全不用特征码，而是「统计 + 阈值」：

```cpp
int32_t OffsetFinder::FindUObjectFlagsOffset()
{
    constexpr auto EnumFlagValueToSearch = 0x43;

    /* We're looking for a commonly occuring flag and this number basically defines
       the minimum number that counts ad "commonly occuring". */
    constexpr auto MinNumFlagValuesRequiredAtOffset = 0xA0;

    for (int i = 0; i < 0x20; i++)
    {
        // 在前 0x20 个对象的 0x40 字节范围内找 0x43
        // 再检查前 0x100 个对象里有多少个在该偏移处的值也是 0x43
        // 超过 0xA0 个 → 认为找到了 Flags 的偏移
    }
}
```

（出自 [`Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp)）

思路是：**某个偏移上的值如果在大量对象里都相同，那它很可能是一个 flags 字段**。同一个文件里还有
`FindUObjectIndexOffset()` 等同类函数。这类方法的适用场景是「你已经能遍历对象数组，但不确定某个字段在哪」——
先用已知布局把数组跑起来，再用统计法把剩余字段补齐。

## 对象数组可能被加密

有的游戏不让 `GUObjectArray` 里的指针直接可用。Dumper-7 为此留了一个回调，README 给的例子是异或：

```cpp
InitObjectArrayDecryption([](void* ObjPtr) -> uint8* {
    return reinterpret_cast<uint8*>(uint64(ObjPtr) ^ 0x8375);
});
```

（出自 [Dumper-7 README · Overriding Offsets](https://github.com/Encryqed/Dumper-7#overriding-offsets)）

这里只说明**机制存在、以及它在工具里的挂载点**。具体某个游戏用什么算法、密钥从哪来，属于各游戏自己的实现细节，
不在本专题展开。

## 拿到之后怎么用

典型用法（依赖 `GObjects` + `GNames` 两者）：

```cpp
// 伪代码：遍历对象数组，按类名筛
for (int32 i = 0; i < ObjectArray.Num(); ++i) {
    UObject* obj = ObjectArray.GetByIndex(i);      // 取 FUObjectItem.Object
    if (!obj) continue;
    UClass* cls = obj->GetClass();                 // 读 UObject 的 ClassPrivate
    if (cls && cls->GetName() == "World") {        // 名字来自 FName
        // 这就是 UWorld 实例
    }
}
```

（结构依据：[`UObjectArray.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/CoreUObject/Public/UObject/UObjectArray.h)；
`GetByIndex`/`Num` 这类封装在 Dumper-7 的 [`ObjectArray.h`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Public/Unreal/ObjectArray.h) 中可见对应实现）

::: warning 遍历时的两个现实问题
1. **对象会被 GC 掉。** 你刚读到指针、下一秒它可能已经无效。取到对象后要立刻用完，或自己做引用保持。
2. **数组在运行时会增长。** 别把 `NumElements` 缓存一次就一直用；每轮重新读。

（这两条属于经验做法，未找到一手出处。）
:::

## 常见坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 布局记死 | 在某个游戏上跑通了，换个游戏全是垃圾数据 | 每次先确认布局，别复用上次的偏移 |
| 扫到多个候选 | 特征码不唯一，命中了别的代码 | 加长上下文、用第二个证据（xref / 已知字符串）交叉验证 |
| 混淆「全局变量地址」和「数组首地址」 | `GUObjectArray` 是 `FUObjectArray` 的地址，不是 `Objects` 指针本身 | 按布局表逐字段解引用 |
| 忘了 chunk 步长 | 遍历到第 N 个对象后地址算错 | 用「块索引 + 块内索引」两段计算，别用单一 stride |

（表中前三行为经验做法；chunk 相关的结构依据见 [Dumper-7 ObjectArray.cpp](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/Unreal/ObjectArray.cpp)。）

## 相关

- [01 · 对象模型](/ue5-re/01-object-model) —— `FUObjectItem` 指向的 `UObject` 长什么样
- [03 · 定位 GNames](/ue5-re/03-gnames) —— 对象的名字从哪来
- [04 · 定位 GWorld](/ue5-re/04-gworld) —— 用 GObjects 直接枚举出 `UWorld`
- [06 · AOB 特征码](/ue5-re/06-aob)
- [附录 · 出处清单](/ue5-re/appendix/sources)
