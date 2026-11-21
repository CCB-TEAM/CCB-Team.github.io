---
title: 13 · 完整项目
---

# 13 · 完整项目

这一页是前面十二章的汇总：六个文件的完整代码，加上一次真实的运行记录。
所有代码都在 .NET 10 / F# 上编译通过，运行输出也是实际输出。

## 目录

```text
Duel/
├── Duel.slnx
├── Duel.Domain/
│   ├── Domain.fs
│   ├── Stores.fs
│   └── Duel.Domain.fsproj
├── Duel.Web/
│   ├── Dtos.fs
│   ├── Api.fs
│   ├── Program.fs
│   ├── appsettings.json
│   └── Duel.Web.fsproj
└── Duel.Tests/
    ├── Program.fs
    └── Duel.Tests.fsproj
```

三个 `.fsproj` 的内容见[第 10 章](/fsharp/10-project-skeleton)。

## 1. `Duel.Domain/Domain.fs`

```fsharp
namespace Duel

open System

/// 阵营。判别联合：一组有名字的 case，每个 case 可以带字段。
type Faction =
    | Germany
    | Britain
    | Soviet
    | Usa

/// 卡牌。记录：一组命名字段，默认不可变、按结构比较。
type Card =
    { Id: string
      Name: string
      Faction: Faction
      Attack: int
      Defense: int }

/// 卡组。string list 是 F# 的不可变单链表。
type Deck =
    { Name: string
      Cards: string list }

type Player = { Name: string; Deck: Deck }

type Move =
    { Turn: int
      Player: string
      Card: string }

/// 对局状态。Finished 带一个 string option：可能没有胜者（比如中止）。
type MatchStatus =
    | Waiting
    | Running
    | Finished of winner: string option

type Match =
    { Id: Guid
      First: Player
      Second: Player
      Status: MatchStatus
      Turn: int
      Log: Move list }

/// 规则模块：全是纯函数，不碰 IO，可以脱离 Web 单独测试。
module Rules =

    [<Literal>]
    let MaxDeckSize = 30

    /// 校验卡组。Result：成功 Ok deck，失败 Error（错误消息列表）。
    let validateDeck (known: Set<string>) (deck: Deck) : Result<Deck, string list> =
        let unknown =
            deck.Cards
            |> List.filter (fun id -> not (Set.contains id known))
            |> List.distinct

        let errors =
            [ if String.IsNullOrWhiteSpace deck.Name then "卡组需要一个名字"
              if List.isEmpty deck.Cards then "卡组不能为空"
              if List.length deck.Cards > MaxDeckSize then sprintf "卡组最多 %d 张" MaxDeckSize
              for id in unknown do
                  sprintf "未知卡牌：%s" id ]

        if List.isEmpty errors then Ok deck else Error errors

    let private isParticipant (game: Match) (player: string) =
        player = game.First.Name || player = game.Second.Name

    /// 开局。两人不同名、卡组非空，否则 Error。
    let start (first: Player) (second: Player) : Result<Match, string> =
        if first.Name = second.Name then
            Error "两个玩家不能同名"
        elif List.isEmpty first.Deck.Cards || List.isEmpty second.Deck.Cards then
            Error "对局双方的卡组都不能为空"
        else
            Ok
                { Id = Guid.NewGuid()
                  First = first
                  Second = second
                  Status = Running
                  Turn = 1
                  Log = [] }

    /// 出牌：返回新的 Match，原值不变。
    let play (game: Match) (player: string) (card: string) : Result<Match, string> =
        match game.Status with
        | Finished _ -> Error "对局已经结束"
        | Waiting -> Error "对局还没开始"
        | Running when not (isParticipant game player) -> Error(sprintf "玩家 %s 不在这一局里" player)
        | Running when String.IsNullOrWhiteSpace card -> Error "没有指定要出的牌"
        | Running ->
            let move =
                { Turn = game.Turn
                  Player = player
                  Card = card }

            Ok
                { game with
                    Turn = game.Turn + 1
                    Log = move :: game.Log }

    /// 结算：只有参与者能宣布结果。
    let finish (game: Match) (winner: string) : Result<Match, string> =
        match game.Status with
        | Finished _ -> Error "对局已经结束"
        | _ when not (isParticipant game winner) -> Error(sprintf "玩家 %s 不在这一局里" winner)
        | _ -> Ok { game with Status = Finished(Some winner) }
```

