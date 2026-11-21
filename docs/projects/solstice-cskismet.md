---
title: solstice-cskismet
---

# solstice-cskismet

[solstice-cskismet](https://github.com/CCB-TEAM/solstice-cskismet) 为 [solstice-kismet](/projects/solstice-kismet) 提供 C# 源码前端：通过 Roslyn 将受支持的语句和表达式转换为节点模型，再生成蓝图字节码。

## 架构

本仓库只是前端：四段流水线里只有第一段是新写的，其余全部复用 `solstice-kismet`。

```text
C# 源码（Roslyn SyntaxTree + SemanticModel）
   ↓  前端：语句 → KNode，表达式 → KArg
Solstice.Kismet 的 KNode / KArg 模型
   ↓  KismetCompiler（复用）
字节码 + 布局 + ubergraph 入口点校验
   ↓  KismetWorkspace.Save（复用）
uasset / uexp
```

| 层 | 归属 | 职责 |
|---|---|---|
| 翻译前端 | 本仓库 | `SyntaxTree` / `SemanticModel` → `KNode` / `KArg`，未实现的构造抛带行列号的 `TranslationException` |
| 编译器与写回 | `solstice-kismet` 子模块 | 布局、偏移、`measure`、重烘、逐字节校验 |
| SDK 生成器 | 本仓库 | `functions.json` + usmap → 强类型签名与 `KRef` 代理类 |
| CLI | 本仓库 | `apply` / `check` / `sdk` 三个命令 |

`apply` 的入口是 mod 源码上的特性：`[KClass]` 给出蓝图类，`[KTarget]` 给出目标 `UFunction`（默认 `Append`），方法第一个参数固定是 `KCtx`，其余参数按名字对应目标函数里的变量，大小写敏感。

## 功能与边界

- 提供追加、替换、签名检查和 SDK 生成等命令。
- 支持一部分调用、赋值、条件、循环与参数形式；未实现的语法会报告错误。
- 结构体和容器字面量等仍有边界；对 ubergraph 追加时还需检查控制流，不能仅凭静态写回判断运行效果。
- 仓库依赖 `solstice-kismet` 子模块，使用前需递归初始化。

## 实现细节

**为什么在源码层做，不在 IL 层做**：

| | 源码层 | IL 层 |
|---|---|---|
| 语句/表达式 | 语法上有二分，与 `KNode` / `KArg` 同构 | 只有指令和栈，没有「语句」 |
| `a + b` | 直接是 `BinaryExpressionSyntax` | `ldarg.0; ldarg.1; add; stloc`，树已被拍平 |
| `out` / `ref` | 语法事实（C# 强制实参是变量） | `ldloca` + managed pointer，要靠数据流还原 |
| 报错时机 | mod 源码先当普通 C# 编译，类型错当场报 | 生成字节码时才发现 |

**新建局部变量的类型从哪来**：Kismet 字节码里没有局部变量类型，C# 源码里有。`var x = Foo(…)` 优先取 `Foo` 返回参数的签名（带 `Struct` / `Inner` 细节），`var n = 0` 与 `int n = 0` 取 C# 推断/声明类型得到 `IntProperty`；类型确定后调 `DeclareLocalVariable` 往 `LoadedProperties` 加一条 `FProperty`，写不出类型就报错。

**SDK 的两份输入各管一半**：`functions.json` 给签名、`flags`、参数的 `dir` / `ref` / `const` / `offset` / `size` 与容器元素类型；`kards.usmap` 给结构体 schema 与成员，把 `StructProperty` 的路径变成具名类型。实测产出 4 个类 / 1126 个方法 / 48 个结构（usmap 19408 个 schema）；结构成员的更深一层类型拿不到，退成 `KStruct`。

**占位参数**：`DefaultArgs` 对 `text / struct / array / map / set` 只能给 `NoObjectArg` 并标 `IsPlaceholder`——合法字节码，但语义可能不对，会被收集成告警。`k.Log` 的 `PrintString` 里 `TextColor` 是 struct，只能占位；`Duration` 显式给 5 秒（默认 0 等于看不见）。

**ubergraph 段尾追加**：入口偏移都烘在追加点之前的调用点里，追加不移动它们；`Generate` 里的 `CheckUbergraphEntryPoints` 兜底，错位会回滚。但追加的代码挂在最后一段后面，只有那一段 fallthrough 才执行，多段 ubergraph 要逐卡看 diff。

验收：对 `BP_CardFunctions`（294 个带字节码的函数）追加后，294 个函数逐字节一致，只有 `DamageCard` 从 3 节点变 4 节点，写出的资产复检同样一致。

命令示例、已支持语法和验证记录见 [项目 README](https://github.com/CCB-TEAM/solstice-cskismet#readme)。

相关：[solstice-jmap](/projects/solstice-jmap) · [polaris](/projects/polaris)
