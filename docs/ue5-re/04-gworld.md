---
title: 04 · 定位 GWorld
---

# 04 · 定位 GWorld

`GWorld` 是**当前世界的全局指针**。几乎所有「想对游戏做点什么」的需求都会落到它身上：遍历场景里的 Actor、
拿本地玩家的 `PlayerController`、读对局状态……

好消息是：**有了 `GObjects` 之后，`GWorld` 反而是最好找的一个**——因为它本身就是一个 `UObject` 子类的实例，
可以直接从对象数组里枚举出来。

## GWorld 是什么

它是一个全局变量，声明在引擎的 `UnrealEngine.h` 里（UE5 路径
`Engine/Source/Runtime/Engine/Public/UnrealEngine.h`，可通过
[代码搜索](https://github.com/search?q=repo%3AEpicGames%2FUnrealEngine+GWorld+path%3AEngine%2FSource%2FRuntime%2FEngine%2FPublic&type=code)
在 Epic 引擎仓库中检索到）。

注意它的类型：`UWorld*`——**`UWorld` 是 `UObject` 的派生类**。这一点决定了下面第一条定位路线。

## 路线一：用 GObjects 直接枚举（推荐）

既然 `UWorld` 是 `UObject`，它就在对象数组里。遍历一遍，按类名筛 `World` 即可：

```cpp
// 伪代码
for (UObject* obj : ObjectArray) {
    if (obj && obj->GetClass() && obj->GetClass()->GetName() == "World") {
        // 候选 UWorld
    }
}
```

优点：**不需要任何额外特征码**，只依赖[第 02 章](/ue5-re/02-gobjects)和[第 03 章](/ue5-re/03-gnames)已经建立的
两个锚点。代价是要遍历（对象数量通常十万级，但这是一次性开销）。

需要注意：进程里可能同时存在多个 `UWorld` 实例（编辑器、PIE、流关卡等场景）。**要按上下文判断哪个才是你要的**，
而不是取第一个。

（这条路线是上述结构事实的直接推论；「多个 UWorld 如何区分」属经验做法。）

## 路线二：扫特征码

和找 `GUObjectArray` 一样，扫一段访问 `GWorld` 的代码、解 RIP 相对地址。具体写法见[第 06 章](/ue5-re/06-aob)。
缺点是 Shipping 包里不一定留下好用的字符串或稳定上下文，需要你有耐心。

## 路线三：从调用点回溯

`UWorld::Tick`、`UWorld::BeginPlay` 这类函数会被引擎高频调用，且它们的实现里通常会访问 `GWorld`。
先定位这些函数（它们比全局变量好找），再从函数内部反查全局量——思路与 UE4SS 找 `StaticConstructObject`
的方式一致（[UE4SS 文档](https://docs.ue4ss.com/guides/fixing-compatibility-problems.html)）。

## 拿到 GWorld 之后：三条常用对象链

下面每一条都有引擎源码依据。**注意字段类型**——比如 `Levels` 是 `TSet` 而不是 `TArray`，遍历方式不同。

### 链 A：World → Level → Actor

```cpp
// UWorld
ULevel* GetPersistentLevel() const { return PersistentLevel; }
// ULevel
TArray<AActor*> Actors;   // Array of all actors in this level, used by FActorIteratorBase and derived classes
```

（出自 [`World.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/World.h)
与 [`Level.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/Level.h)）

这是「遍历场景里所有 Actor」的标准做法。`ULevel::Actors` 的注释明确写了它就是给 Actor 迭代器用的。

### 链 B：World → 所有关卡

```cpp
/** Returns the set of levels in this collection. */
const TSet<ULevel*>& GetLevels() const { return Levels; }
```

（同上，`World.h`）

**流关卡（streaming level）里的 Actor 不在 `PersistentLevel` 里**，只遍历 `PersistentLevel` 会漏。要全量就得
把 `Levels` 里每个 `ULevel` 的 `Actors` 都走一遍。

### 链 C：World → 本地玩家 → 控制器 → Pawn

```cpp
// UWorld
UPROPERTY(Transient)
class UGameInstance* OwningGameInstance;

// UGameInstance
TArray<ULocalPlayer*> LocalPlayers;   // List of locally participating players in this game instance

// ULocalPlayer（通过 FLocalPlayerContext）
class APlayerController* GetPlayerController() const;

// APlayerController
UPROPERTY()
class APawn* AcknowledgedPawn;
```

（依次出自 [`World.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/World.h)、
[`GameInstance.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/GameInstance.h)、
[`LocalPlayer.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/LocalPlayer.h)、
[`PlayerController.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/GameFramework/PlayerController.h)）

::: tip 为什么用 `AcknowledgedPawn` 而不是 `Pawn`
`APlayerController` 上 `AcknowledgedPawn` 是**服务器确认过**的那个 Pawn。在网络环境下它比裸的 `Pawn` 更可靠。
（字段存在性有源码依据；「哪个更可靠」属经验判断。）
:::

### 附带：对局状态

`UWorld` 上还有两个常用成员：

```cpp
class AGameStateBase* GameState;        // 通过 GetGameState() 访问
class AGameModeBase*  AuthorityGameMode;
```

（出自 [`World.h`](https://github.com/EpicGames/UnrealTournament/blob/master/Engine/Source/Runtime/Engine/Classes/Engine/World.h)）

`GameState` 通常放着比分、阶段这类**同步给所有客户端**的状态——想读对局信息，先看它比乱翻内存靠谱。

## 常见坑

| 坑 | 表现 | 应对 |
|---|---|---|
| 只遍历 `PersistentLevel` | 流关卡里的 Actor 找不到 | 走 `Levels` 全量 |
| 把 `Levels` 当 `TArray` 遍历 | 内存踩错、崩溃 | 它是 `TSet<ULevel*>` |
| 拿错 `UWorld` 实例 | 读到的数据不符合当前画面 | 用 `OwningGameInstance` / `GameState` 等字段判断上下文 |
| 缓存 `GWorld` 指针长期用 | 换关卡/换场景后失效 | 每帧或每次需要时重新取（经验做法，无一手出处） |
| Actor 列表在 Tick 中变化 | 迭代时崩溃 | 复制一份再遍历，或只读不改（经验做法，无一手出处） |

（表中前两行的依据为上述源码字段类型；后三行为经验做法。）

## 相关

- [02 · 定位 GObjects](/ue5-re/02-gobjects) —— 路线一的前置条件
- [03 · 定位 GNames](/ue5-re/03-gnames) —— 按类名筛 `World` 的前置条件
- [05 · ProcessEvent](/ue5-re/05-process-event) —— 拿到对象之后怎么调函数
- [附录 · 出处清单](/ue5-re/appendix/sources)