## 2. `Duel.Domain/Stores.fs`

```fsharp
namespace Duel

open System
open System.Collections.Concurrent

/// 卡牌库的抽象。abstract member 在 F# 里就是接口。
type ICardStore =
    abstract member All: unit -> Card[]
    abstract member TryGet: cardId: string -> Card option

/// 内存实现：构造时按 Id 建一个 Map。
type InMemoryCardStore(cards: Card seq) =
    let byId =
        cards
        |> Seq.map (fun card -> card.Id, card)
        |> Map.ofSeq

    interface ICardStore with
        member _.All() = byId.Values |> Seq.toArray
        member _.TryGet cardId = Map.tryFind cardId byId

/// 对局存储。ConcurrentDictionary 保证并发读写安全。
type MatchStore() =
    let games = ConcurrentDictionary<Guid, Match>()

    member _.Add(game: Match) = games.[game.Id] <- game

    member _.Replace(game: Match) = games.[game.Id] <- game

    member _.TryFind(id: Guid) =
        match games.TryGetValue id with
        | true, game -> Some game
        | _ -> None

/// 内置卡牌数据。
module Seed =

    let cards: Card list =
        [ { Id = "g_001"; Name = "闪电战"; Faction = Germany; Attack = 3; Defense = 1 }
          { Id = "g_002"; Name = "虎式"; Faction = Germany; Attack = 5; Defense = 6 }
          { Id = "b_001"; Name = "喷火"; Faction = Britain; Attack = 2; Defense = 3 }
          { Id = "b_002"; Name = "皇家方舟"; Faction = Britain; Attack = 1; Defense = 5 }
          { Id = "s_001"; Name = "T-34"; Faction = Soviet; Attack = 4; Defense = 4 }
          { Id = "s_002"; Name = "喀秋莎"; Faction = Soviet; Attack = 3; Defense = 2 }
          { Id = "u_001"; Name = "谢尔曼"; Faction = Usa; Attack = 3; Defense = 3 }
          { Id = "u_002"; Name = "B-17"; Faction = Usa; Attack = 4; Defense = 4 } ]
```

## 3. `Duel.Web/Dtos.fs`

```fsharp
namespace Duel.Web

open System
open Duel

// DTO 是「线上格式」，和领域模型分开：领域里的 Faction / MatchStatus 是判别联合，
// System.Text.Json 不支持 DU，所以 DTO 里统一换成字符串。

[<CLIMutable>]
type CardDto =
    { Id: string
      Name: string
      Faction: string
      Attack: int
      Defense: int }

[<CLIMutable>]
type ValidateDeckRequest = { Name: string; Cards: string[] }

[<CLIMutable>]
type ValidateDeckResponse =
    { Valid: bool
      Errors: string[]
      CardCount: int }

[<CLIMutable>]
type CreateMatchRequest =
    { FirstPlayer: string
      FirstDeck: string[]
      SecondPlayer: string
      SecondDeck: string[] }

[<CLIMutable>]
type PlayCardRequest = { Player: string; Card: string }

[<CLIMutable>]
type FinishMatchRequest = { Winner: string }

[<CLIMutable>]
type MoveDto =
    { Turn: int
      Player: string
      Card: string }

[<CLIMutable>]
type MatchDto =
    { Id: string
      First: string
      Second: string
      Status: string
      Turn: int
      Log: MoveDto[] }

module Dto =

    let factionText (faction: Faction) =
        match faction with
        | Germany -> "Germany"
        | Britain -> "Britain"
        | Soviet -> "Soviet"
        | Usa -> "USA"

    let statusText (status: MatchStatus) =
        match status with
        | Waiting -> "waiting"
        | Running -> "running"
        | Finished None -> "finished"
        | Finished(Some winner) -> sprintf "finished:%s" winner

    let ofCard (card: Card) : CardDto =
        { Id = card.Id
          Name = card.Name
          Faction = factionText card.Faction
          Attack = card.Attack
          Defense = card.Defense }

    let private ofMove (move: Move) : MoveDto =
        { Turn = move.Turn
          Player = move.Player
          Card = move.Card }

    let ofMatch (game: Match) : MatchDto =
        { Id = string game.Id
          First = game.First.Name
          Second = game.Second.Name
          Status = statusText game.Status
          Turn = game.Turn
          Log = game.Log |> List.rev |> List.map ofMove |> Array.ofList }
```

