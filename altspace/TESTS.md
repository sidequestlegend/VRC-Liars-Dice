# liars-dice: test evidence

Everything here ran on 2026-11-24 on Windows, Unity 6000.3.21f1, Creator SDK 4.0.29, in the Unity editor. Nothing ran
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

`npm test` in `altspace/ts`, on the kit builder's real `bindings.json`: **21 tests, 21 pass, 0 fail.**

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

Tests 18 to 21 are new with the re-sync to the fixed kit (G6 reload, the seat grace, G7 haptics side, `min-players`).
Every scenario ends with all clients on the same state digest and no error logged.

## Rung 2: the kit in edit mode

`PortKit/Kit/Check` (`Logs/portkit_check.txt`):

```
PASS graphs: the SDK's check found 0 nodes the app will not run
PASS liars-dice bindings: 187 objects resolve by path; hash matches (ba1dd43fa12436841c6b7677c39e7d3ede94d00f)
PASS liars-dice android bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 461/1345, behaviours 434, scripts 12, ...
PASS liars-dice windows bundle: PASS Kind=Pass Reasons=[] Reports=[] Stats=files 1 (format 22), scenes 0, objects 461/1346, behaviours 434, scripts 12, ...
DONE
```

Relay graph: 49 distinct members, all on the SDK allow list of 29,061; no game graphs. Bundles: Android 1,865 KiB,
Windows 3,699 KiB, each with the third-party notices inside.

`PortKit/Liars Dice/Check Licences` (`Logs/liarsdice_licences.txt`): the saved kit prefab's 71 dependencies include no
upstream file that may not ship (Heavitas, the old atlas, the five unsourced sounds, `teeth.png`, the built-in shaders and
materials):

```
PASS 71 dependencies of Assets/Kit/liars-dice.prefab, none of them a file that must not ship
```
