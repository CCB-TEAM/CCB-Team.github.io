---
title: faction-mobile-so
---

# faction-mobile-so

将 KARDS Windows 盟国扩展移植到 Android arm64 的研究工作区，包含 `libUnreal.so` 静态分析记录、地址表、重定位扫描工具与移植骨架。

## 当前状态

这是**研究与移植骨架**，仓库说明尚无可用产物，也未在真机运行。关键转换函数尚待定位，hook 后端和加载方式仍需完成；地址表对应特定游戏版本。

仓库不包含游戏二进制或 APK。查看复现方法、已验证结论与未完成事项，请参阅项目 README。

## 架构

仓库按「逆向结论 → 扫描工具 → 骨架」三段组织，上游 Windows 实现整体 vendored 作为语义基线。

| 路径 | 作用 | 状态 |
|---|---|---|
| `upstream/KardsFactionToolkit/` | Windows 原版源码（MIT，上游 v0.2.0） | 移植基线 |
| `docs/ANDROID_RE.md` | `libUnreal.so` 的逆向结论：地址、结构体、复现方法 | 静态分析确认 |
| `profiles/kards-1.57.26587-arm64.json` | 地址表（含已确认项与未定位项） | 已确认部分可信 |
| `tools/find_faction_enum.py` | 从 ELF 重定位表还原枚举结构的扫描器 | 已跑通 |
| `src/` | arm64 骨架：`core.h`/`core.cpp`、`android_entry.cpp`（入口方案的坑）、`CMakeLists.txt` 的 `FACTION_HOOK_BACKEND` | 编译通过，未上真机 |

```text
libUnreal.so（需自备合法 APK）
  └─ tools/find_faction_enum.py：.rodata 找 "EFactionEnum" → .rela.dyn 还原指针
        └─ 定位 Enumerator[13] / FEnumParams（16 字节等距、连续 13 条，再回溯 Params）
              └─ profiles/*.json 地址表 ──► src/ 骨架：hook 转换函数 + 替换 EnumParams
```

已确认的关键地址（KARDS 1.57.26587 arm64）：

```text
Enumerator[13]   0x98ed1c8   .data.rel.ro
FEnumParams      0x98ed298   .data.rel.ro
"EFactionEnum"   0x261865e   .rodata
outer            0x6e874f4   .text（语义待确认）
Params GOT 槽    0xa084b38   .got
```

## 实现细节

- **必须走重定位表。** `.data.rel.ro` 里的指针在文件内容中全是 0，真值只存在于 `.rela.dyn`（145 万条重定位）；直接对文件扫指针什么都扫不到。
- **ABI 可以原样复用。** 安卓实测的 `FEnumParams` 与 Windows 校验值逐项一致（`count` 13、`display` NULL、`flags` 0x45、`enumFlags` 0、`cppForm` 2、`cppType == name`），结构体 48 字节、`count` 在偏移 44，`core.h` 的 `static_assert` 在 arm64 上成立。
- **入口要重新设计，不能移植。** ELF 没有 PE entry point 可抢，Windows 的 `ArmEntry` / `EntryBootstrap` / `RestoreEntry` 那套（改入口跳板 → 恢复机器码 → 安装 → 调原入口）整段删掉；候选是 `.init_array`（1664 项）、`JNI_OnLoad` 或注入器显式调用。
- **hook 后端要换。** Windows 用 MinHook，arm64 需要 Dobby 或 ShadowHook 放进 `vendor/`，由 `src/CMakeLists.txt` 的 `FACTION_HOOK_BACKEND` 选择。
- **加载方式没有免费方案。** APK 已签名、`lib/` 只读、Android 7+ 有 linker namespace 隔离：root + Frida / ptrace 注入最干净，LSPosed 模块仍需 root，重打包 APK 要自己签名、破坏 Play 完整性且 1.1 GB 包迭代很慢。
- **匹配成功也要调用原函数。** 原解析函数拥有传入的 by-value `FString` 并负责释放；跳过它会泄漏，自己释放则跨分配器。
- **`Encode` 只改一个字符。** 先以 ANZAC 的值（10）调用原函数，拿到它用自己的分配器构造好的单字符 `FString`，再改那一个字符，不要自己分配。
- **失败要完整回滚**（卸 hook + 写回原结构，不留半装状态）；枚举注册后不能卸载，因为名称数组与 detour 仍被 UE 反射引用；`expanded` 数组与替换后的 `EnumParams` 必须在静态存储期活到进程结束。
- **版本指纹还不完整。** 目前只能逐字段校验枚举结构：三个转换函数（`NameToEnum` / `Encode` / `Decode`）尚未定位，建立不了 Windows 版那种「PE 字段 + 关键函数 SHA-256」指纹。

## 资料

- [GitHub 仓库与 README](https://github.com/CCB-TEAM/faction-mobile-so)
- [上游 KardsFactionToolkit](https://github.com/mdzz195/KardsFactionToolkit)
