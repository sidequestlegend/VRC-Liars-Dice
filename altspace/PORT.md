# Liar's dice: port analysis

Status (2026-11-24, third pass): **the kit is built and the editor rungs are run** (section 11, evidence in
`TESTS.md`). The rules were re-synced to the fixed portkit (every runtime gap of section 10 is closed in the kit;
`ts/src/gaps.ts` is gone), the Unity project `altspace/` builds the kit with `Assets/Kit/Editor/LiarsDiceKitBuilder.cs`,
`ts/bindings.json` is the builder's, and every upstream asset that may not ship was replaced or left out (section 6a).
Second pass: the rules ported and rung 1 (`altspace/ts/`, golden vectors from the upstream C#, scenarios on the fake
room). The first pass (analysis) follows unchanged except where marked.

First pass: analysis only, written 2026-11-24. The upstream C# was read, not compiled; the prefabs, materials,
controller and clips were read as YAML (scripts matched by the GUID in their `.meta` files); the two FBX files
and the audio and image headers were parsed for names and sizes. Unity was not opened. Port-side names follow
`portkit/README.md` (protocol `pk1`).

Reference shorthand (`M:205-218` means lines 205 to 218 of that file):

| Tag | File | Lines |
|---|---|---|
| `M` | `Assets/LiarsDice/UdonScripts/LiarsDiceMaster.cs` | 812 |
| `P` | `Assets/LiarsDice/UdonScripts/PlayerHandle.cs` | 709 |
| `T` | `Assets/LiarsDice/UdonScripts/PositionTracker.cs` | 146 |
| `X` | `Assets/LiarsDice/UdonScripts/ProximityEnable.cs` | 96 |
| `F` | `Assets/LiarsDice/UdonScripts/FingerTrigger.cs` | 77 |
| `G` | `Assets/LiarsDice/editor/GenerateDiceTable.cs` | 48 |
| `TP` | `Assets/LiarsDice/Liars Dice Table.prefab` | 4,467 |
| `PP` | `Assets/LiarsDice/Nested Prefabs/player.prefab` | 7,096 |
| `SP` | `Assets/LiarsDice/Nested Prefabs/selector.prefab` | 99 |
| `LP` | `Assets/LiarsDice/Logger.prefab` | 794 |
| `SH` | `Assets/LiarsDice/Art Assets/Shaders/dice flipbook.shader` | 82 |
| `AC` | `Assets/LiarsDice/Art Assets/Animations/UIEffect.controller` | |

Die values in code are 0 to 5 for faces 1 to 6. Flipbook frames: 0 to 5 faces, 6 "?", 7 red X, 8 the
"LIAR'S DICE" logo (atlas `Art Assets/Textures/all dice.png`, 3 by 3, looked at).

---

## 1. Upstream at a glance

| | |
|---|---|
| Repo | akalink/VRC-Liars-Dice, "VRC Liars Dice", a VRChat world prefab |
| Commit | `fd8c862ea1f3520c1b17cefe14b29474aee74028`, 2023-01-08, "Merge pull request #8 from akalink/develop". Tags `prerelease` to `release4`. `README.md:57-58` patch 0.04 |
| Unity | Not recorded: the repo holds `Assets/LiarsDice`, two README files, a licence and three screenshots; no `ProjectSettings`, no `Packages` (`.gitignore:12`). Asset serialisation (`ModelImporter serializedVersion: 19301`, `Art Assets/Models/dice.fbx.meta:4`) is Unity 2019.4. VRChat's editor at that date was 2019.4.31f1 (from memory, not from the repo) |
| SDK | VRChat Worlds SDK3 with UdonSharp 1.0 or newer (`README.md:7`, `:12`); compiled program assets say `scriptVersion: 2` (`UdonScripts/*.asset:20-21`). TextMeshPro UGUI. Shader made with Amplify Shader Editor 18935 (`SH:1`, `SH:57`). Models exported from Blender 3.0.1 |
| Own C# | 1,888 lines in six files (five runtime, one editor). The plan's table says 1,892 |
| Entry prefab | `Liars Dice Table.prefab`: 4 nested `player.prefab` (each with 15 nested `selector.prefab` and 5 `dice.fbx`), 1 `table.fbx`. Optional `Logger.prefab` (debug). No scene |
| Editor menu | `Window/Liar's Dice Table/Generate Only Table` (`G:13-22`), `.../Generate Table with Logger` (`G:26-46`). `G:24` is a stray `[MenuItem(".../Github Page")]` stacked on the same method, so that item also generates a table |
| Players | 2 to 4 at one table; any number watching |

Licences found in the repo:

| Item | Evidence | Licence | Port action |
|---|---|---|---|
| Code, prefabs, models, table and dice textures, UI sprites | `LICENSE.md:1-21` | MIT, "Copyright (c) 2022 Garrett McPherson" | Keep the notice in the fork, the bundle notices and the credits panel |
| **Heavitas font**: `Art Assets/Fonts/Heavitas.ttf`, `Heavitas SDF.asset`, `Heavitas SDF billboard.asset`; the same lettering is drawn into atlas frame 8 | No licence file. TTF name table: "Copyright (c) 2015 by Deepak Singh Dogra. All rights reserved." The font's dafont page says "Free for personal use", commercial use by paid licence (read 2026-11-24 through an automated fetch; check by eye) | Not MIT, not redistributable on the evidence found | **Do not ship.** Use an OFL face (the template's LiberationSans SDF) and redraw frame 8 |
| `sounds/dice roll large.wav` | RIFF INFO chunk in the file: "dice_06", dermotte, freesound.org sound 220744 | CC BY 4.0 on the freesound page (same automated fetch) | Keep **with attribution** (upstream gives none), or replace |
| `sounds/dice roll small.wav` | INFO chunk: "Dice Rolling on Table", Flem0527, freesound 629982 | CC0 on the freesound page | Keep; credit as a courtesy |
| `sounds/audience-clapping.wav` | INFO chunk: Zeraora, freesound 429422 | CC0 on the freesound page | Keep |
| `boo.wav`, `yay.wav`, `chime.wav`, `click-01.wav`, `click w-pitch amp.wav` | No metadata, no source named anywhere | Only the repo's MIT file covers them; origin unknown | Keep, list as "origin not stated" |
| `Textures/teeth.png` (the "wild" icon) | No source named | Same | Keep or redraw; redrawing is a few minutes |
| `Shaders/TMP_SDF-Mobile-Billboard.shader`, `TMPro*.cginc` | `README.md:39` credits orels1; the three `.cginc` files are Unity TextMeshPro sources | No licence file for the shader; TMP sources are under Unity's Companion Licence | Not shipped (section 6) |
| `Shaders/dice flipbook.shader` | Generated by Amplify Shader Editor (`SH:1-2`) | Repo MIT | Not shipped; remade |
| CyanPlayerObjectPool | `README.md:38`, "used in prototyping" | Not in the repo, nothing references it | Nothing |
| Three GUIDs that resolve to nothing in the repo | check-mark sprite `cf547c3b264c80a41bba0a855f9bcdde` (two Images, one at `TP:2445`); Logger panel sprite `3180e170980acbe4180eaef8ac7fac09`; shader `9200bec112b65ec4fbbbd33fa89c20f4` of `Materials/sphere.mat` | Could not determine what they were | Check mark: Unity's built-in Checkmark. The other two belong to parts that are not ported |

---

## 2. Feature checklist

Each line is a statement a test can check. "Local" means only the player who did it sees or hears it.

### Table and lobby

| # | Statement | Upstream |
|---|---|---|
| F01 | The table has four stations, p1 to p4, 0.637 m from the centre at 90 degree steps; station index 0 to 3 is the order p1, p2, p3, p4 | `M:100`, `M:115-118`; `TP:4161`, `TP:3512`, `TP:3195`, `TP:3844` |
| F02 | Each station has five dice lying on the table in front of it; die `i` (0 to 19) belongs to station `i / 5` | `M:105-106`, `M:408`, `M:763`; `PP` dice instances |
| F03 | On load every seat is empty, every seat has 5 dice, the centre display reads "Liar's Dice", the rules line is blank, ones are wild | `M:102-124`, `M:630`, `M:57-59`, `M:43`, `TP:840` |
| F04 | Dice of an empty seat show the logo face (frame 8) | `M:765-769` |
| F05 | An empty station shows "Join Game" while no game is running. Pressing it seats the local player there for everyone | `P:456-469`, `P:653-658`, `M:505-530` |
| F06 | A player can hold one seat only: a Join at a second station is refused | `M:511-521` |
| F07 | Nobody can join while a game is running: Join is hidden on every station and the press is ignored | `P:458`, `M:691`, `P:230-233` |
| F08 | A taken station shows the player's name, in a colour worked out from the name (same name, same colour, on every client); the name clears when the seat empties | `M:665-666`, `P:174-188`, `M:593-608` |
| F09 | A taken station shows "Leave Game" in place of Join; pressing it (seat holder only) frees the seat for everyone | `P:197-217`, `P:471-483`, `P:660-666`, `M:532-552` |
| F10 | "Start Game" appears on every taken station once two or more are seated and no game is running; any seated player can press it; with fewer than two seated it does nothing | `M:660-663`, `P:435-448` |
| F11 | Two to four players; the fifth player cannot join (four stations) | `M:100-103` |

### Rounds and bidding

| # | Statement | Upstream |
|---|---|---|
| F12 | Starting a game gives every seat 5 dice; the lowest-numbered taken station bids first | `M:205-218`, `M:251-310` |
| F13 | At the start of every round all dice in play are rolled again, each face 1 to 6 with equal chance | `M:219-224`, `M:457-463` (`README.md:57-58`: "Fixed probability so 6's can spawn") |
| F14 | Everyone hears a dice roll at each round start: the large roll with more than 10 dice in play, the small roll with 1 to 10, at a random pitch 0.9 to 1.1 | `M:224`, `M:465-481` |
| F15 | During a round a player sees the faces of their own dice; every other seat's dice show "?" (frame 6); a seated player's lost dice show the red X (frame 7), highest-numbered dice first | `M:755-792` |
| F16 | Before the first bid the display reads "<name>" / "starts the round", then "Ones are Wild" if that option is on | `M:728-744` |
| F17 | After a bid it reads "<name>'s turn" / "<quantity> X <face> die", then the ones-wild line | `M:706-727` |
| F18 | In a game a seated player's panel shows the bidding controls instead of Join/Leave/Start | `P:257-261`, `M:674` |
| F19 | On your turn the six face buttons are white and the one you pick turns cyan; when it is not your turn all controls are grey and do nothing | `P:371-384`, `P:284-288`, `P:560`, `P:577` |
| F20 | The quantity starts at the standing bid's quantity (1 at the start of a round); + and - move it by one between that and the number of dice in play; + is grey at the top, - at the bottom | `P:269-282`, `P:416-425`, `P:558-572`, `P:391-396` |
| F21 | Submit is accepted only when a face is picked and either the quantity is higher than the standing bid's or the face is higher than the standing bid's face; otherwise the button is grey and does nothing. (So a higher quantity may name any face; the same quantity needs a higher face.) | `P:491-517`, `P:397-402` |
| F22 | The first bid of a round may be any face with any quantity from 1 to the number of dice in play | `M:276-277`, `M:378-379`, `P:272-281` |
| F23 | "Call it" works only on your turn and only when there is a standing bid; it is grey on the first turn of a round | `P:521-533`, `P:403-407` |
| F24 | After a bid the turn goes to the next taken station that still has dice, in order p1, p2, p3, p4, p1 | `M:236-244`, `M:294-310` |
| F25 | The player whose turn begins hears a chime (local) | `P:271`, `P:353-361` |
| F26 | Only a station's own player can work its controls | `owner == localPlayer` at `P:437`, `P:473`, `P:493`, `P:523`, `P:536`, `P:560`, `P:568`, `P:577` and on |
| F27 | After Join, Leave, Start, Submit, Call it or Continue, that station ignores further presses of those buttons for 30 frames | `P:37`, `P:430-433`, `P:442`, `P:463`, `P:477`, `P:509`, `P:526`, `P:540` |
| F28 | The face-1 button shows the "wild" icon while ones are wild and still count as wild this round | `P:273`, `M:678`; `PP:4332` |

### Ones wild

| # | Statement | Upstream |
|---|---|---|
| F29 | The menu panel has a "Ones are Wild / Global" button with a check mark. Any player can press it; it changes the option for everyone, but only while no game is running. Default on | `M:135-149`, `M:627`, `TP:995`, `TP:840` |
| F30 | With the option on, dice showing 1 count as the bid face in a challenge | `M:417` |
| F31 | Once any bid in a round names ones, ones stop being wild for the rest of that round; the display line becomes "Ones are Wild" struck through and the wild icon goes | `M:635-648`, `M:716-726`, `M:733-743`, `M:678` |
| F32 | Ones are wild again at the next round | `M:643-646`, `M:378` |

