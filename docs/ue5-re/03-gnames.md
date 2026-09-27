---
title: 03 · 定位 GNames
---

# 03 · 定位 GNames

`GNames` 是**名称池**的全局入口。UE 里所有名字（类名、函数名、属性名、对象名）都不是字符串存在对象里，而是
**一个索引**——索引指向名称池中的一条记录。所以：

- 只有 `GObjects` 没有 `GNames`，你只能拿到一堆指针，不知道哪个是 `World`；
- 只有 `GNames` 没有 `GObjects`，你有一本字典但没有书。

两者一起用，才能实现[第 02 章](/ue5-re/02-gobjects)末尾那段「按类名遍历」的代码。

## FName 到底是什么

`FName` 不是字符串，是一个**定长索引结构**。UE4 公开源码里它的核心字段是：

```cpp
/** Index into the Names array (used to find String portion of the string/number pair used for comparison) */
NAME_INDEX  ComparisonIndex;
/** Index into the Names array (used to find String portion of the string/number pair used for display) */
NAME_INDEX  DisplayIndex;
/** Number portion of the string/number pair (stored internally as 1 more than actual,
    so zero'd memory will be the default, no-instance case) */
uint32      Number;
```

（出自 Epic 公开的 UE4 源码 [`Engine/Source/Runtime/Core/Public/UObject/NameTypes.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Core/Public/UObject/NameTypes.h)；
注意该公开仓库对应较早的 UE4 版本，字段名在新版里为 `FNameEntryId` 类型，但「两个索引 + 一个 Number」这个结构一直保留）

三个字段的含义很实用：

| 字段 | 含义 | 逆向时的用途 |
|---|---|---|
| `ComparisonIndex` | 指向「用于比较」的那条名称记录 | **这是定位名称池的主线索** |
| `DisplayIndex` | 指向「用于显示」的那条记录（大小写保留场景下两者不同） | 判定这个游戏是否启用了 case preserving |
| `Number` | 字符串/数字对里的数字部分，内部存的是「实际值 + 1」 | 解析 `Actor_3` 这类带序号的名字 |

::: tip `Number` 为什么要 +1
源码注释写得很清楚：**为了让「全零的内存」自然等于「默认的无实例状态」**。逆向时如果发现读出来的 Number 总是比
预期大 1，不是你的偏移错了，这是设计如此。
:::

## UE4 与 UE5 是两套结构

这是最容易翻车的地方：

| 版本 | 名称池结构 | 定位时的关键参数 |
|---|---|---|
| UE4 | `TNameEntryArray`（名字数组） | 数组基址 + 元素步长 |
| UE5 | `FNamePool`（分块名称池） | **块偏移位数**、**FNameEntry 步长** |

Dumper-7 的偏移表里能直接看到这两类参数，以及它需要按游戏修正的事实：

```cpp
namespace FName
{
    /* Whether we're using FName::AppendString or, in an edge case, FName::ToString */
    inline bool bIsUsingAppendStringOverToString = true;
    inline int32 FNameSize;
    namespace NameArray { /* UE4 路线 */ }
    namespace NamePool
    {
        inline int32 FNamePoolBlockOffsetBits = 0x0;
        inline int32 FNameEntryStride = 0x0;
    }
}

namespace FNameEntry
{
    // These values are initialized by FNameEntry::Init()
    namespace NameArray { /* ... */ }
    namespace NamePool  { /* ... */ }
}
```

（出自 [`Dumper/Engine/Public/OffsetFinder/Offsets.h`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Public/OffsetFinder/Offsets.h)）

`FNamePoolBlockOffsetBits` 与 `FNameEntryStride` 都**初始化为 0x0**，说明它们是运行时探测出来的，不是硬编码——
这正是「UE5 名称池要按块 + 步长去解」的体现。

### 还有更麻烦的情况

同一个文件里还留着两行注释，暴露了名称编码本身也会被游戏改：

```cpp
namespace FField
{
    // Fixed for CasePreserving FNames by OffsetFinder::FixupHardcodedOffsets();
    inline int32 Vft = 0x00;
}
namespace FFieldClass
{
    // Fixed for CasePreserving FNames by OffsetFinder::FixupHardcodedOffsets();
    // Fixed for OutlineNumber FNames by OffsetFinder::FixFNameSize();
    inline int32 Name = 0x00;
}
```

（同上出处）

翻译一下：**「大小写保留的 FName」和「带 outline number 的 FName」都会改变结构大小与偏移**，工具必须在运行时
`FixupHardcodedOffsets()` / `FixFNameSize()` 把它们修回来。所以「UE5 的 FName 是 8 字节」这种结论，只对一部分游戏成立。

## 怎么定位

### 路线一：先找 `FName` 的两个函数

名称池本身是块数据，不好直接扫；但**访问它的函数**很好找。UE4SS 要求提供两条签名，并明确写了它们的语义：

| 签名 | 必须返回 |
|---|---|
| `FName_ToString.lua` | 函数 `FName::ToString` 的起始地址。签名形式：`public: void cdecl FName::ToString(class FString & ptr64)const __ptr64` |
| `FName_Constructor.lua` | 构造函数 `FName::FName` 的起始地址。文档说明「这个回调会被调用很多次，UE4SS 背后会校验找到的是不是对的那个构造函数」，并且「你找到的是 `char*` 版本还是 `wchar_t*` 版本都无所谓」 |

（出自 [UE4SS 文档 · Fixing missing AOBs](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)）

真实的签名文件长这样（直接命中，无需再解引用）：

```lua
function Register()
    return "48 89 5C 24 08 57 48 83 EC 30 48 8B D9 48 89 54 24 20 33 C9 41 8B F8 4C 8B D2 44 8B C9"
end

function OnMatchFound(MatchAddress)
    return MatchAddress
end
```

出处：[`.../DeadAsDisco/UE4SS_Signatures/FName_Constructor.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/DeadAsDisco/UE4SS_Signatures/FName_Constructor.lua)

