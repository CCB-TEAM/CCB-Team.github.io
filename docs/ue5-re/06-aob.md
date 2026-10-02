---
title: 06 · AOB 特征码
---

# 06 · AOB 特征码

前面几章反复出现「扫特征码」这个词。这一章讲清楚它是什么、怎么写、以及为什么它是手动逆向里最需要长期维护的一环。

## AOB 是什么

AOB = Array of Bytes，一段字节序列。在内存或文件里搜这段字节，命中处就是你要找的代码或数据。

通配符用来屏蔽「每次编译都会变」的字节。UE4SS 的文档说得很直接：**AOB 里每两个十六进制字符构成一个字节，
并且「支持半字节或整字节的通配」**——也就是说 `?` 和 `??` 都能用：

```
8B 51 04 85      // 四个字节
8B510485         // 同样四个字节，空格只是给人看的
48 8B C4 57 48 83 EC 70 80 3D ?? ?? ?? ?? ?? 48 89
```

（写法与示例出自 [UE4SS 文档 · Fixing missing AOBs](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)）

## 为什么不能写死偏移

因为**同一份引擎源码，不同游戏的编译产物偏移就不一样**。最硬的证据在 Dumper-7 的源码里——它把「对象数组布局」
做成一张表，默认布局之外还留了多个特例：

```cpp
constexpr inline std::array FChunkedFixedUObjectArrayLayouts =
{
    FChunkedFixedUObjectArrayLayout // Default UE4.21 - UE5.7
    {
        .ObjectsOffset = 0x00,
        .MaxElementsOffset = 0x10,
        .NumElementsOffset = 0x14,
        .MaxChunksOffset = 0x18,
        .NumChunksOffset = 0x1C,
    },
    FChunkedFixedUObjectArrayLayout // UE5.8 Developement Build
    {
        .ObjectsOffset = 0x00,
        .MaxElementsOffset = 0x0C,
        .NumElementsOffset = 0x08,
        .MaxChunksOffset = 0x14,
        .NumChunksOffset = 0x10,
    },
    FChunkedFixedUObjectArrayLayout // Back4Blood
    {
        .ObjectsOffset = 0x10, // last
        .MaxElementsOffset = 0x00,
        .NumElementsOffset = 0x04,
        .MaxChunksOffset = 0x08,
        .NumChunksOffset = 0x0C,
    },
    FChunkedFixedUObjectArrayLayout // Mutliversus
    {
        .ObjectsOffset = 0x18,
        .MaxElementsOffset = 0x10,
        .NumElementsOffset = 0x00, // first
        .MaxChunksOffset = 0x14,
        .NumChunksOffset = 0x20,
    },
    // ...
};
```