## 4. `Duel.Web/Api.fs`

```fsharp
module Duel.Web.Api

open System
open Microsoft.AspNetCore.Http
open Duel
open Duel.Web

/// 健康检查。返回匿名记录，System.Text.Json 会按属性名序列化。
let health () : IResult = Results.Ok({| status = "ok"; service = "duel" |})

let cards (store: ICardStore) : IResult =
    store.All()
    |> Array.map Dto.ofCard
    |> Results.Ok

let card (id: string) (store: ICardStore) : IResult =
    match store.TryGet id with
    | Some found -> Results.Ok(Dto.ofCard found)
    | None -> Results.NotFound({| error = sprintf "没有这张牌：%s" id |})

let validateDeck (request: ValidateDeckRequest) (store: ICardStore) : IResult =
    let known =
        store.All()
        |> Array.map (fun card -> card.Id)
        |> Set.ofArray

    let deck: Deck =
        { Name = request.Name
          Cards = List.ofArray request.Cards }

    let response: ValidateDeckResponse =
        match Rules.validateDeck known deck with
        | Ok valid ->
            { Valid = true
              Errors = [||]
              CardCount = List.length valid.Cards }
        | Error errors ->
            { Valid = false
              Errors = Array.ofList errors
              CardCount = List.length deck.Cards }

    Results.Ok(response)

let createMatch (request: CreateMatchRequest) (store: MatchStore) : IResult =
    let first: Player =
        { Name = request.FirstPlayer
          Deck =
            { Name = request.FirstPlayer
              Cards = List.ofArray request.FirstDeck } }

    let second: Player =
        { Name = request.SecondPlayer
          Deck =
            { Name = request.SecondPlayer
              Cards = List.ofArray request.SecondDeck } }

    match Rules.start first second with
    | Ok game ->
        store.Add(game)
        Results.Created($"/matches/{game.Id}", Dto.ofMatch game)
    | Error message -> Results.BadRequest({| error = message |})

let matchInfo (id: string) (store: MatchStore) : IResult =
    match Guid.TryParse id with
    | false, _ -> Results.BadRequest({| error = "对局 id 不是合法的 GUID" |})
    | true, matchId ->
        match store.TryFind matchId with
        | Some game -> Results.Ok(Dto.ofMatch game)
        | None -> Results.NotFound({| error = "对局不存在" |})

let play (id: string) (request: PlayCardRequest) (store: MatchStore) : IResult =
    match Guid.TryParse id with
    | false, _ -> Results.BadRequest({| error = "对局 id 不是合法的 GUID" |})
    | true, matchId ->
        match store.TryFind matchId with
        | None -> Results.NotFound({| error = "对局不存在" |})
        | Some game ->
            match Rules.play game request.Player request.Card with
            | Ok updated ->
                store.Replace(updated)
                Results.Ok(Dto.ofMatch updated)
            | Error message -> Results.BadRequest({| error = message |})

let finish (id: string) (request: FinishMatchRequest) (store: MatchStore) : IResult =
    match Guid.TryParse id with
    | false, _ -> Results.BadRequest({| error = "对局 id 不是合法的 GUID" |})
    | true, matchId ->
        match store.TryFind matchId with
        | None -> Results.NotFound({| error = "对局不存在" |})
        | Some game ->
            match Rules.finish game request.Winner with
            | Ok updated ->
                store.Replace(updated)
                Results.Ok(Dto.ofMatch updated)
            | Error message -> Results.BadRequest({| error = message |})
```

## 5. `Duel.Web/Program.fs`