### 路线二：用工具覆盖入口直接试

Dumper-7 把「猜」这件事做成了可配置项：

```cpp
FName::Init(/*bForceGNames*/);   // AppendString 的偏移不对时，强制走 GNames 路线
FName::Init(/*OverrideOffset, OverrideType=[AppendString, ToString, GNames], bIsNamePool*/);
```

（出自 [Dumper-7 README · Overriding Offsets](https://github.com/Encryqed/Dumper-7#overriding-offsets)）

`OverrideType` 的三个取值（`AppendString` / `ToString` / `GNames`）加上 `bIsNamePool` 开关，恰好对应上面那张
「两套结构 × 两种函数」的表。**先判断是哪一套，再决定用哪个函数**，顺序反了会得到一堆乱码。

### 路线三：用合法性范围过滤候选

找到「疑似 `UObject::Name` / `FField::Name` 的偏移」之后，Dumper-7 不是直接采用，而是用取值范围的硬约束过滤：

```cpp
/* Requirements:
 *   - CmpIdx > 0x10 && CmpIdx < 0xF0000000
 */
template<typename IteratorType>
int32_t FindNameOffsetForSomeClass(std::function<bool(int32_t Value)> IsPotentialValidOffset, ...)
```

（出自 [`Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/OffsetFinder/OffsetFinder.cpp)）

它的注释还点出一个重要的互斥关系：**`UObject::Name` 不可能和 `UObject::Class` 在同一个偏移上**。这类「字段之间
互相排斥」的约束，是筛选候选偏移最有效的工具之一。

## 验证：一定要用第二个证据

一个索引值「看起来合理」不代表它是对的。可靠的验证方式是**反向查名**：

1. 随便取一个你确定存在的类（比如引擎自带的 `Class`、`Function` 这类核心类型，或你从静态资产里已经确认过的类名）；
2. 用候选名称池把它解成字符串；
3. 看解出来的是不是一个合法的、符合预期的名字。

（这条属于经验做法；其依据来自上面 Dumper-7 对候选偏移做范围校验、UE4SS 对 `FName::FName` 命中做后台校验这两个实现事实。）

## 常见坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 把 UE4 的名称池结构套到 UE5 上 | 解出来的名字全是乱码或空串 | 先判断 `bIsNamePool`，UE5 要按块 + 步长解 |
| 忽略 case preserving | 大小写丢失，或 `ComparisonIndex != DisplayIndex` 时解析错 | 检查两个索引是否相等；不等就说明该游戏保留了大小写 |
| `Number` 忘记 -1 | 名字尾部多出 `_1`、`_2` | 源码里 Number 存的是实际值 +1 |
| 只验一个名字就收工 | 恰好蒙对，换个对象就崩 | 多验几个不同类型的名字（类名、函数名、属性名） |

（表中内容为经验做法与上述来源结论的推论。）

## 相关

- [02 · 定位 GObjects](/ue5-re/02-gobjects)
- [06 · AOB 特征码](/ue5-re/06-aob) —— 上面这些签名文件的写法
- [附录 · 出处清单](/ue5-re/appendix/sources)