（出自 [`Dumper/Engine/Private/Unreal/ObjectArray.cpp`](https://github.com/Encryqed/Dumper-7/blob/master/Dumper/Engine/Private/Unreal/ObjectArray.cpp)）

注意 `NumElementsOffset` 在 Multiversus 里是 `0x00`、在 Back4Blood 里 `ObjectsOffset` 反而是最后一个字段——
**字段顺序都被改过**。所以「记住一个偏移」这件事本身没有意义，特征码 + 运行时校验才有意义。

## UE4SS 官方给的 AOB 制作流程

UE4SS 文档承认自己「不是即插即用的方案」，并给了一条手动补 AOB 的路径
（[Fixing missing AOBs](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)），归纳成六步：

1. 用**和游戏相同的 UE 版本**编译一个空白的 shipped 游戏，**带 PDB**；
2. 用 x64dbg 读这个空白游戏的内存；
3. 找你要的那个函数（下面有每个 AOB 的语义要求）；
4. 抄下那段函数的字节——「有时候函数头就够了；如果不够，去抄**对它的调用**，如果不是虚函数，可以直接取那个 RIP 地址」；
5. 到目标游戏的内存里搜同一段字节；
6. 找到了就用 [SwissArmyKnife](https://github.com/Nukem9/SwissArmyKnife) 把 AOB 提取出来。

这套流程的关键在第 1 步：**空白工程 + PDB 提供了「标准答案」**，让你在不知道游戏符号的情况下，仍能确认某个字节序列
对应的是哪个引擎函数。

## UE4SS 需要哪些 AOB

这是「手动逆向一个 UE 游戏」最小锚点集合的实际形态。文档列出了每个签名必须返回什么：

| 签名 | `OnMatchFound` 必须返回 |
|---|---|
| `GUObjectArray.lua` | 全局变量 `GUObjectArray` 的**确切地址** |
| `FName_ToString.lua` | 函数 `FName::ToString` 的起始地址 |
| `FName_Constructor.lua` | 构造函数 `FName::FName` 的起始地址（这个回调会被调用很多次，UE4SS 背后会校验找到的是不是对的那个） |
| `FText_Constructor.lua` | 构造函数 `FText::FText` 的起始地址 |
| `StaticConstructObject.lua` | 全局函数 `StaticConstructObject_Internal` 的起始地址。UE4SS 的做法是「扫 `UUserWidget::InitializeInputComponent` 中间的一个 call，再解析这个 call 的位置」 |
| `GMalloc.lua` | 全局变量 `GMalloc` 的地址。UE4SS 的做法是「扫 `FMemory::Free`，再取离第一个 call 最近的那条 MOV 指令」 |

（同上出处）

在实际的 per-game 配置里，这个清单还会更长——比如 `Final Fantasy 7 Rebirth` 额外需要
[`GNatives.lua`、`GUObjectHashTables.lua`、`ProcessLocalScriptFunction.lua`、`CallFunctionByNameWithArguments.lua`](https://github.com/UE4SS-RE/RE-UE4SS/tree/main/assets/CustomGameConfigs/Final%20Fantasy%207%20Rebirth/UE4SS_Signatures)。
**不同游戏坏掉的签名不同**，这也是为什么这套东西必须做成「可覆盖」的。

## UE5 的通用锚点：字符串比字节稳

先说结论：**不存在「一条 AOB 通吃所有 UE5 游戏」这种东西**——理由在
[第 02 章](/ue5-re/02-gobjects)（布局逐游戏不同）和 [05 章](/ue5-bp/05-pitfalls)（厂商改操作码）。

但有一类锚点**跨版本、跨游戏都相对稳定：引擎自己写死的字符串**。
它们来自源码里的 `checkf` / `UE_CLOGF` / `LOCTEXT`，Epic 不改文案就不会变，
而且**唯一性极好**——比字节序列可靠得多。

### 但要分清三类字符串，可用性完全不同

| 类型 | 源码写法 | cooked/Shipping 里还在吗 |
|---|---|---|
| **普通字面量** | `UE_CLOGF(cond, LogX, Fatal, "Illegal call to ...")` | ✅ **通常在**（日志要输出） |
| **本地化文本** | `LOCTEXT("Key", "Attempted to access ...")` | ⚠️ **可能只剩 key**——正文被搬进 `.locres` |
| **断言文本** | `checkf(cond, TEXT("..."))` | ❌ **可能被编译掉**（`DO_CHECK=0` 时） |

这一条是很多教程没讲清的坑：**你在源码里看到的字符串，不保证在打包后的二进制里能找到。**

### UE 5.8 里实测存在的锚点

下面这些字符串都是我在 UE 5.8 源码里**逐条读到的原文**，并标了它指向哪个函数：

| 字符串（节选） | 类型 | 能定位到 | 接着走 |
|---|---|---|---|
| `Illegal call to StaticFindObjectFast() while serializing object data!` | 字面量 ✅ | `StaticFindObjectFastInternal` | → 对象哈希表 / `GObjects`（[路径 2](/ue5-re/08-anchor-paths)） |
| `Illegal call to StaticFindObjectFast() while garbage collecting!` | 字面量 ✅ | 同上 | 同上 |
| `StaticConstructObject %s is not an instance of class %s and it is not a CDO.` | 断言 ⚠️ | `StaticConstructObject_Internal` | → **`GUObjectArray`**（[路径 1](/ue5-re/08-anchor-paths)） |
| `Cannot call UnrealScript (%s - %s) while PostLoading objects` | 断言 ⚠️ | `UObject::ProcessEvent` | → `Invoke` → VM（[路径 4](/ue5-re/08-anchor-paths)） |
| `Function '%s' called on Object '%s' that was marked unreachable...` | 断言 ⚠️ | `UObject::ProcessEvent` | 同上 |
| `Attempted to access missing local variable. ...editor-only property?` | LOCTEXT ⚠️ | `execLocalVariable` | → `GNatives`（[示例 2](/ue5-re/09-minhook)） |
| `Infinite script recursion ({0} calls) detected - see log for stack trace` | LOCTEXT ⚠️ | `ProcessLocalScriptFunction` | → VM 主循环 |
| `Runaway loop detected (over {0} iterations) - see log for stack trace` | LOCTEXT ⚠️ | VM 主循环 | → `GNatives` |
| `Computation timed out - see log for stack trace` | LOCTEXT ⚠️ | VM 主循环 | 同上 |

::: tip 还有一个「白送」的锚点
UE5 的 VM 里有一张操作码名字表（[13 章](/ue5-bp/13-vm)）：

```cpp
#define STORE_INSTRUCTION_NAMES SCRIPT_AUDIT_ROUTINES
#if STORE_INSTRUCTION_NAMES
const char* GNativeFuncNames[EX_Max];
#define STORE_INSTRUCTION_NAME(inst) ...
```

**如果目标构建开了 `SCRIPT_AUDIT_ROUTINES`，二进制里会有 `"EX_Jump"`、`"EX_ComputedJump"` 这类字符串**——
搜到它们，`GNatives` 就在附近。Shipping 里通常是关的，但值得先搜一下试试。
:::

### 从字符串到地址的标准流程

```
1. 在 IDA / Ghidra 里搜字符串（不要用十六进制搜，用字符串）
2. 看它的交叉引用 → 找到引用它的函数
3. 在那个函数里找 lea reg, [rip+disp] 这类全局引用
4. 解出 RIP 相对地址 → 拿到全局量
5. 用第 08 章的路径表往下走
```

**第 1 步的顺序很重要**：先搜字符串（好找、唯一），再顺着引用走（机械），
最后才需要理解反汇编（难）。反过来做就是在给自己找麻烦。

::: warning 字符串也可能被本地化
如果目标游戏把 `LOCTEXT` 的正文搬进了 `.locres`（见本站
[ULocres 项目](/projects/ulocres)），那么二进制里只剩命名空间和 key。
这种情况下改搜**普通字面量**那一类，或者退回去用结构特征码。
:::

## 两个回调：`Register` 与 `OnMatchFound`

UE4SS 的签名文件是一段 Lua，约定两个全局函数：

```lua
function Register()
    return "48 8B C4 57 48 83 EC 70 80 3D ?? ?? ?? ?? ?? 48 89"
end

function OnMatchFound(MatchAddress)
    return MatchAddress
end
```

- `Register()` 返回特征码字符串；
- `OnMatchFound(MatchAddress)` 拿到**命中地址**，负责算出最终地址；
- 最简单的写法就是「让特征码直接落在目标地址上」，然后 `return MatchAddress`；
- 需要再解一层指针时，UE4SS 提供了全局函数 `DerefToInt32(addr)`：读 4 字节并当作 32 位整数返回，读不到返回 `nil`。

（出处同上）

## 解 RIP 相对地址：三种真实写法

x64 上定位全局变量，几乎都要解 `lea`/`mov` 的 RIP 相对偏移。公式是：

```
目标地址 = 指令的下一条指令地址 + 有符号 32 位 disp
```

### 例一：`lea rcx, [rip+disp]`（Avowed · GUObjectArray）

```lua
function Register()
    return "C7 44 24 20 00 00 00 00 48 8D 0D ? ? ? ? 48 89 F2 41 B9 FF FF FF FF E8"
end

function OnMatchFound(MatchAddress)
    local LeaInstr  = MatchAddress + 8      -- 48 8D 0D 的位置
    local NextInstr = LeaInstr + 0x7        -- lea 是 7 字节
    local Offset    = LeaInstr + 0x3        -- disp 在指令后 3 字节
    local GUObjectArrayAddress = NextInstr + DerefToInt32(Offset)
    return GUObjectArrayAddress
end
```

出处：[`assets/CustomGameConfigs/Avowed/UE4SS_Signatures/GUObjectArray.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Avowed/UE4SS_Signatures/GUObjectArray.lua)

注意这里的通配符是**半字节**的 `?`，且特征码本身是「一整条赋值 + lea」的上下文，唯一性靠上下文保证。

### 例二：先算下一条指令，再解一次（Final Fantasy 7 Rebirth · GUObjectArray）

```lua
function Register()
    return "03 ?? ?? ?? ?? ?? FF C8 3B D0 0F 8D ?? ?? ?? ?? 44 8B"
end

function OnMatchFound(matchAddress)
    local nextInstr = matchAddress + 6
    local offset    = matchAddress + 2
    local dataMoved = nextInstr + DerefToInt32(offset)
    return dataMoved
end
```

出处：[`.../Final Fantasy 7 Rebirth/UE4SS_Signatures/GUObjectArray.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Final%20Fantasy%207%20Rebirth/UE4SS_Signatures/GUObjectArray.lua)

### 例三：带注释的完整推导（Far Far West · GNatives，UE 5.8）

这个例子最好懂，作者把每一步都写在了注释里：

```lua
-- GNatives global variable for UE 5.8
-- Indirect scan: finds the GNatives initialization function, resolves RIP-relative address
function Register()
    return "48 8D 05 ?? ?? ?? ?? 48 39 05 ?? ?? ?? ?? 48 8D 05 ?? ?? ?? ?? 48 89 05 ?? ?? ?? ?? 74 ?? C7 05 ?? ?? ?? ?? 00 00 00 00 C3"
end

function OnMatchFound(MatchAddress)
    -- The "mov [GNatives], rax" instruction is at offset 0x15 from pattern start
    -- It's a 7-byte instruction: 48 89 05 [4-byte RIP offset]
    -- GNatives address = next_instruction + offset
    local movInstr  = MatchAddress + 0x15
    local nextInstr = movInstr + 7
    local offset    = DerefToInt32(movInstr + 3)
    return nextInstr + offset
end
```

出处：[`.../Far Far West/UE4SS_Signatures/GNatives.lua`](https://github.com/UE4SS-RE/RE-UE4SS/blob/main/assets/CustomGameConfigs/Far%20Far%20West/UE4SS_Signatures/GNatives.lua)

对比三个例子能看出：**特征码扫到哪里、要解几层、偏移加多少，全都是逐个目标、逐个版本手算出来的**。没有通用公式可以套。

## 一条好特征码的判据

综合 UE4SS 文档的流程与实际签名文件，可以归纳出这几条（前两条有一手依据，后三条属于经验做法）：

| 判据 | 说明 |
|---|---|
| **落在函数头或稳定的调用上下文上** | UE4SS 明确说「有时候函数头就够了，不够就去抄对它的调用」 |
| **用通配符屏蔽会变的字节** | 相对地址、立即数、跳转目标都要屏蔽，否则重编译即失效 |
| **验证唯一性** | 扫出多个候选时，不能取第一个就完事 |
| **二次校验** | 拿已知字符串（如 `ByteProperty`）或已知结构特征反查，确认扫到的东西真是目标 |
| **长度取舍** | 太短会误命中，太长会因为无关的代码改动而失效；实践中以「能唯一确定 + 上下文不引入易变字节」为准 |

（前两条依据：[UE4SS · Fixing missing AOBs](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)；后三条为经验做法，未找到一手出处。）

## 特征码也会在运行时被破坏

前面讲的失效都是**静态**的：游戏更新、重新编译，字节变了，签名跟着失效。还有一种**运行时**
失效，和版本无关，而且更容易把排查带错方向：

**别的工具已经 hook 了同一个函数，把序言覆写掉了。**

inline hook 的原理就是在函数入口写一条跳转。x64 上常见的绝对跳转是 14 字节：

```text
FF 25 00 00 00 00          ; jmp qword ptr [rip+0]
<8 字节目标地址>
```

只要特征码锚在函数入口，这 14 字节就会把它的开头整个吃掉。此时扫描报「找不到」，
而函数明明就在原地址、还在被正常调用——**如果你按「游戏更新了」去查，会一路查错方向**。

### 实测：同一份二进制，早晚注入结论相反

目标 KARDS（UE 5.6），进程里装了 UE4SS。同一条 `StaticConstructObject_Internal` 签名：

| 注入时机 | 主签名扫描结果 |
|---|---|
| 进程启动后 0.55 秒 | 命中，RVA `0x015C6C80` |
| 进程启动后 30 秒 | **`not found`**，函数仍在原地址 |

差别就是 UE4SS 在这期间完成了对同一个函数的 hook。UE4SS 日志里那句
`Waiting for object construction...` 就是它挂上 hook 之后的等待。

### 怎么判断是这种情况

三个信号，任意一个成立就基本可以确定：

1. **同一份二进制，离线扫描命中、运行时扫描不命中。** 离线扫描走文件，不受任何 hook 影响；
   两者结论不一致时，变量只剩「运行时内存被改过」。
2. **注入得早命中、注入得晚不命中。** 这是最直接的判据，一次 A/B 就能确认。
3. **目标函数的调用者仍在正常调用它。** 如果 hook 上之后还能看到调用，说明函数活着，
   只是入口字节变了。

### 对策：位移特征码

把特征码整体后移，从跳转覆盖范围**之后**开始匹配，命中后减掉位移就是真正的入口：

```text
入口+0 :  4C 8B DC 55 53 41 56 49 8D AB 28 FE FF FF   ← 被 14 字节跳转覆盖
入口+14:  48 81 EC C0 02 00 00 48 8B 05 ?? ?? ?? ?? 48 33 C4 48 89 85 A0 01 00 00 8B 41 70 33 DB 49 89 73 10
          ↑ 从这里开始匹配
```

```cpp
// 命中后减掉位移，恢复入口地址
void* target = static_cast<uint8_t*>(hit) - kDisplacement;
```

位移签名要**单独验证唯一性**——它比主签名短，而且丢掉了「前面是 int3 填充」这个额外佐证。
两条签名各自过一遍离线扫描，确认命中数都是 1、且 RVA 之差正好等于位移，再上线：

```text
主签名    RVA 0x015C6C80   命中 1
位移签名  RVA 0x015C6C8E   命中 1   0x015C6C8E - 0x015C6C80 = 14 ✓
```

**代价要说清楚**：位移签名锚在函数体内，如果别人 hook 得更深（不止 14 字节），它同样失效。
它把「必须抢在别人之前」放宽成「别人只动了入口」，不是万能药。两条签名覆盖现实中的常见
情况，加第三条就是猜了。

### 顺带：别浪费免费的交叉验证

同一个进程里挂了多个 hook 工具时，先确认「这个地址是不是已经被别的组件动过」。UE4SS 的
日志会直接写出它找到了什么：

```text
[PS] Found EngineVersion: 5.6
[PS] Found GUObjectArray: 0x7ff63bbc4050
[PS] Found FName::ToString: 0x7ff633d5b420
StaticConstructObject_Internal address: 0x7ff633f96c80 <- Lua Script
```

拿这个 VA 反推模块基址，就能和你的离线扫描结果对上：

```text
0x7ff633f96c80 - 0x015C6C80 = 0x7FF6329D0000   ← 模块基址
```

**这是第二个独立证据，而且是免费的。** 第 08 章反复强调「所有结论都要用第二个独立证据
交叉验证」——现成工具的输出就是最方便的那一个。

（本节为实测结论，未找到一手出处；跳转长度与覆盖范围由目标进程的实际字节变化推断。）

## 多版本签名库怎么组织

UE4SS 的做法值得抄：**按游戏分目录，每个游戏一个 `UE4SS_Signatures/`，里面按目标拆成独立文件**：

```
assets/CustomGameConfigs/
├── Avowed/UE4SS_Signatures/GUObjectArray.lua
├── DeadAsDisco/UE4SS_Signatures/{FName_Constructor,StaticConstructObject}.lua
├── Far Far West/UE4SS_Signatures/{GNatives,ProcessLocalScriptFunction}.lua
└── Final Fantasy 7 Rebirth/UE4SS_Signatures/{GUObjectArray,GNatives,GUObjectHashTables,...}.lua
```

（目录结构见 [UE4SS `assets/CustomGameConfigs`](https://github.com/UE4SS-RE/RE-UE4SS/tree/main/assets/CustomGameConfigs)）

好处很直接：游戏更新后，只需要重写坏掉的那一个文件，不用动整套工具。文档也说明了放置位置——
在 working directory 下建 `UE4SS_Signatures` 目录，文件名必须与目标同名（**大小写敏感**）。

## 常用工具

| 工具 | 在这件事里的角色 | 出处 |
|---|---|---|
| **x64dbg** | 读内存、下断点、看反汇编；UE4SS 流程里的第 2、5 步都靠它 | [x64dbg 文档](https://help.x64dbg.com/en/latest/) |
| **SwissArmyKnife** | 从命中处**提取** AOB | 由 UE4SS 文档点名推荐 |
| **IDA Pro / Ghidra / Binary Ninja** | 静态分析、看 xref、确认调用链 | [Ghidra](https://github.com/NationalSecurityAgency/ghidra) |
| **Cheat Engine** | 内存搜索与指针扫描（本站未取得其 wiki 的可访问内容，故不给具体用法链接） | — |

::: tip 一个反复被强调的点
UE4SS 文档的第一句就是「UE4SS 的目标不是做一个对所有游戏都能用的即插即用方案」，并直言
**「你可能需要自己更新 AOB」**。把这句话当成这个领域的基本预期。
:::

## 相关

- [02 · 定位 GObjects](/ue5-re/02-gobjects) —— 用 AOB 找对象数组的完整上下文
- [03 · 定位 GNames](/ue5-re/03-gnames) —— `FName::ToString` 与 `FName::FName` 的定位
- [07 · 工具链](/ue5-re/07-toolchain) —— 这些工具各自还能干什么
- [附录 · 出处清单](/ue5-re/appendix/sources)