```fsharp
module Duel.Web.Program

open System
open System.Text.Json
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open Microsoft.Extensions.Logging
open Duel
open Duel.Web

[<EntryPoint>]
let main args =
    let builder = WebApplication.CreateBuilder(args)

    // JSON：属性名统一 camelCase。
    builder.Services.ConfigureHttpJsonOptions(fun options ->
        options.SerializerOptions.PropertyNamingPolicy <- JsonNamingPolicy.CamelCase)
    |> ignore

    // 依赖注入：卡牌库与对局存储都是单例。
    builder.Services.AddSingleton<ICardStore>(InMemoryCardStore(Seed.cards) :> ICardStore)
    |> ignore

    builder.Services.AddSingleton<MatchStore>() |> ignore

    let app = builder.Build()

    // 中间件 1：记录每个请求的方法、路径、状态码与耗时。
    app.Use(
        Func<HttpContext, RequestDelegate, Task>(fun context next ->
            task {
                let started = DateTimeOffset.UtcNow
                let logger =
                    context.RequestServices
                        .GetRequiredService<ILoggerFactory>()
                        .CreateLogger("Duel.Http")

                do! next.Invoke(context)

                let elapsed = (DateTimeOffset.UtcNow - started).TotalMilliseconds

                logger.LogInformation(
                    "{Method} {Path} -> {Status} ({Elapsed:F1} ms)",
                    context.Request.Method,
                    context.Request.Path.Value,
                    context.Response.StatusCode,
                    elapsed
                )
            })
    )
    |> ignore

    // 中间件 2：把未捕获的异常转成 500 JSON。
    app.Use(
        Func<HttpContext, RequestDelegate, Task>(fun context next ->
            task {
                try
                    do! next.Invoke(context)
                with ex ->
                    context.Response.StatusCode <- StatusCodes.Status500InternalServerError
                    do! context.Response.WriteAsJsonAsync({| error = ex.GetBaseException().Message |})
            })
    )
    |> ignore

    app.MapGet("/health", Func<IResult>(fun () -> Api.health())) |> ignore

    app.MapGet("/cards", Func<ICardStore, IResult>(fun store -> Api.cards store))
    |> ignore

    app.MapGet("/cards/{id}", Func<string, ICardStore, IResult>(fun id store -> Api.card id store))
    |> ignore

    app.MapPost(
        "/decks/validate",
        Func<ValidateDeckRequest, ICardStore, IResult>(fun request store -> Api.validateDeck request store)
    )
    |> ignore

    app.MapPost(
        "/matches",
        Func<CreateMatchRequest, MatchStore, IResult>(fun request store -> Api.createMatch request store)
    )
    |> ignore

    app.MapGet("/matches/{id}", Func<string, MatchStore, IResult>(fun id store -> Api.matchInfo id store))
    |> ignore

    app.MapPost(
        "/matches/{id}/play",
        Func<string, PlayCardRequest, MatchStore, IResult>(fun id request store -> Api.play id request store)
    )
    |> ignore

    app.MapPost(
        "/matches/{id}/finish",
        Func<string, FinishMatchRequest, MatchStore, IResult>(fun id request store ->
            Api.finish id request store)
    )
    |> ignore

    app.Run()
    0
```

## 6. `Duel.Tests/Program.fs`

