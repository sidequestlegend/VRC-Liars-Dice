# liars-dice: test evidence

Everything here ran on 2026-11-24 (third pass) and again on 2026-11-25 (fourth pass: portkit `812f285`, the review's findings) on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor. Nothing ran
in the Altspace app, on a Quest, or with controllers (rung 5: not run; worlds stay Private).

How to run each rung again:

```
cd altspace/ts && npm test                                                    rungs 0 and 1
cd altspace/ts && npm run golden                                              remake golden/vectors.json (dotnet 8)
portkit/tools/remote.sh altspace menu "PortKit/Kit/Check"                    rung 2 (Logs/portkit_check.txt)
portkit/tools/remote.sh altspace menu "PortKit/Liars Dice/Check Licences"    rung 2 addition (Logs/liarsdice_licences.txt)
portkit/tools/playtest.sh altspace altspace/playtest/single.json liars-dice  rung 3
portkit/tools/remote.sh altspace menu "PortKit/Multiplayer/Activate Player 2"
portkit/tools/playtest.sh altspace altspace/playtest/multi.json liars-dice   rung 4
```

## Rung 0: static

`npm run typecheck` (tsc, strict) and `npm run lint` (only the platform adapters touch the page or the clock): clean.

```
lint: src, portkit/src clean (page and clock rules)
```

## Rung 1: Node (no Unity)

`npm test` in `altspace/ts`, on the kit builder's real `bindings.json` (portkit `812f285`): **31 tests, 31 pass, 0 fail**
(2026-11-25; run three times in a row, 31 of 31 each time).

- Golden vectors (`test/golden.test.ts`, V1 to V5 against upstream's own C#, compiled unchanged with dotnet 8): turn order,
  counting, bid acceptance and the ten button colours, challenge resolution, the display text.
- Scenarios on the fake room (`test/scenarios.test.ts`), players pressing the selectors a player presses:

```
ok 7 - three players play a full game to a winner; nobody sees another's dice before a challenge
ok 8 - a challenge: a false bid costs the bidder a die, a true bid costs the challenger; one Continue per result
ok 9 - ones wild on and off, and a bid on ones ends their wildness for the round
ok 10 - players leaving: in the lobby (D04), as the player to act (F45), and down to one player (F46)
ok 11 - a late joiner sees the table as it is, cannot join a running game, and sees a result without replaying it
ok 12 - the referee leaves mid-round: another takes over and the game goes on (F62, D12)
ok 13 - a cheating client that changes its secret after the referee's number is rejected and forfeits
ok 14 - a player who does not reveal in time forfeits; one who does not roll in time is removed
ok 15 - two players cannot take one station, and one player cannot take two (F05, F06)
ok 16 - two tables in one room stay separate
ok 17 - the rules button cycles the rule lines locally, and the game's state fits the room's budget
ok 18 - a seated player reloads their page mid-round: the same seat and the same dice come back, and they count at the challenge
ok 19 - a player who leaves mid-game and does not come back loses the seat after rejoin-grace
ok 20 - a button's buzz goes to the hand that clicked; both hands when the runtime cannot tell
ok 21 - min-players 1: one player can practise alone; the turn comes back to them and a challenge is judged
```

- The review's findings (`test/trust.test.ts`, fourth pass; each failed before its fix, the failure in brackets):

```
ok 22 - a player who reloads while the dice are being rolled rolls as soon as the page is back (no 3 s wait)     [rolled 3.16 s after it started]
ok 23 - the referee reloads its page mid-round on the same device: its seat and dice come back, and they count  [its dice never came back: kit gap]
ok 24 - a player whose dice cannot come back (a reload on another device) is told so at once, and is out at the challenge  [nothing told]
ok 25 - the bidder and the challenger both withhold their dice: both are out, nobody else loses a die          [the challenger stayed]
ok 26 - a referee that marks a live die lost is caught by every other page, which says so on its display       [check passed]
ok 27 - a modified referee that grinds its own number is rejected, and if it counts its dice anyway every page says so  [check passed]
ok 28 - on honest games every page's check passes, and a late arrival that saw no bidding checks what it can
ok 29 - secrecy: before the challenge no secret, draw seed, die value or reveal is in any message or on any other page
ok 30 - secrecy watch: a page that publishes its reveal during the bidding is caught
ok 31 - secrecy watch: a referee that writes a die into dieValues during the bidding is caught
```

Test 29 is the review's leak probe made a test: it records every space-state batch, user-state write and one-shot every
page sends, and on every 50 ms tick while a round is rolling or bidding checks that every page's `dieValues` is all -1,
that no player's user state holds a reveal (`x.fr`), and that no page can compute another player's draw; then that no
secret or draw seed is in any message. 30 and 31 show the same watch catching a leak of each kind. Test 23 also fails if
the game's workaround for the kit gap (PORT.md section 12) is taken out.

Every scenario ends with all clients on the same state digest; the honest ones with no error logged.

## Rung 2: the kit in edit mode

Fourth pass (2026-11-25): Build Prefabs, Build Bundles, then `PortKit/Kit/Check` (`Logs/portkit_check.txt`):

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS liars-dice bindings: 187 objects resolve by path; hash matches (ba1dd43fa12436841c6b7677c39e7d3ede94d00f)
PASS liars-dice android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 461/1353, behaviours 434, scripts 12, ...
PASS liars-dice windows bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 461/1353, behaviours 434, scripts 12, ...
DONE
```

Relay graph: 49 distinct members, all on the SDK allow list of 29,061; no game graphs. `Logs/portkit_bundles.txt`:

```
android liars-dice: 1888 KiB, with notices, licence texts: ArchivoBlack-OFL.txt, CC-BY-4.0.txt, CC0-1.0.txt, Kenney-Interface-Sounds-License.txt, Kenney-Jingles-License.txt, VRC-Liars-Dice-MIT.txt, LiberationSans - OFL.txt; check: PASS
windows liars-dice: 3724 KiB, with notices, licence texts: (the same seven); check: PASS
```

Bundle sizes: Android 1,867 KiB (third pass) to 1,888 KiB, Windows 3,695 KiB to 3,724 KiB; the difference is the seven
licence texts now packed beside the notices. Bindings unchanged (same hash).

`PortKit/Liars Dice/Check Licences` (`Logs/liarsdice_licences.txt`): the saved kit prefab's 71 dependencies include no
upstream file that may not ship (Heavitas, the old atlas, the five unsourced sounds, `teeth.png`, the built-in shaders and
materials); the importer no longer even copies Heavitas, the built-in shaders or the Udon assets (`skip_files`):

```
PASS 71 dependencies of Assets/Kit/liars-dice.prefab, none of them a file that must not ship
```

## Rung 3: Play mode, one player (`playtest/single.json`)

A hand-written `<bs-snippet name="liars-dice" ... min-players="1" ui-range="0">` with the built script and both bundles
from the test's local server (`?v=<sha1>` on the bundle addresses), and `Assets/WebRoot/playtest/liarsdice-playtest.js`,
which drives the table through the SDK's desktop player with portkit's InputSim (a mouse of the test's own; the SDK casts
its own rays and raises the clicks) and reads Unity back with the `probe` command (texts, active flags, each die's
material `_frame` and `_Color`, the face buttons' uGUI colour). Seating two players on one page is not possible (one
seat per player, F06), so the page plays alone with `min-players="1"` (a port setting; default 2 as upstream).
Fourth pass: **RESULT 23 passed, 0 failed, twice in a row** (2026-11-25; third pass 22 of 22), on the rebuilt bundles (`playtest/evidence_single.txt`, screenshot
`playtest/evidence_single_result.jpg`).

Lines from the third pass's log, with this pass's new and changed lines marked (this pass's full log is the evidence file):

```
PASS the kit loads from a hand-written bs-snippet and the instance starts
PASS the kit is in the scene: the centre display (relay op text) reads Liar's Dice and Join shows
PASS the page clears upstream's placeholder texts by itself (an empty station's name, the rules line): '', ''      (new)
PASS Join (a click on the station's selector) seats the player: [1,-1,-1,-1]
PASS the station shows the player's name (relay op text, colour tag): Main Editor
PASS Join gives way to Leave Game
PASS Start Game shows (min-players 1)
PASS Start Game: the dice are rolled (fair draw) and station 1 opens the bidding: phase 2, playing 0
PASS the player's own dice show their faces in Unity (relay op matFloat, URP flipbook shader): dice [3,3,5,0,5], frames [3,3,5,0,5]
PASS the dice of an empty station show the logo: [8,8,8,8,8]
PASS the display says who starts the round: "Main Editor\n starts the round\nOnes are Wild"
PASS the picked face button turns cyan (relay op uiColor), seat 1: 0.000 1.000 1.000 1.000
PASS the quantity on the panel reads 2: 2
PASS the bid 2 X 4 is made through the panel buttons: 2 X 4
PASS the bid display in Unity reads the bid: "Main Editor's turn\n2 X 4 die\nOnes are Wild"
PASS the turn comes back to the only player, the quantity starts at the standing bid
PASS Call it: the dice are revealed and counted (fours and wild ones): sum 3, expected 3
PASS the result shows on the display: "Main Editor is not a liar:\n Bid: 2 X 4 die\n Actual 3 X 4 die\nMain Editor losses a dice"
PASS a counting die is tinted cyan, the others white (relay op color): 0.000 1.000 1.000 1.000 for a 4
PASS Continue shows
PASS the rules button shows the first rule line: To begin each round, all players roll their dice simultaneously.
PASS the credits panel opens and closes: True, False
PASS the page's own check of the referee's result passes (the dice count it saw, the reveal, the sum): ok            (now integrity, not integrityOk)
```

Dice values are 0 to 5 for faces 1 to 6; frame 8 is the logo, 6 "?", 7 the red X. Every click is a quick click on a
selector or button collider on the UI layer; all of them registered. The relay's ops land in Unity a tick or two after
the page's state changes, so the test reads Unity again until the value arrives (up to 5 s).

The one console error line, in every run, is Unity's own editor search indexer
(`UnityEditor.Search.SearchDatabase.GetDefaultSearchDatabase`, `ArgumentOutOfRangeException` at editor start), not the kit
or the page.

## Rung 4: two Local Multiplayer players (`playtest/multi.json`)

The main editor and a Multiplayer Play Mode clone (`PortKit/Multiplayer/Activate Player 2`) open the same page
(`rejoin-grace="60"`, since a page reload in Play mode can take longer than the default 20 s). The page whose session id
sorts first takes station 1 and starts; the other takes station 2. Station 1 bids 2 X 3 through its panel; station 2 calls
it; station 2 then reloads its page during the result, comes back to its station (same user, new session and player id),
and presses Continue. Fourth pass: **RESULT 43 passed, 0 failed, twice in a row** (2026-11-25; third pass 39 of 39), on
the rebuilt bundles (`playtest/evidence_multi.txt`, the second run, in which the main editor took station 2 and reloaded).
New in this pass: digests are compared at equal `version()` (`stamp()`), each page's own check of the result must say
`ok` before the reload, the reloaded page (which did not see the bidding) must say `partial` or `ok` and never `failed`,
and its round-2 dice must not be marked lost:

```
[main] PASS both pages hold the same state after the result (digest at equal version): d79f3037 @ 7:2a504419 / d79f3037 @ 7:2a504419
[main] PASS this page's own check of the referee's result passes: ok
[main] INFO station 2 reloads its page
[main] PASS after reloading its page the player has its station back (same user, new session): [2,3,-1,-1] me 3
[main] PASS the reloaded page checks the result as far as it can (it did not see the bidding): no false alarm: partial
[main] PASS the reloaded page rolls and sees its own dice in round 2 (a lost die shows the red X): [1,0,0,5,7] for 4 dice
[main] PASS and its dice are not marked lost: Main Editor
[vp-..] PASS the reloaded page holds the same state as this one (late join by reload; digest at equal version): d9c56297 @ 8:217cc093 / d9c56297 @ 8:217cc093
[vp-..] PASS both pages reach the same state in round 2 (digest at equal version): 64666cbd @ 10:f476a12a / 64666cbd @ 10:f476a12a
```

Third pass's lines, for comparison:

```
[main] PASS both players are seated and the round starts: [1,2,-1,-1]
[main] PASS before the challenge this page shows its own dice: [0,2,5,2,4]
[main] PASS and only '?' for the other player's dice (it does not know them): [6,6,6,6,6]
[vp-..] PASS before the challenge this page shows its own dice: [3,5,4,3,3]
[vp-..] PASS and only '?' for the other player's dice (it does not know them): [6,6,6,6,6]
[main] PASS station 1 bids 2 X 3 through its panel: 2 X 3
[vp-..] PASS the bid arrives at the other page and shows on its display: "Player 2's turn\n2 X 3 die\nOnes are Wild"
[main] PASS Call it: both pages reach the result: phase 4                       (and on vp-..)
[main] PASS both pages show the same ten dice after the reveal: [0,2,5,2,4,3,5,4,3,3] / [0,2,5,2,4,3,5,4,3,3]
[main] PASS the other player's revealed dice are the ones that player saw before the challenge: [3,5,4,3,3]
[vp-..] PASS the other player's revealed dice are the ones that player saw before the challenge: [0,2,5,2,4]
[main] PASS the count is the threes and wild ones among the ten dice: 3 / 3
[main] PASS both pages hold the same state after the result (digest): 279c7ff6 / 279c7ff6
[vp-..] INFO station 2 reloads its page
[vp-..] PASS after reloading its page the player has its station back (same user, new session): [1,3,-1,-1] me 3
[vp-..] PASS and sees the challenge's result (late join): phase 4
[main] PASS the reloaded page holds the same state as this one (late join by reload): a33e8ae0 / a33e8ae0
[vp-..] PASS Continue (pressed on the reloaded page) starts round 2: phase 2, round 2
[vp-..] PASS the reloaded page rolls and sees its own dice in round 2 (a lost die shows the red X): [5,3,0,0,7] for 4 dice
[main] PASS both pages reach the same state digest in round 2: 32691932 / 32691932
```

"Neither sees the other's dice before the challenge" is checked twice on each page: in Unity (the other station's five
dice have `_frame` 6, "?") and on the page (`myDice` of the other seat is null: the page cannot compute it; the Node
scenario 7 also checks that no client's fair-draw status gives another player's draw before the reveal).

## Artifacts

Fourth pass: `PortKit/Kit/Export Artifacts` to `altspace/dist/` (not committed): `android/liars-dice` (1,933,186 bytes;
third pass 1,911,803), `windows/liars-dice` (3,813,038 bytes; third pass 3,783,254), `pk-liars-dice.js` (433,993 bytes,
the game's MIT banner and portkit's), `liars-dice.jpg`, `liars-dice.snippet.html`, `manifest.json` (checks android PASS,
windows PASS, bindings `ba1dd43fa12436841c6b7677c39e7d3ede94d00f`). The bundles grew by the seven licence texts packed
beside the notices. The kit photo still misses the custom dice shader (kit gap, kept open in portkit GAPS.md);
`playtest/evidence_single_result.jpg` is the better picture of the kit.

## What remains unverified

- **Everything in the app and in a headset (rung 5):** laser clicks on the 2 to 4 cm selectors, the uGUI volume slider
  with a controller, BS Billboard on a kit object in the app, haptics on a real hand, sound levels and the 3D roll-off,
  the flipbook shader on Quest (Vulkan / GLES3), frame time with 51 TextMesh Pro texts, relay traffic per state change.
- **The fourth pass's new screens, in Play mode:** the red X and the "Your dice did not come back with the reload" line
  (a reload on another device), the "Check failed" line (a modified referee) and both withholders out are checked in
  Node only (trust.test.ts); Play mode cannot make a second device or a modified page.
- **In Play mode:** VR input (only the desktop mouse path ran), dragging the volume slider, the sound toggle and ones-wild
  toggle (Node only), ProximityEnable (the tests use `ui-range="0"`), three or four players, a player leaving for good
  and the referee leaving (Node only), forfeits (Node only), two tables in one page (Node only).