### Challenge

| # | Statement | Upstream |
|---|---|---|
| F33 | On "Call it" every die in play is shown to everyone. Dice that count toward the bid (the bid face, and ones while wild) are tinted cyan, the rest white; lost dice show X | `M:403-435` |
| F34 | The count is the number of counting dice among the dice still held by seated players | `M:413-421` |
| F35 | Count below the bid: the bidder (the previous taken station in seat order) loses one die. Display: "<bidder> is a liar:" / "Bid: Q X F die" / "Actual N X F die" / "<bidder> losses a dice". Everyone hears the boo | `M:332`, `M:340-355`, `M:372`, `M:450`, `M:483-490` |
| F36 | Count equal to or above the bid: the challenger loses one die. Display: "<bidder> is not a liar:" with the same two lines, then "<challenger> losses a dice". Everyone hears the cheer | `M:356-371`, `M:372`, `M:492-499` |
| F37 | A player who loses their last die is out: the last line reads "<name> has been eliminated", their seat empties at the next round and they cannot act | `M:437-455`, `M:348-352`, `M:365-369` |
| F38 | After a challenge every station that was seated shows "Continue" and hides its bidding controls. Any of those players pressing it starts the next round for everyone | `M:409-412`, `P:244-253`, `P:534-546`, `M:219-234` |
| F39 | The loser of the challenge bids first in the next round. If the loser was eliminated, the other party to the challenge bids first (challenger if the bidder went out, bidder if the challenger went out) | `M:453`, `M:350`, `M:368`, `M:225-228`, `M:296` |
| F40 | Each round starts with no standing bid (quantity 1, no face) | `M:378-379` |

### End of game and leaving

| # | Statement | Upstream |
|---|---|---|
| F41 | The game ends when one seated player is left. The display reads "<name> is the Winner" and keeps reading that until the next game starts | `M:261-286`, `M:746-750` |
| F42 | At the end everyone hears applause, all seats empty and every station goes back to Join | `M:280`, `M:284`, `M:312-328`, `P:290-296` |
| F43 | The menu panel's "Leave mid Game" button takes the local seated player out of a running game | `M:170-184`, `P:450-455`, `P:683-686`, `M:554-583` |
| F44 | A seated player who leaves the world is taken out of the game the same way | `M:585-588` |
| F45 | If the player who left was the one to act, the turn passes to the next player; the standing bid stays | `M:566-569` |
| F46 | If a leave drops the game to one player, the game ends and that player wins | `M:570-574`, `M:261-286` |
| F47 | Dice of a player who has left stop counting in a challenge and show the logo | `M:413`, `M:765-769` |

### Menu, rules, sound

| # | Statement | Upstream |
|---|---|---|
| F48 | Menu panel on the table top: ones-wild toggle (global), "Volume Local" slider, "Enable Sound Effects Local" toggle with check mark, "Leave mid Game", and the credit line "github.com/akalink/VRC-Liars-Dice" | `TP:995`, `TP:2968`, `TP:1125`, `TP:1291`; Credit text object |
| F49 | The volume slider (0.025 to 1, starts at 1) sets the volume of the table speaker and the four station speakers, local | `M:161-168`, `P:122-125`, `TP:2968` |
| F50 | The sound toggle silences every game sound, local | `M:151-159`; guards `M:314`, `M:467`, `M:485`, `M:494`, `P:301`, `P:331`, `P:355` |
| F51 | Every station has a "rules" button that anyone may press at any time. Each press shows the next of nine rule sentences above the display, then blank, then round again. Local | `P:485-489`, `M:128-134`, `M:57-69` |
| F52 | Button clicks are local sounds: Join 1.1, Leave 0.9, Submit 1.1, Call it 0.9, rules 0.8 (pitch of `click-01`); face buttons 1.0 to 1.5 by face and +/- at quantity/10 + 0.9 (pitch of `click w-pitch amp`). Start and Continue click only if that station's turn flag is set, which in practice is never | `P:464`, `P:478`, `P:510`, `P:527`, `P:488`, `P:579-629`, `P:421`, `P:440`, `P:538` |
| F53 | Sounds everyone hears: dice roll, boo, cheer, applause. They come from one speaker at the table centre (3D, 0.2 to 6 m) | `M:465-499`, `M:312-319`, `TP:649` |

### Interaction, visibility, network

| # | Statement | Upstream |
|---|---|---|
| F54 | Desktop: every button is clicked with the pointer | `P:93-114` (canvas collider on when not in VR), UI Buttons in `PP`, `TP` |
| F55 | VR: buttons are pushed with an index fingertip. A small sphere follows each index finger; touching a button pushes it down, clicks at pitch 0.7 and buzzes that hand; the button's action happens when the finger comes back out, with a second buzz | `T:113-127`, `F:43-75`, `P:309-350`, 15 clips in `AC` |
| F56 | VR: while neither fingertip is within 0.2 m of a station, that station's panel takes the laser pointer instead | `P:142-172`, `PP:2741` |
| F57 | VR: finger bones are found again after an avatar change (checked every 240 frames) | `T:62-108`, `T:128-141` |
| F58 | All text, all button images and all input are off until the local player is within about 3.5 m of the table (a 7 m wide, 2 m tall cylinder), and go off again on leaving | `X:23-79`, `TP:1582`, `TP:1633` |
| F59 | The centre display always faces the viewer | billboard font material, `Shaders/TMP_SDF-Mobile-Billboard.shader` |
| F60 | Seats, names, turn, standing bid, dice counts, ones-wild and the winner are the same for everyone in the instance | synced fields `M:29-43`, `M:610-633` |
| F61 | A player arriving late sees the current lobby or bidding state, and cannot join a running game | `M:610-633`, `P:458` |
| F62 | If the client that runs the rules leaves, another takes over and the game goes on | every rule gated on `Networking.IsOwner(gameObject)`, for example `M:207`, `M:255` |
| F63 | Debug: with logging on, every step is written to an on-table log panel or the console | `M:797-810`, `LP`, `G:26-46` |

### Edge cases and defects found in the code

"As read" means it follows from the code and was not run.