```fsharp
module Duel.Tests

open System
open Duel

/// 零依赖的测试运行器：断言 + 计数 + 退出码。
/// 复杂项目可以换 xUnit / Expecto，这里只用到 BCL。
let mutable failures = 0
let mutable passed = 0

let check (name: string) (condition: bool) =
    if condition then
        passed <- passed + 1
        printfn "  ok   %s" name
    else
        failures <- failures + 1
        printfn "  FAIL %s" name

let equal (name: string) (expected: 'a) (actual: 'a) =
    if expected = actual then
        passed <- passed + 1
        printfn "  ok   %s" name
    else
        failures <- failures + 1
        printfn "  FAIL %s\n       期望：%A\n       实际：%A" name expected actual

let player name cards : Player =
    { Name = name
      Deck =
        { Name = name
          Cards = cards } }

[<EntryPoint>]
let main _ =
    let known = Set.ofList [ "g_001"; "g_002"; "s_001" ]

    printfn "Rules.validateDeck"

    match Rules.validateDeck known { Name = "德"; Cards = [ "g_001"; "g_002" ] } with
    | Ok deck -> equal "合法卡组返回 Ok" 2 (List.length deck.Cards)
    | Error errors -> check "合法卡组返回 Ok" false

    match Rules.validateDeck known { Name = "德"; Cards = [ "g_001"; "zzz" ] } with
    | Ok _ -> check "未知卡牌应返回 Error" false
    | Error errors -> equal "未知卡牌出现在错误里" [ "未知卡牌：zzz" ] errors

    match Rules.validateDeck known { Name = "德"; Cards = [] } with
    | Ok _ -> check "空卡组应返回 Error" false
    | Error errors -> check "空卡组给出提示" (errors |> List.contains "卡组不能为空")

    printfn "Rules.start / play / finish"

    let first = player "甲" [ "g_001" ]
    let second = player "乙" [ "s_001" ]

    match Rules.start first second with
    | Error message -> check "开局应成功" false
    | Ok game ->
        equal "开局轮次为 1" 1 game.Turn

        match Rules.play game "甲" "g_002" with
        | Error message -> check "出牌应成功" false
        | Ok played ->
            equal "出牌后轮次 +1" 2 played.Turn
            equal "出牌记录在最前面" "g_002" played.Log.Head.Card

            match Rules.play played "丙" "g_002" with
            | Ok _ -> check "非参与者出牌应失败" false
            | Error message -> equal "非参与者错误信息" "玩家 丙 不在这一局里" message

            match Rules.finish played "乙" with
            | Error _ -> check "结算应成功" false
            | Ok finished ->
                check "结算状态带胜者" (finished.Status = Finished(Some "乙"))

                match Rules.play finished "甲" "g_002" with
                | Ok _ -> check "结束后不能再出牌" false
                | Error message -> equal "结束后出牌的错误信息" "对局已经结束" message

    match Rules.start first (player "甲" [ "s_001" ]) with
    | Ok _ -> check "同名玩家应被拒绝" false
    | Error message -> equal "同名玩家错误信息" "两个玩家不能同名" message

    printfn ""
    printfn "通过 %d，失败 %d" passed failures
    if failures = 0 then 0 else 1
```

## 运行

```bash
dotnet build -m:1
dotnet run --project Duel.Tests
dotnet run --project Duel.Web --urls http://127.0.0.1:5201
```

测试输出：

```text
Rules.validateDeck
  ok   合法卡组返回 Ok
  ok   未知卡牌出现在错误里
  ok   空卡组给出提示
Rules.start / play / finish
  ok   开局轮次为 1
  ok   出牌后轮次 +1
  ok   出牌记录在最前面
  ok   非参与者错误信息
  ok   结算状态带胜者
  ok   结束后出牌的错误信息
  ok   同名玩家错误信息

通过 10，失败 0
```

对局全流程（真实请求）：

```text
POST /matches {"firstPlayer":"甲","firstDeck":["g_001"],"secondPlayer":"乙","secondDeck":["s_001"]}
201 {"id":"23dc5bf4-...","first":"甲","second":"乙","status":"running","turn":1,"log":[]}

GET /matches/23dc5bf4-...
200 {"id":"23dc5bf4-...","first":"甲","second":"乙","status":"running","turn":1,"log":[]}

POST /matches/23dc5bf4-.../play {"player":"甲","card":"g_002"}
200 {"id":"23dc5bf4-...","turn":2,"log":[{"turn":1,"player":"甲","card":"g_002"}],"status":"running",...}

POST /matches/23dc5bf4-.../play {"player":"丙","card":"g_002"}
400 {"error":"玩家 丙 不在这一局里"}

POST /matches/23dc5bf4-.../finish {"winner":"乙"}
200 {"status":"finished:乙", ...}

POST /matches/23dc5bf4-.../play {"player":"甲","card":"g_002"}
400 {"error":"对局已经结束"}
```

## 这份代码没有做什么

说清楚边界，比列出功能更有用：

| 没做 | 后果 / 需要的话怎么加 |
|---|---|
| 持久化 | 进程重启后对局全丢；换 `MatchStore` 的实现，接口不变 |
| 鉴权 | 任何人能替任何玩家出牌；加 JWT 中间件 + 从 `HttpContext` 取玩家身份 |
| 并发控制 | 两个请求同时改同一局会互相覆盖；给 `Match` 加版本号并用乐观锁 |
| 卡组与手牌 | 目前只记录「出了什么牌」，不检查这张牌是否在手里 |
| 规则完整性 | 伤害结算、回合、胜负条件都是简化版 |
| 分页与限流 | 卡牌全量返回，没有上限 |

这些都不是 F# 的问题，是范围问题。写教程时把它们砍掉，是为了让「语言 → 框架」这条线清楚；
真要上线时，每一项都是一个独立的、与语言无关的设计决定。