| # | Behaviour | Upstream | Port |
|---|---|---|---|
| D01 | A player arriving during a challenge result sees the bidding screen, not the result (author's own bug list) | `M:23-25`; cause: the result is never serialised, `M:330-387` has no `RequestSerialization` | Fixed: result is state |
| D02 | A winner by forfeit keeps the Leave button | `README.md:53` | Fixed by drawing the panel from state |
| D03 | The finger button does not fire if the fingertip leaves through the bottom | `README.md:50` | Gone with finger pressing |
| D04 | Lobby, exactly two seated, one of them leaves the world: `NextTurn()` runs with `playingPlayer == -1` and reads `remaining[-1]` (as read). If it did not throw, the one player left would be declared winner of a game that never started | `M:570-574`, `M:248`, `M:296` | Fixed: a lobby departure is a plain seat release |
| D05 | Leaving between a challenge and Continue, when the leaver is the stored next player: the turn lands on the empty seat and the display looks up player id -1 (as read) | `M:566-569`, `M:296`, `M:730-732` | Defined in section 3a |
| D06 | Two players pressing Continue close together: the second press skips a player's turn (as read) | `M:219-233`, `M:246-249` | Fixed: Continue only in the result phase |
| D07 | The + limit is one refresh behind: the first turn of a game, and the turn after a leave, use the dice count from before | `M:678` reads `diceLeft`, recounted after at `M:631-632` | Fixed: count first |
| D08 | Start stays visible on the last seated station after the others leave (pressing does nothing) | `M:660-663` | Fixed |
| D09 | Pressing the ones-wild button during a game flips the presser's check mark though nothing changed | `M:137` | Fixed |
| D10 | The "bidder" in a challenge is the previous taken seat, not whoever made the bid, so after a mid-round leave the wrong player can be judged | `M:332`, `M:389-401` | Question Q4 |
| D11 | The display looks players up by id; a winner or current player who has left the world gives a null (as read) | `M:748-749`, `M:711-712`, `M:595` | Fixed: names kept in state |
| D12 | Round state held only by the owner (`postContestTurn`, `postContestTurnPlayer`, `onesInvalid`, and everything `_PlayerContests` changes) is lost if the owner changes during a result | `M:37-38`, `M:45`, `M:345-386` | Fixed: all of it is state |
| D13 | In the lobby after a game, seats show the last game's dice counts, and a seated player sees dice values | `M:771-788`; `remaining` is only reset at `M:212-215` | Fixed: reset at game end |
| D14 | A late arrival replays each station's last command, including the challenge display; with all seats empty `ReturnLastPlayer` has no exit (as read) | `P:645-690`, `M:389-401` | Fixed: commands never run from a snapshot |
| D15 | Boo, cheer and applause play at whatever pitch the last dice roll picked | `M:469` | Kept (harmless) |
| D16 | Leftovers: prefab override on an object that no longer exists (`5038335178178883671`, in the p2, p3 and p4 instances in `TP`); `selector.prefab` default `pushInMethod: _DepressedClickSound` names no method (`SP:60`; overridden everywhere); unused `headtracker` object, `oldMessage` (`M:51`), `_DepressedAltClickSoundAll` (`P:339`) | | Not carried over |

---

## 2a. Checklist status of the TypeScript rules (2026-11-24)

Done: the rule works as upstream and a test or vector shows it. Changed: it works, differently, for the reason
given. Left out: not ported. Kit: belongs to the Unity kit, not to the rules. Tests are in `ts/test/`:
`golden.test.ts` (V1 to V5 against the upstream C#) and `scenarios.test.ts` (S1 to S11, in file order: full
game; challenge true and false; ones wild; leaving; late joiner; referee leaves; cheating client; no reveal / no
roll; two Joins; two tables; rules button and budget; then reload mid-round; seat lost after rejoin-grace; haptics
side; min-players 1). Fourth pass: `trust.test.ts` (T1 to T10, the review's findings: reload while rolling with no wait;
the referee reloads; dice that cannot come back; both sides withhold; a referee that marks a die lost; a grinding
referee; honest checks and a late arrival; the secrecy watch and two leaks it must catch).

**Totals (third pass): 52 done, 9 changed, 2 left out (F01 to F63; F59 now done in the kit); D01 to D16: 12 fixed, 2 kept as upstream, 2 gone or not carried over.**

| # | Status | Evidence or note |
|---|---|---|
| F01, F02 | Done | Four `PlayerHandle`s, 20 dice in station order (`bindings.json`, provisional) |
| F03, F04 | Done | Field defaults; empty seat draws frame 8 (`DieFrames`); S4 |
| F05, F06 | Done | Referee refuses a taken seat and a second seat: S9 |
| F07 | Done | Join hidden and refused during a game: S5 |
| F08 | Changed | Same rule (square root per channel, one hex digit doubled) on an FNV-1a hash; upstream's `string.GetHashCode()` cannot be reproduced, so colours differ from VRChat's (Q10). Name tested for stability and shape |
| F09, F10, F11 | Done | S4, S1; Start hidden again below two seated (D08) |
| F12 | Done | S1: station 1 opens |
| F13 | Changed | Each player's dice are a fair self-roll (section 3a as built); each face 0 to 5 from SHA-256, 48 bits mod 6 |
| F14 | Changed | Large or small roll by dice in play, as upstream, at a random pitch 0.9 to 1.1 (`AudioSourceRef.pitch`, relay op `audioPitch`); each die roll is a fair self-roll (F13) |
| F15 | Done | S1 checks, every round, that each page shows its own faces and "?" for everyone else, cannot compute anyone else's draw, and holds no die in `dieValues`; T8 watches every message, `dieValues` and every user state on every tick before the challenge (T9, T10 show it catches a leak) |
| F16, F17 | Done | V5 (3,000 displays against `UpdateText`) |
| F18, F19, F20, F21 | Done | V3 (10,000 panels against `HighLightButton` and `_Submit`); colours through `uiColor`; the referee re-checks every bid |
| F22, F23 | Done | V3; S1, S2 |
| F24 | Done | V1 (against `ReturnNextUser`), with the empty-seat fix |
| F25 | Done | Chime on the local owner's page when their turn starts |
| F26 | Done | Panel checks the local owner; the referee checks the caller of every command |
| F27 | Changed | 0.5 s lockout instead of 30 frames (a runtime frame is a 50 ms tick, so 30 would be 1.5 s) |
| F28 | Done | Wild icon follows `onesWild && !onesInvalid`: S3 |
| F29, F30, F31, F32 | Done | S3 (toggle in the lobby reaches everyone; wild on makes a bid true that is false with it off; a bid on ones strikes the line and stops ones counting; wild again next round); V2 |
| F33 | Changed | Dice are shown once the reveals are checked (revealing phase), then tinted as upstream: S1, S2 |
| F34 | Done | V2 (3,000 tables against `CalcSumShowDice`) |
| F35, F36, F37 | Done | V4 (3,000 challenges against `_PlayerContests`, state and text); boo and cheer on every page: S1 |
| F38 | Done | Continue for everyone seated at the challenge, eliminated players included; only in the result phase (D06): S2 |
| F39, F40 | Done | S2 (loser opens; challenger opens after losing), V4 |
| F41, F42 | Done | S1: "<name> is the Winner", applause, seats empty, Join everywhere |
| F43, F44, F45, F46, F47 | Done | S4 |
| F48 | Done | Menu buttons are click colliders, the slider a uGUI slider (`uiSlider`); the credit line stays and a Credits button opens the licence notices |
| F49 | Done | The slider sets the table speaker's and the four station speakers' volume on this page (`audioVolume`) |
| F50, F51 | Done | Local; S11 for the rules line |
| F52 | Done | Click sounds at upstream's pitches (`audioPitch`); the clips themselves are CC0 replacements (section 6a) |
| F53 | Changed | Through the relay's `audio` op on the table speaker (3D, 0.3 to 8 m); boo and cheer are CC0 jingles now (section 6a) |
| F54 | Done | Every button is its selector's click |
| F55 | Changed | Point and click (coordinator decision): animator bool pulsed 0.15 s (corrected push clips, section 11), push-in sound, the hand that clicked buzzes (both when the runtime cannot tell) |
| F56, F57 | Left out | No finger bones on the page; `PositionTracker.ts` is an empty class |
| F58 | Changed | Distance from the head to the table centre on the tick (`ui-range`, default 3.5 m), canvases switched; on while the position is unknown |
| F59 | Done (kit) | `BS.BSBillboard` on the centre display, turning about Y only |
| F60, F61, F62 | Done | Digests agree after every step; S5; S6 |
| F63 | Changed | `debug="true"` logs to the console; the log panel is left out |
| D01 | Fixed | Result is state: S5 (late arrival sees the result text and dice) |
| D02 | Fixed | Panels drawn from state |
| D03 | Gone | No finger pressing |
| D04 | Fixed | Lobby departure frees the seat only: S4 |
| D05 | Fixed | `returnNextUser` moves past an empty seat: V1 (1,792 patterns where upstream lands on no playable seat) |
| D06 | Fixed | Continue only in the result phase: S2 (two presses in one tick start one round) |
| D07, D08, D09 | Fixed | Dice in play counted before the panels; Start hidden below two; check mark not flipped during a game |
| D10 | Kept | The bidder is still "the previous taken seat" (Q4, rules kept literal) |
| D11 | Fixed | Names in state |
| D12 | Fixed | Round fields synced; S6 (referee leaves mid-bidding, then the next referee leaves mid-reveal) |
| D13 | Fixed | Counts reset at game end: S1 |
| D14 | Fixed | Commands are numbered and run once by the referee; no sound from a snapshot: S5 |
| D15 | Kept | Pitch now reaches the app, so boo, cheer and applause play at the last roll's pitch, as upstream |
| D16 | Not carried over | |

---

## 3. State and messages (upstream)

### Synced variables

`LiarsDiceMaster` (`M:20`, manual sync; one per table). Writer is always the object's owner, which upstream
never changes in code: it is the instance master, and VRChat passes it on when that player leaves.

| Name | Type, start | Written at | Meaning |
|---|---|---|---|
| `dieValues` | `int[20]`, random (`M:29`, `M:106`, `M:122`) | `Randomize()` `M:459-462`, called at `Start` on every client and by the owner at each round `M:223` | **Every die of every player, sent to every client.** Hidden only by what each client chooses to draw (`M:773-782`) |
| `remaining` | `int[4]`, 5 each (`M:30`, `M:112`) | `M:214`, `M:347`, `M:364` | Dice left per seat. Not reset at game end |
| `currentPlayers` | `int[4]`, -1 (`M:34`, `M:109`) | `M:526`, `M:543`, `M:563`, `M:273` | VRChat `playerId` per seat, -1 empty |
| `numJoinedPlayers` | `int`, 0 (`M:35`) | `M:525`, `M:544`, `M:564`, `M:572`, `M:278` | Seated count |
| `playingPlayer` | `int`, -1 (`M:36`) | `M:211`, `M:288`, `M:281`, `M:353`, `M:380` | Seat to act |
| `gameStarted` | `bool` (`M:39`) | `M:210`, `M:263` | |
| `currentMulti` | `int`, 1 (`M:40`) | `M:240`, `M:276`, `M:379` | Standing quantity |
| `currentDie` | `int`, -1 (`M:41`) | `M:241`, `M:277`, `M:378` | Standing face, -1 none |
| `lastWinner` | `int`, -1 (`M:42`) | `M:264`, `M:271` | `playerId` of the last winner |
| `onesWild` | `bool`, true (`M:43`, `TP:840`) | `M:145` | Option |

`RequestSerialization()` in `M`: lines 146, 282, 289, 517, 527, 546, 575. The owner then calls
`AllDeserialization()` itself; everyone else gets it through `OnDeserialization` (`M:610-613`).
`_PlayerContests` (`M:330-387`) changes `remaining`, `currentPlayers`, `numJoinedPlayers`, `playingPlayer`,
`currentDie`, `currentMulti` on the owner and does **not** serialise: the change travels only with the
next round.

Owner-only or per-client fields that the rules depend on, not synced: `diceLeft` (`M:31`),
`postContestTurnPlayer` and `postContestTurn` (`M:37-38`), `onesInvalid` (`M:45`), `canInteract` (`M:46`).
Local by design: `rulesIndex` (`M:53`), `audioState` (`M:80`).

`PlayerHandle` (`P:19`, manual sync; four per table). Writer is the station's owner.

| Name | Type, start | Written at | Meaning |
|---|---|---|---|
| `task` | `int`, 0 (`P:24`) | 1 `P:465`, 2 `P:479`, 3 `P:511`, 4 `P:529`, 5 `P:444`, 6 `P:542`, 7 `P:452`; set to 0 locally, unsent, at `P:222` | A command: 1 claim, 2 leave, 3 bid, 4 challenge, 5 start, 6 continue, 7 leave mid-game |
| `multiNum` | `int`, 1 (`P:29`) | `P:276` (every client), `P:420` | Quantity picked; read with task 3 at `P:669` |
| `dieNumber` | `int`, 6 (`P:32`) | `P:279`, `P:580-630` | Face picked; read with task 3 |

`RequestSerialization()` in `P`: lines 445, 453, 466, 480, 512, 530, 543, each followed by a local
`AllDeserializtaion()`. Every client that receives the station's data runs the `switch (task)` at
`P:649-687`, which calls into the master; the master methods then act only on the owner. The exception is
task 4: `_PlayerContests` (`M:330`) has no owner test at the top, so every client works out the result for
itself from its own copy of `dieValues`.

### Network events (all `NetworkEventTarget.All`)

| Event | Sent at | By | Effect |
|---|---|---|---|
| `OnesWildNetwork` | `M:138` | whoever pressed | Owner flips `onesWild` if no game is running (`M:141-149`) |
| `DiceRollSound` | `M:224` | owner, each round | Plays the roll (`M:465-481`) |
| `ResetStations` | `M:280` | owner, game end | Every station to the lobby look (`M:321-328`, `P:290-296`) |
| `GameEndSound` | `M:284` | owner, game end | Applause (`M:312-319`) |

### Ownership, timers, random numbers, persistence

- **Ownership transfers:** `P:461` (the joining player takes the station) and `P:207` (every client sets
  the seated player as owner whenever the master's data arrives and its own `owner` variable was empty).
  `P:657` reads the owner back with `Networking.GetOwner` to learn who joined. The master object is never
  transferred by code.
- **Delayed events:** `SendCustomEventDelayedFrames(nameof(_InteractionDelay), 30)` at `P:442`, `P:463`,
  `P:477`, `P:509`, `P:526`, `P:540`. Nothing delayed by seconds.
- **Per-frame code:** `T:113-144` only (fingertip spheres; avatar check every 240 frames).
- **Random numbers:** `Random.Range(0, 6)` per die at `M:461`: all 20 dice, by every client once at
  `Start` (`M:122`, overwritten by the first sync) and by the **owner alone** at each round (`M:223`).
  `Random.Range(0.9f, 1.1f)` at `M:469`: roll pitch, each client its own.
- **Persistence:** none. Nothing is saved between instances.

---

## 3a. Design change in detail: each player rolls and commits

**As built (2026-11-24).** The coordinator chose the seeded roll (Q1): each player's dice are a **fair
self-roll** through the runtime's `Secrets` fair draw, not a commitment to dice the player picked. Per round
(label `<gameId>.<round>`): every seated page calls `beginDraw(label)` (publishes SHA-256 of a 16-byte secret in
its own user state); the referee answers each commitment with a random number and pins the hash it answered (the
`fd` table); the dice are `Draw(secret, number, label).Ints(remaining, 6)`, so the player knows them at once and
nobody else does. Neither the player nor the referee can pick them: the player's number comes after its commitment,
and the referee numbers a hash whose secret it does not know; **the referee's own draw** is numbered by a witness (the
lowest-ranked other participant, portkit `bf8b5c6`), so a modified referee that searches for a number it likes is
`rejected` everywhere (the review's probe found five 1s accepted before that fix; now test "a modified referee that
grinds its own number"). What a modified referee can still do is in the trust table below. On "Call it" the referee calls `demandReveal(label, reveal-timeout)`
and every page seated at the challenge calls `revealDraw(label)`; the referee counts only draws whose state is
`revealed` (secret matches the pinned hash). A secret changed after the number is `rejected`; no reveal by the
deadline is `forfeit`; both put the player in `missing`, with the forfeit rules of step 7 below. Bidding opens
when every seated player's draw is numbered; a player still without a number at `commit-timeout` is removed as
if they had left. What differs from the proposal below: no hand-made hash string, salt or `c`/`o` leaves (the
runtime's `fd`/`fr` user-state entries and `fd` table do that); no `taskAck` (the runtime's numbered commands
do that). **Third pass:** a reload is resumed (N12): the kit saves the draw on the device and moves the referee's entry
to the new session (G6 fixed in the kit), and the game holds a seated player's seat for `rejoin-grace` seconds
(default 20) during a game, giving it to the same user's new session (scenario "a seated player reloads ..."). Every client repeats the count from the reveals it sees (`integrityOk`, checked in S1).
**Fourth pass (2026-11-25, section 12):** a reload never re-rolls (portkit `30881dd`: a new secret under a label the
user already holds is `rejected`); the station calls `beginDraw` at once (the saved secret is reused, no more 3 s
wait); a player whose draw cannot come back (a reload on another device) is told on their display and sees the red X on
their own dice, and is out at the challenge; every client's check of the result counts each seat's dice from what it saw
during the round and shows a failure on the display (`integrity`).

**Why.** Upstream sends every die to every client (`M:29`) and hides them by drawing "?" (`M:781`). Ported
as is, all 20 values would sit in public space state where any player can read them from the page console.
The platform has no private channel, so the only values that may travel before a challenge are ones that
give nothing away.

### Code sites it touches

| Upstream | What changes |
|---|---|
| `M:29` `dieValues` synced | Stays a synced field but holds -1 for every die except during a result, when the referee fills in the opened, checked dice (this is also what lets a late arrival see the result, D01) |
| `M:106`, `M:122` roll at `Start` | Removed |
| `M:219-234` `_NewRound` | No roll. It opens a **rolling** phase (`round++`, deadline) and sends `DiceRollSound` as now. The `NextTurn` call at `M:225-232` moves to a new `_CommitsComplete()`, so no bid can be made before every seated player has committed |
| `M:457-463` `Randomize` | Moves to `PlayerHandle.RollOwnDice()`: the local player rolls `remaining[seat]` dice (not 20) from `crypto.getRandomValues` with rejection sampling (bytes of 252 and above thrown away, then `% 6`) |
| `M:236-244` `_ReceiveBid` | Adds checks the UI used to be trusted for: bidding phase, command from the seat to act, face 0 to 5, quantity within range, raise rule of `P:497` |
| `M:330-387` `_PlayerContests` | Split in three. Request: the referee opens a **revealing** phase. `_ResolveContest()`: referee, when every opening is in or the deadline passes; holds the rule lines `M:340-371` and `M:378-380` and **serialises at once**. `ShowContest()`: every client, from state; holds the text and sound lines `M:342`, `M:344`, `M:358`, `M:361`, `M:372` |
| `M:403-435` `CalcSumShowDice` | Split into pure `CalcSum()` (the counting rule `M:413-421`, unchanged) and drawing (`M:420-431`, `M:409-412`) |
| `M:755-792` `UpdateMesh` | `M:776` draws the local player's dice from their **local** roll, not from synced data. `M:781` unchanged. In the result phase it draws `dieValues` with the cyan tint |
| `M:37-38`, `M:45`, `M:31` | `postContestTurn`, `postContestTurnPlayer`, `onesInvalid` become synced; `diceLeft` is computed from state. A round now spans several messages and must survive a change of referee (D12) |
| `M:554-583` `_PlayerLeft` | Gains a case per phase (below) |
| `M:610-633` | On each state change: in the rolling phase a seated client that has not committed for this round rolls and commits; in the revealing phase it opens |
| `P:24-32` | New synced `taskSeq`. New local (never synced) `myDice`, `mySalt`, also kept in `localStorage` |
| `P:645-690` | Commands are applied once: the referee keeps `taskAck[seat]` in the master's state and ignores a `taskSeq` it has already applied. Nothing runs from a snapshot (D14), and a new referee picks up a command the old one never applied |
| `P:534-546`, `M:219` | Continue is accepted only in the result phase (D06) |

Not touched: the bidding UI (`P:269-425`), turn order (`M:294-310`, `M:389-401`), the counting rule
(`M:417`), every text string, every sound.

### State added (proposal)

Master leaf, written by the referee: `phase` (0 lobby, 1 rolling, 2 bidding, 3 revealing, 4 result),
`gameId` (8 random bytes as hex, new at `_InitializeGame`), `round`, `deadline` (server seconds),
`commits[4]`, `challenger`, `bidder`, `result` (`sum`, `liar`, `loser`, `eliminated`, `missing[]`, the bid),
`taskAck[4]`, `playerNames[4]`, `lastWinnerName`, plus the three fields moved from owner-local.

Per player, in **user state** (two of the four leaves the README allows): `c` = `{g, r, s, h}` commitment,
`o` = `{g, r, s, d, n}` opening. User state rather than a behaviour leaf because the relay only lets the
sender write their own user state (`SideQuest.Ora/Protocol/RELAY.md`, section 5), while public space state
can be written by any client. A player cannot forge another's commitment or opening.

### Round, step by step

1. **Open (referee).** `round++`, `phase = rolling`, `commits` cleared, `dieValues` all -1,
   `deadline = now + commit-timeout`. Roll sound to all.
2. **Commit (each seated client).** Roll, pick a 16-byte random salt, store `{g, r, s, d, n}` in memory and
   in `localStorage`, publish `c` with
   `h = SHA-256("pk1|liars-dice|<inst>|<gameId>|<round>|<seat>|<uid>|<d0,d1,...>|<saltHex>")` as hex.
   Draw own dice. The salt is not optional: five dice have 7,776 combinations, so an unsalted hash can be
   reversed by trying them all.
3. **Pin (referee).** When every seated uid has a `c` for this game, round and seat, copy the hashes into
   `commits[]`, set `phase = bidding`, run the `NextTurn` of `M:225-232`. Openings are checked against the
   pinned copy, never against the live leaf, so a player who rewrites their own `c` later gains nothing.
   Every client also remembers the `commits[]` it first saw for the round.
   At the deadline a seated player with no commitment is removed as if they had left (`M:554-583`).
4. **Bid.** As upstream.
5. **Challenge (referee).** On command 4 from the seat to act with a standing bid: `phase = revealing`,
   `challenger`, `bidder`, `deadline = now + reveal-timeout`.
6. **Open (each seated client).** Publish `o` from memory or `localStorage`.
7. **Resolve (referee).** When every seated player has an `o` for this round, or at the deadline. An
   opening is valid when all of these hold:
   - written by the uid in `currentPlayers[seat]`, with `g`, `r`, `s` equal to the game, round and seat;
   - `d` has exactly `remaining[seat]` entries (the count at round start), each an integer 0 to 5;
   - `n` is 32 hex characters;
   - the SHA-256 of the string above equals `commits[seat]`.

   Valid dice go into `dieValues`. A seat with no valid opening goes into `missing[]`. Then:
   - bidder in `missing`: the bidder forfeits and is out of the game; nobody else loses a die; the
     challenger bids next (fourth pass: a challenger who is also in `missing` is out as well, review finding 3; the
     next seat in order then bids);
   - else challenger in `missing`: the challenger forfeits and is out; the bidder bids next;
   - else `sum = CalcSum()` over the valid seats and the rule of `M:340-371` applies. Other seats in
     `missing` are out of the game and their dice do not count, which is what upstream does with a
     player who leaves mid-round (`M:413`).

   Then `phase = result` and one serialisation.
8. **Show (everyone).** From state: dice, tint, text, boo or cheer (on the change only, not from a
   snapshot), Continue buttons.
9. **Continue.** As upstream (`M:219-234`): next round, or game end when one player is left (`M:261`).

Every client repeats step 7 for itself from the openings it can see. If its own result differs from the
referee's, or `commits[]` differs from what it first saw, it logs and shows an "integrity" note. It cannot
overrule the referee: there is no host and no vote. **As built (fourth pass):** `CheckIntegrity` takes each seat's dice
count from what the page saw while the round was played (not from the referee's `dieValues`), checks every counted
seat's dice against its revealed draw, that no seat whose draw is `rejected` or `forfeit` here was counted, that no seat
with a valid reveal here was put out, the sum, the kind of result, the loser and the dice left. A mismatch sets
`integrity = "failed"` and adds "Check failed: this result does not match the dice shown" to that page's display. A page
that arrived after the bidding works the counts back from `remaining` and can at best report `partial`.

Leaving, by phase: lobby, the seat is released (fixes D04). Rolling, the player is removed and step 3 is
re-tested. Bidding, as upstream (`M:566-574`). Revealing, treated as a missing opening and step 7 is
re-tested. Result, the player is removed and, if they were to bid next, the next seat in order takes it
(defines D05).

### What it does and does not protect (trust, as built: fourth pass, 2026-11-25)

The first pass's table assumed the plan's scheme (commit to dice the player picked); the game uses the fair self-roll
(Q1), and the review found the referee missing from the table. As built, on portkit `812f285`. "A modified page" is a
page whose script a player has changed; nothing here stops a player from doing that.

| What a modified page tries | Upstream (VRChat) | Port: what it can still do, and what stops it |
|---|---|---|
| Read other players' dice before a challenge | Any client has all 20 values (`M:29`) | **Cannot.** Only SHA-256 commitments of 16-byte secrets travel before the challenge; `dieValues` is all -1 (test "secrecy: ...", which watches every message, every page's `dieValues` and every user state on every tick) |
| Choose its own dice | Not possible (the master rolled) | **Cannot.** A player's number comes from the referee after its commitment |
| Change its dice after seeing bids | Not possible | **Cannot.** The commitment is pinned before the number; a changed secret is `rejected` (S7) |
| Re-roll by reloading (or by a second page) | Not applicable | **Cannot.** A new secret under a label the user already holds gets the first entry back and is `rejected` everywhere (portkit `30881dd`); the page shows the red X on those dice and the player is out at the challenge |
| Refuse to reveal | Not applicable | Costs the refuser their place; cannot gain a die. Both sides of a challenge refusing puts both out (finding 3) |
| Forge another player's commitment or reveal | Master only | **Cannot.** The relay ties user state to its sender |
| **As referee:** choose another player's dice | The master rolled everyone's dice | **Cannot.** It numbers a hash whose secret it does not know |
| **As referee:** choose its own dice | The master rolled its own dice | **Cannot alone.** A witness numbers the referee's draw (portkit `bf8b5c6`); a number it searched for is `rejected` on every honest page (test "a modified referee that grinds its own number"). **With one accomplice** as its witness it can steer its own draw, and an accomplice can tell it another player's secret |
| **As referee:** write a false result (wrong count, a die marked lost, a rejected draw counted, the wrong loser, a die taken from the wrong player) | The master can do anything | **Can write it; every other page says so.** Each page repeats the judgement from the reveals and the dice counts it saw itself and shows "Check failed" on its display (tests "a referee that marks a live die lost", "... counts its dice anyway"). Nobody can overrule the referee (no host, no vote); a page that arrived after the bidding can only check part |
| **As referee:** stall or remove players | The master could | **Can:** refuse to number someone (they are removed at `commit-timeout`), let a reveal deadline pass (forfeit). Visible to all |
| Take the referee seat | The instance master is VRChat's choice | **Can** under the referee rule `"anyone"` (no server decides who is referee; portkit README) |
| Overwrite the table's synced fields | Only the owner writes them | Synced fields are public space state: a modified page can overwrite them, as a modified VRChat client can. Every rule is checked by the referee from commands (`CallingPlayer`), and the referee's next write puts the fields back |

Limits of the checks (portkit README): a page that arrives after a draw was numbered takes the entries it finds; a witness
that leaves before its answer reaches a page makes the referee's draw `rejected` there (that page then shows red X on the
referee's dice and, if the referee counts them, "Check failed": a false alarm in that rare case).

**Closing the "choose your own dice" hole** (first pass; built differently, as the fair self-roll above, Q1): commit to a
16-byte secret instead of to the dice, and derive the dice from that secret and a round seed nobody
controls. Each player also commits to a public nonce in step 2 and publishes it after the pin; the seed is
the hash of all nonces; dice come from HMAC-SHA-256(secret, seed) by the same rejection sampling; the
opening is the secret. One more user-state write per player per round, one more phase, about 60 lines, a
third user-state leaf. If the roll and the check sit behind `RollOwnDice()` and `VerifyOpening()` this can
be added later without touching the rules.

---

## 4. Platform-call census

Counts are source lines. "Addition" means the README's runtime list does not name it.

| VRChat / Udon API | Uses | Where | Port equivalent | Gap and what it costs the player |
|---|---|---|---|---|
| `UdonSharpBehaviour` | 5 | all five | `Behaviour` | None |
| `[UdonBehaviourSyncMode]` | 4 | `M:20`, `P:19` manual; `X:10`, `F:12` none; `T` has none | Declared `synced` fields; a behaviour without any has no state leaf | None |
| `[UdonSynced]` | 13 | `M` 10, `P` 3 | `synced` fields in `v.<behaviourId>` | None |
| `RequestSerialization()` | 14 | `M` 7, `P` 7 | Same | None |
| `OnDeserialization()` | 2 | `M:610`, `P:640` | Same | The runtime must not call it on the writer for its own write, and the game must be able to tell a snapshot from a live change (section 3a, D14). Contract point |
| `SendCustomNetworkEvent(All, name)` | 4 | `M:138`, `M:224`, `M:280`, `M:284` | Same (one-shot plus a local call) | Late arrivals miss it, as in VRChat |
| `Networking.IsOwner(gameObject)` | 11 | `M:143`, `M:207`, `M:221`, `M:238`, `M:255`, `M:345`, `M:362`, `M:376`, `M:508`, `M:535`, `M:556` | `Networking.IsOwner(this)` | Needs "a behaviour whose owner was never set belongs to the referee". Contract point |
| `Networking.SetOwner(player, gameObject)` | 2 | `P:207`, `P:461` | `Networking.SetOwner(player, b)` | None |
| `Networking.GetOwner(gameObject)` | 1 | `P:657` | **Addition:** `Networking.GetOwner(b)`, or the writer id of the leaf | None once added |
| `Networking.LocalPlayer` | 12 | `M` 6, `P:94`, `T:51`, `T:56`, `X:40`, `X:49`, `F:29` | Same | None |
| `VRCPlayerApi.GetPlayerById` | 7 | `M:336`, `M:359`, `M:383`, `M:711`, `M:730`, `M:748`, `P:199` | Lookup by uid; names also kept in state | None (fixes D11) |
| `player.playerId` | 7 | `M:176`, `M:514`, `M:526`, `M:540`, `M:560`, `M:668`, `M:773` | uid string; empty seat is `""`, not -1 | None |
| `player.displayName` | 14 | `M` 10, `P` 4 | User name | None |
| `Utilities.IsValid` | 3 | `M:508`, `M:535`, `M:556` | Null test | None |
| `OnPlayerLeft` | 1 | `M:585` | **Addition:** a `Behaviour` hook fed by the scene's `user-left` | None once added. A dropped connection that the relay reports as a leave removes the player from the game (Q5) |
| `OnPlayerTriggerEnter/Exit` | 2 | `X:38`, `X:47` | Distance from the local head (`pose-update`) on the 20 Hz tick, or a `triggerEnter`/`triggerExit` binding | UI appears up to 50 ms later. Nothing else |
| `OnTriggerEnter/Exit(Collider)` | 4 | `P:158`, `P:166`, `F:43`, `F:60` | Not ported in the first version (finger pressing) | **Gap.** VR players point and pull the trigger; they do not push buttons with a fingertip |
| `IsUserInVR()` | 5 | `P:95`, `P:130`, `P:146`, `T:66`, `F:30` | `scene.IsVR()` | Only needed for haptics |
| `GetBonePosition(HumanBodyBones)` | 9 | `T:85-86`, `T:92-93`, `T:99-100`, `T:119-120`, `T:133` | **Gap:** the page gets the local head and hands, no finger bones. The SDK can attach an object to a finger bone (`BS.AttachedObject`), untested for trigger contact | Same as the row above |
| `GetTrackingData(LeftHand/RightHand)` | 2 | `T:124-125` | `pose-update` hands | None |
| `PlayHapticEventInHand` | 4 | `F:51`, `F:55`, `F:68`, `F:72` | `scene.SendHapticImpulse(strength, seconds, hand)` | A `click` does not say which hand, so both buzz, or neither. Nothing on desktop or in Play mode |
| `SendCustomEventDelayedFrames` | 6 | `P:442`, `P:463`, `P:477`, `P:509`, `P:526`, `P:540` | `SendCustomEventDelayedSeconds(name, 0.5)` (README has seconds only) | None |
| `UdonBehaviour.SendCustomEvent(name)` | 2 in code, 64 in prefabs | `F:48`, `F:64`; 63 `Button.onClick` and 1 `Slider.onValueChanged` | `bindings.events` (object, kind, behaviour, method) | None |
| `VRC_UiShape` component | 5 | `PP:1768` (four instances), `TP:1537` | Removed; clickable colliders on layer 5 | None |
| `VRCSpatialAudioSource` | 1 | `TP:763` (gain 10, far 40) | Removed; the AudioSource's own 3D settings stay | Loudness will differ a little; tune by ear |
| `UdonBehaviour` component | 67 | 1 master, 1 tracker, 1 proximity, 4 stations, 60 selectors | Stripped by the kit builder | None |
| VRChat layers 17, 18, 2 | | menu panel 17; stations, selectors, tracker 18; fingertip spheres 2 | Clickable things to layer 5, the rest to 0 | None |

Unity calls the page cannot make itself, by relay op:

| Unity call | Uses | Relay op | Note |
|---|---|---|---|
| TMP `.text =` | `M` 16 lines, `P` 4 | `text` | Uses rich text `<color=#RRGGBB>` (`M:607`) and `<s>` (`M:724`); rich text must stay on |
| `GameObject.SetActive` | `M` 3, `P` 23, `X` 1 | `active` | |
| `material.SetFloat("_frame")`, `SetColor("_Color")` | `M:420-430`, `M:764-787` | `color` only | **No op sets a float.** Either add `matFloat` (property, value) to the README table, or give the remade shader one colour property whose alpha carries the frame (`color`, `_Die`, r, g, b, frame): no contract change, one message per die. `Material.SetFloat` and `SetColor` are both on the SDK allow-list |
| `Button.colors` | `P:378-383`, `P:409-412`, `P:503-506` | none | **No op colours a UI graphic.** Add `uiColor` (sets `Graphic.color`, on the allow-list), or give each button two overlay images switched with `active` |
| `Slider.value` read on change | `M:163`, `M:166` | none | No event kind for a slider. Add one, or replace the slider with step buttons (Q6) |
| `AudioSource.clip`, `.pitch`, `.volume`, `.Play()` | `M` 12, `P` 10 | none needed | Page side: `BS.AudioSource` `pitch`, `volume`, `PlayOneShot(index)`; clips as `{"$clip": n}`. `Play()` cuts off the sound before it on the same source; `PlayOneShot` overlaps. Barely audible difference |
| `Animator.SetBool` | `F:47`, `F:65` | `animBool` | |
| `Graphic.enabled`, `Collider.enabled` | `X:66`, `X:71`, `P:105-155`, `F:31`, `F:39` | `active` on the parent | Same effect for the player |
| `GetComponentsInChildren` order | `M:100`, `M:105`, `P:93`, `T:58`, `X:28-31` | none | Seat order and die order come from sibling order. The kit builder must write `playerHandles` and `diceMesh` into `bindings.json` as ordered arrays |
| `string.GetHashCode()` | `M:600` | none | Name colour. The value depends on the runtime; modern dotnet randomises it per process (sections 7, 9) |

`bindings.json` notes for this game: `$comp.kind` has no `Button`, `Image`, `Slider` or object-array kind.
`numButtons`, `otherButtons` (`P:45-46`) and `slider` (`M:82`) can go in as `{"$obj": key}`; that is enough
if `uiColor` exists.

---

## 5. Object model

### Hierarchy (composited from the four prefab files)

```
Liars Dice Table                         root, Transform only. Origin is at table-top level
├─ billboard display                     world Canvas 50x25 at scale 0.01 (0.5 x 0.25 m), 0.194 m above the top
│  ├─ Text (TMP)                         TMP, billboard font, size 25.8      <- M.displayText   (TP:1937)
│  └─ Text rules                         TMP, same font, 29.3 units higher   <- M.rulesText     (TP:2580)
├─ master script                         LiarsDiceMaster (TP:817) + UdonBehaviour, manual sync (TP:856)
│  ├─ p1   player.prefab   (0, 0.032, -0.637)  yaw 0     (TP:4161)
│  ├─ p2                   (-0.637, 0.032, 0)  yaw 90    (TP:3512)
│  ├─ p3                   (0, 0.032, 0.637)   yaw 180   (TP:3195)
│  └─ p4                   (0.637, 0.032, 0)   yaw -90   (TP:3844)
├─ Position Tracker   (inactive)         PositionTracker (TP:258)
│  ├─ trackhand12345 R                   sphere trigger 15 mm, kinematic Rigidbody, visible sphere (sphere.mat)
│  ├─ trackhand12345 L                   same
│  └─ headtracker                        kinematic Rigidbody, disabled sphere trigger; no code uses it
├─ AudioSource                           AudioSource (TP:649) + VRCSpatialAudioSource (TP:763)  <- M.speaker
├─ table              table.fbx          meshes "Cylinder" (top) and "Cylinder.001" (legs), table.mat, scale 0.8
├─ HandTrackerToggle                     ProximityEnable (TP:1582); convex trigger MeshCollider, built-in
│                                        Cylinder, scale (7, 1, 7), 0.5 m up (TP:1633)
└─ Menu Options                          world Canvas 30x20 at 0.01 (0.30 x 0.20 m), flat on the top between
   │                                     p1 and p2; trigger BoxCollider; VRC_UiShape (TP:1537)
   ├─ 1s wild
   │  ├─ button                          Image button.png + Button -> master "_OnesWild"       (TP:995)
   │  │  └─ Image                        check mark                 <- M.onesWildStateVisual   (TP:2445)
   │  └─ Text (TMP)                      "Ones are Wild\nGlobal"
   ├─ Volume
   │  ├─ Text (TMP)                      "Volume Local"
   │  └─ Slider                          Slider 0.025..1, value 1 -> master "_SetVolume"  <- M.slider (TP:2968)
   │     └─ Background, Fill Area/Fill, Handle Slide Area/Handle
   ├─ mute sound
   │  ├─ button                          Button -> master "_ToggleAudio"                      (TP:1125)
   │  │  └─ Image                        check mark                 <- M.audioStateVisual
   │  └─ Text (TMP)                      "Enable Sound Effects Local"
   ├─ Leave game
   │  ├─ button                          Button -> master "_LeaveGame"                        (TP:1291)
   │  └─ Text (TMP)                      "Leave mid\nGame"
   └─ Credit / Text (TMP)                "github.com/akalink/VRC-Liars-Dice"

player (p1..p4)                          PlayerHandle (PP:2667) + UdonBehaviour, manual (PP:2715)
│                                        SphereCollider trigger r 0.2 (PP:2741); Animator, UIEffect (PP:2754)
├─ dice (0) .. dice (4)                  dice.fbx, mesh "Cube", die.mat, 4 cm cubes in an arc 0.31 to 0.40 m
│                                        toward the table centre. Renderer order = die order
└─ Canvas                                world Canvas 25x25 at 0.01 (0.25 m square), tilted 82 degrees toward
   │                                     the player; trigger BoxCollider (PP:1780); VRC_UiShape (PP:1768)
   ├─ name display                       TMP "name", size 50                    <- playerNameDisplay
   ├─ Pre-Game                                                                  <- preGameUi
   │  ├─ Join                            Button -> "_Join" (PP:965), "Join Game", selector       <- joinUi
   │  ├─ leave   (inactive)              Button -> "_Leave", "Leave Game", selector              <- leaveUi
   │  └─ Start   (inactive)              Button -> "_StartGame", "Start Game", selector          <- startUi
   ├─ InGame     (inactive)                                                     <- inGameUi
   │  ├─ Num Selection
   │  │  ├─ one                          Button -> "_ChooseOne", Image 01.png, selector,
   │  │  │                               Image wild (teeth.png, inactive, PP:4332)               <- wildIconUi
   │  │  └─ two .. six                   Button -> "_ChooseTwo" .. "_ChooseSix", Image 02..06.png, selector
   │  ├─ +&-
   │  │  ├─ +                            Button -> "_Add", selector                              <- otherButtons[0]
   │  │  ├─ -                            Button -> "_Subtract", selector                         <- otherButtons[1]
   │  │  └─ result                       TMP "#"                                                 <- numberDisplay
   │  ├─ Submit                          Button -> "_Submit", selector                           <- otherButtons[2]
   │  └─ Call it                         Button -> "_Contest", selector                          <- otherButtons[3]
   ├─ Continue   (inactive)              Button -> "_ContinueGame", selector                     <- continueUi
   ├─ Rules                              Button -> "_Rules", "rules", selector
   └─ AudioSource                        AudioSource, 3D, 0.2 to 5 m (PP:3924)   <- speaker (found by search, P:84)

selector (15 per station)                FingerTrigger (SP:36-60) + trigger BoxCollider, sized per button
```

Totals in one table: 63 UI Buttons, 1 Slider, 51 TMP texts, 96 Images, 60 selectors, 20 dice renderers,
5 AudioSources, 4 Animators, 67 UdonBehaviours.

Measured from the FBX data: table top radius 0.8 m (1.6 m across), top surface at about the root's
height, legs reaching 0.847 m below the root. The kit root must therefore sit 0.84 m above the holder so
that the snippet's `position` is a point on the floor.

### Serialized fields

`LiarsDiceMaster` on `master script` (`TP:817-855`):

| Field | Value or target |
|---|---|
| `materialFloatName` | `_frame` |
| `onesWild` | true |
| `onesWildStateVisual` | `Menu Options/1s wild/button/Image` |
| `displayText`, `rulesText` | `billboard display/Text (TMP)`, `billboard display/Text rules` |
| `positionTracker`, `proximityEnable` | the behaviours on `Position Tracker` and `HandTrackerToggle` |
| `TruthContestSfx` | `yay.wav` |
| `LiarContestSfx` | `boo.wav` |
| `DiceRollSmallSfx`, `DiceRollLargeSfx` | `dice roll small.wav`, `dice roll large.wav` |
| `gameEndSfx` | `audience-clapping.wav` |
| `speaker` | the AudioSource on root child `AudioSource` |
| `audioStateVisual` | `Menu Options/mute sound/button/Image` |
| `slider` | `Menu Options/Volume/Slider` |
| `logger`, `logging` | none, false |
| found at run time | `playerHandles` = p1..p4 (`M:100`); `diceMesh` = the 20 dice renderers under `master script`, in order (`M:105`) |

`PlayerHandle` on each station root (`PP:2667-2714`):

| Field | Target |
|---|---|
| `numButtons[0..5]` | Buttons `one` to `six` |
| `otherButtons[0..3]` | `+`, `-`, `Submit`, `Call it` |
| `numberDisplay`, `playerNameDisplay` | `result`, `name display` |
| `joinUi`, `leaveUi`, `startUi`, `continueUi`, `preGameUi`, `inGameUi`, `wildIconUi` | as marked in the tree |
| `localSelectionSfx` | `click-01.wav` |
| `altSelectionSfx` | `click w-pitch amp.wav` |
| `turnNotificationSfx` | `chime.wav` |
| found at run time | `speaker` (`P:84`), `diceMaster` (`P:86`), the canvas collider and the 15 selector colliders by object name (`P:93-114`) |

In `TP`, the stations' UdonBehaviour carries an override `_syncMethod = 3` (manual) for p1 and `= 1`
(none) for p2, p3, p4. The class attribute says manual (`P:19`). I could not determine without UdonSharp
whether its build step corrects the three; it does not matter to the port.

`ProximityEnable` (`TP:1582`): `objectToToggle` = `Position Tracker`. `PositionTracker` (`TP:258`): no
references; it uses its own children by index (`T:58`, `T:119-125`).

`FingerTrigger`, one per selector; `behavior` is always the station's own UdonBehaviour:

| Selector under | `methodName` (also the Animator bool) | `pushInMethod` |
|---|---|---|
| `Join` | `_Join` | `_DepressedClickSoundAll` |
| `leave` | `_Leave` | `_DepressedClickSoundOwner` |
| `Start` | `_StartGame` | `_DepressedClickSoundOwner` |
| `Continue` | `_ContinueGame` | `_DepressedClickSoundOwner` |
| `Rules` | `_Rules` | `_DepressedClickSoundAll` |
| `Submit` | `_Submit` | `_DepressedClickSoundOwnerTurn` |
| `Call it` | `_Contest` | `_DepressedClickSoundOwnerTurn` |
| `one` .. `six` | `_ChooseOne` .. `_ChooseSix` | `_DepressedAltClickSoundOwnerTurn` |
| `+`, `-` | `_Add`, `_Subtract` | `_DepressedAltClickSoundOwnerTurn` |

Each selector's BoxCollider is sized to its button in metres (for example the face buttons are
0.025 x 0.036 x 0.038, `PP:5012` and on), which makes them ready-made click targets for the port.

### UnityEvent and UI wiring

All 63 `Button.onClick` entries and the slider's `onValueChanged` call
`UdonBehaviour.SendCustomEvent(string)` with the method name as a fixed string argument, on the station's
own UdonBehaviour (`PP:2715`) or the master's (`TP:856`). Buttons use colour-tint transitions; the script
rewrites `normalColor` and `selectedColor` (`P:371-414`). No other events, no `Interact`.

### Animators

Not 16 animations: the `Animations` folder holds **15 clips and 1 controller** (16 files), used by 4
Animator components (one per station root, `PP:2754`).

- `UIEffect.controller`: 15 bool parameters (`AC:937`) named after the methods (`_Join`, `_Leave`,
  `_StartGame`, `_ContinueGame`, `_Rules`, `_Submit`, `_Contest`, `_Add`, `_Subtract`, `_ChooseOne` to
  `_ChooseSix`) and 15 layers (`AC:1028`). Each layer: an empty default state and one clip state; bool true
  goes in, false goes out; no exit time, no blend, write defaults on.
- Clips `Join`, `Leave`, `start`, `continue`, `rules`, `submit`, `callit`, `plus`, `minus`, `num1` to
  `num6`: one key each. They set the button's RectTransform `m_LocalPosition` to (0, -7, 0.95) and its
  selector's position to (0, 0, -9). The x and y values are identical in all 15 clips although the buttons
  sit in different places, so I take the visible effect to be the z push of about 1 cm with the selector
  held still. I could not determine without Unity whether the x and y curves do anything.
- Driven only by `F:47` and `F:65` (finger in, finger out).

### Audio

| Source | Settings | Clips played |
|---|---|---|
| Table `AudioSource` (`TP:649`) | 3D, spatialised, 0.2 to 6 m, custom rolloff, not play-on-awake | dice roll small or large, boo, yay, applause |
| Station `AudioSource` x4 (`PP:3924`) | 3D, 0.2 to 5 m, custom rolloff | click-01, click w-pitch amp, chime; all local |

---

## 6. Assets

| Kind | Count | Size on disk | Largest | Note |
|---|---|---|---|---|
| Models | 2 FBX | 38.6 KB | `table.fbx` 24.8 KB | `dice.fbx`: 1 mesh, 56 vertices. `table.fbx`: 2 meshes, 298 vertices |
| Textures | 13 PNG | 13.58 MB | `table_DefaultMaterial_Normal.png` 6.18 MB | Five are 2048 x 2048; none larger |
| Audio | 8 WAV | 1.27 MB | `audience-clapping.wav` 377 KB, 4.3 s | 44.1 kHz 16-bit; five mono, three stereo; 0.09 to 4.3 s |
| Shaders | 2 `.shader`, 3 `.cginc` | 25.9 KB | | Both built-in pipeline |
| Fonts | 1 TTF, 2 TMP assets | 4.76 MB | `Heavitas SDF billboard.asset` 2.35 MB | 1024 x 1024 atlases, dynamic (need the TTF at run time) |
| Materials | 3 | | | `die`, `table`, `sphere` |
| Animation | 15 clips, 1 controller | 161 KB | | |
| Compiled Udon | 5 `.asset` | | | Not used |

Textures:

| File | Pixels | Upstream import cap (Android) | Port |
|---|---|---|---|
| `table_DefaultMaterial_AlbedoTransparency.png` | 2048 | 512 | 1024 on Windows, 512 on Android |
| `table_DefaultMaterial_Normal.png` | 2048 | 512 | Same |
| `table_DefaultMaterial_MetallicSmoothness.png` | 2048 | 256 | 256 |
| `all dice.png` (flipbook) | 2048 | 512 | 1024 and 512; frame 8 redrawn (font) |
| `all dice normals.png` | 2048 | 512 | **Drop.** The shader samples it with scale 0 (`SH:37`), so it has no effect |
| `01.png` to `06.png` (face sprites) | 321 x 322, 1-bit | 128 | Keep |
| `button.png` | 256 | | Keep |
| `teeth.png` | 560 | | Keep or redraw |

Audio channels: `audience-clapping`, `boo`, `chime`, `yay`, `click w-pitch amp` are mono; `click-01`,
`dice roll large`, `dice roll small` are stereo (make them mono for 3D playback).

Shaders and materials:

- **`akalink/dice flipbook`** (`SH`): a built-in-pipeline surface shader. It must be **remade for URP**.
  It is small: albedo = `_Color` times the atlas sampled at one of nine cells; nothing else is in use. The
  remake should compute the cell with whole numbers (`col = frame % 3`, `row = 2 - floor(frame / 3)`,
  uv = (uv + (col, row)) / 3) rather than copy the generated maths (`SH:38-46`), which lands exactly on a
  cell boundary for frames 3 and 6. Each die needs its own frame and tint: 20 material instances, or a
  property block.
- **`TextMeshPro/Mobile/Billboard/Distance Field`**: built-in-pipeline text shader for the centre
  display. Not ported: the display gets the SDK's billboard component and the stock TMP shader.
- `table.mat`: built-in Standard with albedo, normal, metallic. Converts to URP Lit by the usual upgrade.
- `sphere.mat`: on the fingertip spheres; its shader is not in the repo. Not ported.

Third-party items and licences: the table in section 1.

### 6a. Art replacements and licence checks (third pass, 2026-11-24)

Every download went to a new folder of its own, was checked for its file type, then copied in; the same list, with the
licence texts, is in `THIRD-PARTY-NOTICES.md` (also inside both bundles). `PortKit/Liars Dice/Check Licences` fails the
build check if the saved kit prefab depends on any upstream file named below as not shipped (run: PASS, 71 dependencies).

| Upstream file | Problem | Done | Source and licence (checked 2026-11-24) |
|---|---|---|---|
| `Heavitas.ttf`, `Heavitas SDF.asset`, `Heavitas SDF billboard.asset` | personal-use font | **Replaced, not imported** (the importer's `skip_files` names them, fourth pass; before, every `.ttf` and `.asset` was skipped by suffix). Every text is Archivo Black (`Assets/Kit/Fonts/ArchivoBlack SDF.asset`, a static atlas of ASCII, Latin-1 and typographic quotes) with Liberation Sans as fallback | Archivo Black, Omnibus-Type, https://github.com/google/fonts/tree/main/ofl/archivoblack, **SIL OFL 1.1** (`OFL.txt` kept as `Assets/Kit/Licenses/ArchivoBlack-OFL.txt`) |
| `all dice.png`, frame 8 (logo lettered in Heavitas) and frame 6 ("?", font not named) | Heavitas glyphs in a texture | **Redrawn**: `Assets/Kit/Art/dice_atlas.png`, made by `altspace/tools/make_art.py` from the fork's atlas: the "?" inpainted out and lettered again, the logo cell cleared and lettered "LIAR'S DICE" in Archivo Black, white with a black outline. No Heavitas glyph is left | the rest of the atlas is upstream's (MIT) |
| `all dice normals.png` | no effect upstream | Dropped | |
| `dice roll large.wav` | needs attribution | **Kept, credited** (notices, credits panel), imported as mono | "dice_06.wav" by dermotte, https://freesound.org/s/220744/, **CC BY 4.0** (licence link read on the page) |
| `dice roll small.wav` | | Kept, credited | "Dice Rolling on Table" by Flem0527, https://freesound.org/s/629982/, **CC0** (read on the page) |
| `audience-clapping.wav` | | Kept, credited | "Audience Clapping.wav" by Zeraora, https://freesound.org/s/429422/, **CC0** (read on the page) |
| `click-01.wav` | origin not stated | **Replaced** by `click_001.ogg` | Kenney "Interface Sounds", https://opengameart.org/content/interface-sounds (author Kenney, **CC0**, `License.txt` in the pack) |
| `click w-pitch amp.wav` | origin not stated | **Replaced** by `select_002.ogg` | same pack |
| `chime.wav` | origin not stated | **Replaced** by `confirmation_001.ogg` | same pack |
| `boo.wav` | origin not stated | **Replaced** by `jingles_SAX01.ogg`, a falling sax phrase (no CC0 crowd boo was found) | Kenney "85 short music jingles", https://opengameart.org/content/85-short-music-jingles (**CC0**, `license.txt` in the pack) |
| `yay.wav` | origin not stated | **Replaced** by `jingles_SAX02.ogg`, a rising phrase | same pack |
| `teeth.png` (wild icon) | origin not stated | **Replaced** by `Assets/Kit/Art/wild.png`, a star with a "1" drawn by `make_art.py` | made for the port |
| `dice flipbook.shader` | built-in pipeline | **Remade**: `Assets/Kit/Shaders/DiceFlipbook.shader` (URP, one pass, main light and ambient, whole-number cell maths; `_frame` and `_Color` set through the relay's `matFloat` and `color` ops on each renderer's own material) | made for the port |
| `TMP_SDF-Mobile-Billboard.shader`, `TMPro*.cginc` | built-in pipeline, no licence file | Not imported; `BS.BSBillboard` turns the display | |
| `die.mat`, `table.mat`, `sphere.mat` | built-in Standard | `Assets/Kit/Materials/Die.mat` (the flipbook), `Table.mat` (URP Lit, URP's own keyword setup run on it); the models' material remaps to `die.mat` are removed, so the old atlas is no dependency | |

The Kenney packs were taken from OpenGameArt, where Kenney published them: kenney.nl's own download goes through a
donation page whose download link this session was not allowed to follow automatically.

Textures as imported: table albedo and normal 1024 (Windows) / 512 (Android, ASTC 6x6), metallic 256, dice atlas 1024 /
512, face sprites 128, button 256 / 128, wild icon 128. Bundles: Android 1,867 KiB, Windows 3,695 KiB (third pass);
1,888 KiB and 3,724 KiB (fourth pass, with the licence texts packed).

**Fourth pass, licences (review finding 6):** every full licence text the notices name is in `Assets/Kit/Licenses/`
(packed into both bundles beside the notices): upstream's MIT text, CC BY 4.0 and CC0 1.0 (the legal code, downloaded
from creativecommons.org on 2026-11-25 into a folder of its own, checked as plain text), the two Kenney licence files and
Archivo Black's OFL (moved there from `Audio/` and `Fonts/`, `.meta` kept). Liberation Sans, the fallback atlas, now has its
copyright line in the notices and the credits panel; its OFL text is TextMesh Pro's `LiberationSans - OFL.txt`, which the
kit tools pack whenever the prefab uses that font (both bundle reports list it).

---

## 7. Translation map

**Third pass: `ts/bindings.json` is the kit builder's** (187 objects, 122 refs, 67 behaviours, 5 events). The keys below
were kept (the builder asks for them), paths now start with `LiarsDiceTable/`, the wild image is `one/Image wild`, clips
are held by the behaviour's own object, and a credits button and panel were added. What follows was the provisional
plan (written 2026-11-24 from the object model of section 5, before any kit build). The kit builder (`LiarsDiceKitBuilder`) will write the real one; until then these are the object keys and
paths it is expected to export, relative to the kit root: `display`, `rules`, `billboard`, `master`, `speaker`
(the table's AudioSource, clip list yay 0, boo 1, roll small 2, roll large 3, applause 4), `proximity`, `menu`,
`onesWildButton`, `onesWildCheck`, `volumeSlider`, `soundButton`, `soundCheck`, `leaveGameButton`; per station
`p1`..`p4` (`master script/pN`, with its Animator): `pN_die0`..`4`, `pN_canvas`, `pN_name`, `pN_preGame`,
`pN_join`, `pN_leave`, `pN_start`, `pN_inGame`, `pN_one`..`pN_six`, `pN_wild` (assumed name of the wild image
under `one`), `pN_plus`, `pN_minus`, `pN_number`, `pN_submit`, `pN_callIt`, `pN_continue`, `pN_rules`,
`pN_speaker` (clip list click-01 0, click w-pitch 1, chime 2), and the 15 click targets `pN_<button>_sel`
(`<button path>/selector`). 185 objects, 120 refs, 66 behaviours (master, four stations, `prox`, 60
FingerTriggers), 4 events. Every object is `sync: "none"`: the game uses no networked objects. A key the
builder names differently only needs the tests' helper names changed.

As built: `LiarsDiceMaster.ts` (1,144 lines, with the pure rule functions the vectors call:
`returnNextUser`, `returnLastPlayer`, `calcSumShowDice`, `playerContests`, `bidAccepted`), `PlayerHandle.ts`
(`highlightColors`, the `Task` command), `ProximityEnable.ts`, `FingerTrigger.ts`, `PositionTracker.ts` (empty),
and `gaps.ts` for the local stand-ins of section 10.

In porting order. TypeScript line estimates are mine.

| # | Upstream | To | Lines | Hard parts |
|---|---|---|---|---|
| 1 | `LiarsDiceMaster.cs` | `ts/src/LiarsDiceMaster.ts` | 812, about 950 | The phase machine of section 3a replaces the implicit "event then wait" of `M:330-387`. Owner-local fields become state (`M:31`, `M:37-38`, `M:45`). Player ids become uid strings with `""` for empty; every `== -1` and `GetPlayerById` (7) changes. Drawing fans out wide: one state change redraws 20 dice, about 30 toggles, 40 button tints and 10 texts per client, so relay calls must be cached and only differences sent. Name colour (`M:598-608`): square root of each channel to one hex digit, doubled; the hash has to be a port-defined one (same on every Altspace client; matching VRChat's colours cannot be verified). Sound once per change, never from a snapshot |
| 2 | `PlayerHandle.cs` | `ts/src/PlayerHandle.ts` | 709, about 650 | `task` becomes a numbered command acknowledged by the referee. Own roll, commitment, opening, `localStorage`. `HighLightButton` (`P:371-414`) is the densest logic in the file and worth translating character for character, then drawing through `uiColor`. The VR/desktop collider juggling (`P:93-172`) goes. `multiNum` and `dieNumber` are written by non-owners at `P:276-279`; keep those writes local |
| 3 | `ProximityEnable.cs` | `ts/src/ProximityEnable.ts` | 96, about 60 | Local-player test without a player trigger; hide by switching the six canvases with `active` instead of 147 component `enabled` flags |
| 4 | `FingerTrigger.cs` | `ts/src/FingerTrigger.ts` | 77, about 50 | Becomes "a click on this selector": pulse the Animator bool, play the push-in sound, buzz, call the method. 60 instances, no synced fields, so no state keys |
| 5 | `PositionTracker.cs` | `ts/src/PositionTracker.ts` | 146, about 20 | No finger bones. A stub unless finger pressing is taken up (Q7) |
| | `editor/GenerateDiceTable.cs` | not translated | 48 | Replaced by `Assets/Kit/Editor/LiarsDiceKitBuilder.cs` |

Kit builder work specific to this game: flatten three levels of nested prefabs; strip 67 UdonBehaviours,
5 VRC_UiShape, 1 VRCSpatialAudioSource; turn the 60 selectors into non-trigger layer-5 click colliders and
remove the canvas colliders (they would swallow the clicks); drop `Position Tracker`; swap the font on 51
texts; swap the two missing check-mark sprites; clear static flags on dice and table; lift the root
0.84 m; write `playerHandles` and `diceMesh` as ordered arrays.

---

## 8. Snippet design (proposal)

Slug `liars-dice`, title "Liar's Dice". **Not `single`**: several tables in one world is the normal case.

### Settings

| Attribute | Default | Meaning | Upstream |
|---|---|---|---|
| `room` | `""` | Instance key (README) | |
| `position`, `rotation`, `scale` | `0 0 0`, `0 0 0`, `1` | Holder; `position` is the floor point under the table centre | |
| `ones-wild` | `true` | Starting value of the option; players can still change it between games | `M:43`, `TP:840` |
| `sound` | `true` | Starting value of each player's sound toggle | `M:80` |
| `volume` | `1` | Starting value of each player's volume, 0.025 to 1 | `TP:2968` |
| `ui-range` | `3.5` | Metres from the table centre inside which the UI shows; `0` always | `X`, `TP:1633` |
| `commit-timeout` | `15` | Seconds a seated player has to roll before being removed | new |
| `reveal-timeout` | `15` | Seconds to open dice after a challenge | new |
| `debug` | `false` | Console logging | `M:85` |
| `windows`, `android` | | Bundle addresses for tests (README) | |

Gizmos: `<bs-gizmo type="position" attribute="position"/>`; a flat
`<bs-gizmo type="plane" attribute="position" size="1.6 1.6" rotation="90 0 0"/>` for the footprint;
`<bs-gizmo type="sphere" attribute="position" radius="3.5"/>` for the UI range.

### Seats and players

Four stations, 2 to 4 players, any number watching. Upstream has no sitting (no VRCStation), so the kit has
no `BS.Seat` and nobody is moved or locked. Every bound object is `sync: "none"`, `grab: false`,
`seat: false`: this game uses **no networked objects and sets no network ids**.

### Per instance

Holder `pk1:liars-dice:<inst>`; space state under `pk1.liars-dice.<inst>.` (referee record, one leaf for
the master, one per station: about six keys); two user-state leaves per seated player; the one-shot
envelope's `i`; the relay payload prefix; `localStorage` under `pk1.liars-dice.<inst>.<uid>.` (`roll`,
`sound`, `volume`); the rules-line index. Kit objects must be found by path under their own kit root:
names such as `p1`, `Canvas`, `selector`, `button` and `Text (TMP)` repeat inside one kit and across kits.

### Player actions

All buttons work the same way in VR and on desktop: the player points at the button (laser, or mouse) and
clicks; the click lands on that button's layer-5 collider and the binding calls the method. Feedback on
every click: the button's push animation pulsed for 0.15 s, the click sound, and in VR a short buzz.

| Action | Control | Who may | Method |
|---|---|---|---|
| Take a seat | Join | anyone, in the lobby | `_Join` |
| Give up a seat | Leave Game | the seat's player | `_Leave` |
| Start | Start Game | any seated player, two or more seated | `_StartGame` |
| Pick a face | six face buttons | the player to act | `_ChooseOne` to `_ChooseSix` |
| Change quantity | + and - | the player to act | `_Add`, `_Subtract` |
| Bid | Submit | the player to act | `_Submit` |
| Challenge | Call it | the player to act, with a standing bid | `_Contest` |
| Next round | Continue | any player seated at the challenge | `_ContinueGame` |
| Read the rules | rules | anyone | `_Rules` |
| Ones wild | menu toggle | anyone, in the lobby | `_OnesWild` |
| Sound on or off, volume | menu toggle, slider or step buttons | anyone, local | `_ToggleAudio`, `_SetVolume` |
| Leave a running game | Leave mid Game | a seated player | `_LeaveGame` |
| Roll, commit, open | none: automatic | | section 3a |

**Seeing your own dice.** The five dice in front of your station show their faces on your screen only.
Your page draws them from the roll it holds in memory; every other page draws "?" on the same five
objects because it has nothing else to draw. Nothing is sent. This is how upstream looks (`M:773-782`),
with the difference that the other clients no longer hold the values. It is the same in VR and on
desktop: look down at the table. A player who streams or shares their screen shows their dice, as at a
real table.

---

## 9. Test plan

### Golden vectors (upstream C# built with dotnet against stubs, compared with the TypeScript)

dotnet 8.0.420 and Node 22 are on this machine. Stubs needed: `UdonSharpBehaviour`, `Networking`,
`VRCPlayerApi`, `Utilities`, `TextMeshProUGUI`, `Button` with `ColorBlock`, `Renderer` and `Material`
that record `SetFloat` and `SetColor`, `AudioSource`, `GameObject.SetActive`, and `UnityEngine.Random`
fed from a script. Private methods through reflection.

| Set | Function | Vectors |
|---|---|---|
| V1 | `ReturnNextUser` (`M:294-310`), `ReturnLastPlayer` (`M:389-401`) | Every seat pattern, every has-dice pattern, every start seat, both `postContestTurn` values (about 2,000). Patterns where upstream cannot terminate are left out and listed |
| V2 | Counting (`M:403-435`): the sum and each die's frame and tint | 5,000 random tables over face, ones-wild, ones-invalid, dice left, empty seats |
| V3 | Bid acceptance (`P:491-517`) and the ten button colours (`P:371-414`) | All combinations of min 1 to 20, max, quantity, picked face -1 to 6, standing face -1 to 5, first-turn flag (sampled to 10,000) |
| V4 | Challenge outcome on the owner (`M:330-387`): dice left, seats, count, seat to act, who starts | 2,000 random states |
| V5 | Display text (`M:697-753`, `M:342`, `M:358`, `M:372`, `M:442`, `M:450`) | Every phase; colour tags removed on both sides before comparing |
| V6 | Whole games on one client acting as owner: join, start, bid, challenge, continue, leave, with scripted dice | 200 random games, every synced field after every step. The port gets the same dice through injected rolls |

Not suited: `_ReturnPlayerColor` (`M:598-608`). dotnet 8 gives a different `string.GetHashCode()` in
every process and VRChat's value is unknown here, so no vector can be made. The port's hash gets
hand-written vectors and the hue-to-tag half is tested on its own.

### Node, several clients on the fake room, virtual time

| # | Scenario | Checks |
|---|---|---|
| N1 | Four join, one starts, scripted full game to a winner | F05 to F42; every client's state digest equal at every step |
| N2 | Secrecy: record every state write, user-state write and one-shot for a round | Before the challenge no message contains a die value; an unsalted search of the 7,776 hands matches no hash |
| N3 | Challenge with a true bid, a false bid, ones wild, ones invalidated | F30 to F37 |
| N4 | Opening that does not match (changed die, wrong count, wrong round, replay of last round's opening) | Section 3a step 7: forfeit of the right player, no die lost by anyone else |
| N5 | No opening before the deadline, as bidder, as challenger, as a third player | Same |
| N6 | No commitment before the deadline | Player removed, round goes on with two or more, game ends with one |
| N7 | Player rewrites their commitment after the pin | Opening checked against the pin; rejected |
| N8 | Leave in each phase: lobby (two seated: D04), rolling, bidding as the player to act and not, revealing, result (D05) | F43 to F47 and the rules of section 3a |
| N9 | Referee leaves in each phase | F62; no command lost, none applied twice; the result survives (D12) |
| N10 | Late arrival in each phase | F61; in the result phase sees the dice and text (D01); no sound, no command replay (D14) |
| N11 | Two Continue presses in the same tick; two Joins on one station in the same tick; one player joining two stations | D06, F05, F06 |
| N12 | Reload of a seated player's page mid-round with the session resumed | Roll restored from `localStorage`; opening accepted |
| N13 | Two tables and another game in one room | No key, message or relay call crosses instances |
| N14 | Random soak: 500 games of random legal and illegal actions, joins, leaves and referee loss | Invariants: dice left match seats; one seat per player; the seat to act is seated with dice; a phase never goes backwards within a round |
| N15 | A dishonest referee writes a wrong sum | Other clients raise the integrity note |

### Play mode, one player

The game needs two players and allows one seat each, so a one-player Play session needs a second logical
client inside the page (a test-only loopback client behind a query flag). Lines to read from the log:
kit loaded and every binding resolved; all 63 buttons deliver their method on click; a bot game of two
seats reaches a winner; die frames and tints set as the state says (read back through the relay); each
of the eight sounds played at least once; WebCrypto hashing and random bytes work in the page (spike S5);
`ui-range` hides and shows the UI as the player walks out and in.

### Local Multiplayer, two players

Both join and play a full game: equal state digest on both pages after every step. Each page shows its
own five faces and "?" for the other's until the challenge, then both show all ten. Player 2 reloads
during bidding and is removed or restored, whichever the lead decides under Q5, and Player 1 can go on.
The referee's page is closed mid-round and the other takes over. A second table in the same scene is
played alternately with the first. Ones-wild toggled on one page shows on the other.

---

## 10. Changed or left out, then risks and questions

### Decisions recorded (coordinator, 2026-11-24)

- Each player's dice are a **fair self-roll**: commit to a secret, the referee publishes a number, the dice come
  from both (the runtime's `Draw`); reveal on a challenge; a player who does not reveal by `reveal-timeout`
  forfeits (out of the game, nobody else loses a die), and so does one whose reveal does not match. Closes Q1.
- **Fixed on purpose, listed as deliberate differences:** `remaining[-1]` when a lobby player leaves (D04);
  a second Continue skipping a turn (D06); the turn landing on an empty seat (D05, and `ReturnNextUser` in
  general: V1 shows the 1,792 seat patterns where upstream returns no playable seat or throws).
- **Point and click** replaces fingertip pushing (F55 to F57).
- **Every other rule literal.** In particular D10 stays: the bidder judged in a challenge is the previous
  taken seat (Q4 answered "keep").
- Referee rule: `"anyone"` (the runtime default), not `"declared"`. In this game the referee never learns
  anyone's dice before the reveal (its numbers are public), so a bystander referee is handed no secret; a
  client is a candidate only after its kit has loaded (it announces after `loadKit`), which covers Q8.

### Runtime gaps found while porting the rules

Second pass: local workarounds lived in `ts/src/gaps.ts`. Third pass: all of them are gone; every row is fixed in the kit.

| # | Gap | Status (third pass, re-synced to portkit `c7abead`, `a404a3c`, `c876a0c`) |
|---|---|---|
| G1 | No pitch or volume for an audio source | **Fixed in the kit**: `AudioSourceRef.pitch` / `.volume` / `clip` / `Play()`; `Speaker` deleted |
| G2 | `Color` lacks cyan, gray, `HSVToRGB` | **Fixed in the kit**: `Color.cyan`, `Color.gray`, `Color.HSVToRGB`; `gaps.ts` deleted |
| G3 | No `audio` relay op | **Fixed in the kit** (the `audio` op; the builder mirrors each clip list into `PkClips`) |
| G4 | No game relay op from TypeScript | **Fixed in the kit** (`Host.op`); this game needs none of its own |
| G5 | The fair-draw table was public space state | **Fixed in the kit**: the numbers live in the referee's user state and every client keeps the first pin it saw. The stated loss is removed |
| G6 | A reload lost the player's dice | **Fixed in the kit**: the secret is saved on the device and the referee moves the entry to the new session. The game now holds the seat for `rejoin-grace` s and gives it back to the same user (scenario "a seated player reloads its page mid-round", and rung 4's reload during the result). The stated loss is removed |
| G7 | A click names no hand | **Fixed in the kit** (`Input.LastClickSide`): FingerTrigger buzzes that hand, both when null (scenario) |
| G8 | Departures with no referee | **Fixed in the kit** (held until a referee exists); `Reconcile()` stays for a referee that joined after the departure, and now also hands a seat back after a reload |
| G9 | A delayed frame is a tick | Documented in the kit; the port keeps 0.5 s |

### Changed

| What | Reason |
|---|---|
| Each player rolls and commits; dice are opened and checked at a challenge (section 3a) | No private channel; upstream's synced dice would be readable by everyone |
| Explicit phases; the challenge result is state; commands are numbered and acknowledged | Needed by the above; also fixes D01, D05, D06, D12, D14 |
| Two timeouts and forfeit rules for a player who does not roll or open | New failure cases that upstream cannot have |
| The referee checks bids and turn (`M:236-244` trusts the sender) | State can be written by any client |
| Names are kept in state; a missing player never breaks the display | D11 |
| A lobby departure is a seat release; dice counts reset at game end; + limit counted first; stale Start and check mark fixed | D04, D13, D07, D08, D09 |
| Buttons are clicked by pointing in VR | No finger bones for the page; section 4 |
| 30-frame lockout becomes 0.5 s | README has delays in seconds only |
| Font, and the lettering in atlas frame 8 | Heavitas cannot be redistributed on the evidence found |
| Centre display faces the viewer by component, not by shader | Built-in-pipeline shader |
| Dice shader remade; dice normal map dropped | URP; the map has no effect upstream |
| Credit line gains the port's credits and the third-party notices | MIT notice, CC BY attribution |

### Left out

| What | Reason |
|---|---|
| Fingertip button pushing, the fingertip spheres, avatar-change detection, "laser only when the hand is away" (F55 to F57) | No finger bones; the click path covers every action. Costs VR players the physical push |
| `Logger.prefab` and the on-table log (F63, in part) | Debug aid; `debug` logs to the console instead |
| Editor menu (`G`) | Replaced by the kit builder |
| VRChat spatial audio settings | No equivalent; Unity 3D settings stay |
| Compiled Udon assets, billboard shader, TMPro includes, `sphere.mat` | Not used by the port |

### Risks and questions, most serious first

| # | Risk or question | What decides it |
|---|---|---|
| Q1 | **Closed 2026-11-24: fair self-roll through the runtime's `Draw` (section 3a, as built).** Was: **A modified page can choose its own dice.** The plan's scheme stops peeking and changing, not choosing; upstream did not let players choose. The seeded roll in section 3a closes it for about 60 lines and one more message per player per round | Lead: ship the plan's scheme, or the seeded one |
| Q2 | **Closed (third pass): Heavitas replaced by Archivo Black (OFL) everywhere, the atlas lettering redrawn, `dice roll large.wav` credited (CC BY 4.0, page read), the five unsourced sounds and `teeth.png` replaced (section 6a).** Was: Heavitas is not MIT; `dice roll large.wav` needs a CC BY 4.0 credit | Done |
| Q3 | **Mostly answered by the runtime 2026-11-24** (`OnPlayerLeft`, `GetOwner`, unowned behaviours belong to the referee, `isSnapshot`, `matFloat`, `uiColor`, `uiSlider`, synchronous SHA-256, draws in user state); still open: gaps G1, G4, G5 above. Was: **README additions this game needs:** `OnPlayerLeft` on `Behaviour`; `Networking.GetOwner`; a rule that an unowned behaviour belongs to the referee; no `OnDeserialization` echo to the writer and a way to tell a snapshot from a change; relay ops for a material float (or the alpha trick) and a UI graphic colour; a slider event; where `commit()` publishes (this design wants user state). Hashing through WebCrypto is asynchronous, which does not fit rule code translated line for line; a small synchronous SHA-256 in the runtime would | Pathfinder and README owner |
| Q4 | **Kept as upstream (2026-11-24).** D10: keep "the bidder is the previous taken seat" or record who actually bid? Recording is one field and changes the outcome only after a mid-round leave | Lead |
| Q5 | What counts as leaving? Upstream: leaving the world, at once. On the relay a sleeping headset or a page reload may show as a leave and remove the player from the game. A grace period would be a rule change. Whether a resumed session raises `user-left` at all is not known | Spike on the relay; lead |
| Q6 | Unity UI inside a kit: do Buttons and the Slider receive the app's pointer, or only colliders with `click`? The design uses colliders for buttons either way; the slider has no fallback but step buttons | Spike S6 |
| Q7 | Panels are 25 cm with 4 cm buttons, made for fingers. Whether they are comfortable to hit with a laser from a standing position is unknown until someone tries; `scale` helps only by enlarging the whole table | Play mode, then headset |
| Q8 | A referee who is not at the table, or whose kit failed to load, still runs the rules; a stalled referee stalls the table until the election replaces it | Runtime: only clients with the kit loaded stand for referee |
| Q9 | Relay traffic: a naive redraw is about 130 relay calls per client per state change. With caching it is a handful, but the cost of one `SendToVisualScripting` call in the app is unmeasured | Rung 5 |
| Q10 | Name colours will not match VRChat's for the same name | Accept |
| Q11 | Not determined in this analysis: the Unity and SDK versions (not in the repo); what the three missing GUIDs were; the origin of five sounds and `teeth.png`; whether the x and y curves of the 15 clips do anything; whether UdonSharp corrects the stations' serialised sync mode; the "as read" defects D04, D05, D06, D11, D14 were not reproduced | |

---

## 11. The Unity kit (third pass, 2026-11-24)

Project `altspace/` (portkit template, Unity 6000.3.21f1, Creator SDK 4.0.29, Play-mode page port 42800). Upstream
imported by `upstream_import.json` (47 asset files with their `.meta`, 5 stand-ins; not the Heavitas font, the TMP
assets, the built-in shaders or the compiled Udon programs). Upstream builds a table with its editor menu
(`editor/GenerateDiceTable.cs`: instantiate `Liars Dice Table.prefab`, optionally a logger); `LiarsDiceKitBuilder.cs`
does the same from the imported prefab (never compiling upstream C#), then:

| Step | What |
|---|---|
| Placement | the upstream root becomes `LiarsDiceTable`, 0.845 m above the kit root, so the snippet's `position` is the floor under the table centre |
| Not ported | `Position Tracker` (fingertip spheres, F55 to F57) and the logger |
| Colliders | VRChat's trigger volumes go (the 7 m `HandTrackerToggle` cylinder, the station spheres, the canvas and menu boxes: they would swallow clicks); the 60 selectors become solid click colliders on layer 5; the three menu buttons get click boxes on their rectangles |
| uGUI | GraphicRaycasters and CanvasScalers removed; buttons lose their calls into VRChat's UdonBehaviour and their colour transition (the page colours them, `uiColor`); the volume slider keeps uGUI through a nested canvas with its own raycaster (read from above, as the menu lies on the table) and reports `uiSlider`; built-in sprites (Background, UISprite, the missing check mark) become plain images |
| Text | every TextMesh Pro text uses Archivo Black SDF (static atlas) with Liberation Sans as fallback, rich text on (name colours, struck-through ones line) |
| Centre display | `BS.BSBillboard`, turning about Y only (F59) |
| Materials | `Table.mat` URP Lit with upstream's albedo, normal and metallic maps (URP's keyword setup run); `Die.mat` on `LiarsDice/DiceFlipbook`, the redrawn atlas |
| Push animation | upstream's 15 clips set the pressed button's whole local position to (0, -7, 0.95), so a press would move any button but Join to the panel's centre; the builder copies the controller and clips to `Assets/Kit/Animations` keeping each button's own x and y |
| Sounds | the stand-ins' clip fields are pointed at the replacements before the bindings are written; every speaker is 3D, linear, 0.3 to 5 m (stations) or 8 m (table) |
| Behaviours | master, four stations, `prox`, 60 FingerTriggers, the credits button; ids `master`, `p1`..`p4`, `prox` pinned in `bindings.lock.json` (the tests name them); `playerHandles`, `diceMesh`, `numButtons`, `otherButtons`, `speaker`, `diceMaster`, `behavior`, `anim`, `canvases` written as the TypeScript expects |
| Credits | a Credits button on the menu panel and a panel with the notices (`CreditsPanel.ts`, local) |
| Relay | the standard graph only (49 members, all on the allow list); no game ops, no game graphs |

New snippet settings: `rejoin-grace` (20 s; the seat is held for a reloading player during a game) and `min-players`
(2; 1 lets one person practise and is what the one-player Play-mode test uses).

### Rungs (evidence in `TESTS.md`)

Rung 0/1: `npm test` 21 of 21 (typecheck, lint, golden vectors V1 to V5, 16 scenarios). Rung 2: `PortKit/Kit/Check` PASS
(0 disallowed graph nodes, 187 bindings resolve, Android 1,867 KiB and Windows 3,695 KiB bundles PASS BundleChecker) and
`PortKit/Liars Dice/Check Licences` PASS. Rung 3: 22 of 22 in Play mode. Rung 4: 39 of 39 with two Local Multiplayer
players, reload included. Artifacts exported to `altspace/dist/`.

### Checklist after the kit

F01 to F63: 52 done, 9 changed, 2 left out (F56, F57: no finger bones). Changed: F08 (name colours from a port hash),
F13 (fair self-roll), F14 (roll per player, as a fair draw), F27 (0.5 s lockout), F33 (dice shown after the reveals are
checked), F53 (jingles for boo and cheer), F55 (point and click), F58 (head distance instead of a trigger), F63 (console
log). Kit-only rows: F48 (credits), F54 (clicks), F59 (billboard) done in the kit and checked in Play mode where rung 3
says so.

### Still unverified

Everything in the app and on a Quest (rung 5): laser clicks on the 4 cm selectors, the uGUI slider with a controller,
`BS.BSBillboard` on a kit object in the app, haptics on a real hand, sound levels and the 3D roll-off, the flipbook
shader on Quest's GPU (Vulkan / GLES3), frame time with 51 TextMesh Pro texts, relay traffic per state change (Q9), and
the page timers. In Play mode: VR input (only the desktop mouse path ran), the volume slider (bound and built, not
dragged), ProximityEnable (the tests run with `ui-range="0"`), three or four players, and the referee leaving (Node only).
