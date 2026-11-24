// Rung 1: several players at the table in the fake room, on virtual time, pressing the buttons a player presses.

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafBudget } from "../portkit/src/index.ts";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import type { TestWorld } from "../portkit/src/testing.ts";
import { FRAME_UNKNOWN, Phase } from "../src/LiarsDiceMaster.ts";
import {
  allDice,
  bid,
  callIt,
  click,
  continueGame,
  count,
  master,
  newWorld,
  plain,
  press,
  seatAll,
  SLUG,
  settle,
  station,
  STEP,
  toAct,
  until,
  waitPhase,
} from "./helpers.ts";

const idOf = (world: TestWorld, c: FakeClient, inst = "0") => world.instance(c, inst).networking.LocalPlayer.playerId;
const seatOfClient = (world: TestWorld, c: FakeClient, inst = "0") => master(world, c, inst).currentPlayers.indexOf(idOf(world, c, inst));

async function startGame(world: TestWorld, players: FakeClient[], inst = "0"): Promise<void> {
  await seatAll(world, players, inst);
  await press(world, players[0]!, 0, "start", inst);
  await waitPhase(world, Phase.Bidding, inst);
}

function checkAgreement(world: TestWorld, inst = "0"): void {
  assert.ok(world.agree(inst), `clients disagree: ${world.digests(inst).join(" ")}`);
  assert.deepEqual(world.problems(), []);
}

test("three players play a full game to a winner; nobody sees another's dice before a challenge", async () => {
  const world = newWorld(11);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  await settle(world);
  await startGame(world, players);
  const m = master(world, players[0]!);
  assert.equal(m.playingPlayer, 0, "the lowest-numbered taken station bids first (F12)");
  assert.deepEqual(m.remaining, [5, 5, 5, 5]);

  let rounds = 0;
  let liars = 0;
  let truths = 0;
  while (master(world, players[0]!).gameStarted) {
    assert.ok(++rounds < 40, "the game does not end");
    const dice = allDice(world, players.filter((p) => seatOfClient(world, p) >= 0));
    // Secrecy: no client can draw anyone else's dice, and no other page knows them.
    for (const viewer of players) {
      const frames = master(world, viewer).DieFrames();
      const label = master(world, viewer).Label();
      for (const [seat, list] of dice) {
        if (seat === seatOfClient(world, viewer)) {
          assert.deepEqual(frames.slice(seat * 5, seat * 5 + list.length).map((f) => f.frame), list, `${viewer.name} sees their own dice`);
          continue;
        }
        for (let k = 0; k < list.length; k++) assert.equal(frames[seat * 5 + k]!.frame, FRAME_UNKNOWN, `${viewer.name} sees "?" on seat ${seat}`);
        const owner = players.find((p) => seatOfClient(world, p) === seat)!;
        assert.equal(world.instance(viewer).secrets.drawOf(owner.sid, label).draw, null, `${viewer.name} cannot compute seat ${seat}'s dice`);
      }
    }
    // Bid one face, then the next player calls it.
    const opener = toAct(world, players);
    const face = rounds % 6;
    const bidder = seatOfClient(world, opener);
    await bid(world, opener, Math.min(1 + (rounds % 3), master(world, opener).CountDiceLeft()), face);
    const caller = toAct(world, players);
    const challenger = seatOfClient(world, caller);
    const before = master(world, players[0]!).remaining.slice();
    const wild = m.onesWild && !m.onesInvalid;
    await callIt(world, caller);
    for (const c of players) {
      const mm = master(world, c);
      assert.equal(mm.resultKind, 0);
      assert.equal(mm.resultSum, count(dice, face, wild), `${c.name}: the count`);
      assert.equal(mm.bidder, bidder);
      assert.ok(mm.integrityOk, `${c.name}: the result matches the reveals`);
    }
    const r = master(world, players[0]!);
    const liar = r.resultMulti > r.resultSum;
    liar ? liars++ : truths++;
    assert.equal(r.resultLoser, liar ? bidder : challenger);
    assert.equal(r.remaining[r.resultLoser], before[r.resultLoser]! - 1);
    assert.match(plain(r.displayText.text), liar ? / is a liar:/ : / is not a liar:/);
    for (const c of players) assert.equal(master(world, c).sounds.at(-1), liar ? "boo" : "cheer");
    checkAgreement(world);
    const presser = players.find((p) => master(world, p).contestPlayers.includes(idOf(world, p)))!;
    await continueGame(world, presser);
  }
  const end = master(world, players[0]!);
  assert.equal(end.numJoinedPlayers, 0);
  assert.deepEqual(end.currentPlayers, [-1, -1, -1, -1], "all seats empty at the end (F42)");
  assert.deepEqual(end.remaining, [5, 5, 5, 5], "dice counts reset at the end (D13)");
  assert.ok(end.lastWinnerName.length > 0);
  for (const c of players) {
    assert.equal(plain(master(world, c).displayText.text), `${end.lastWinnerName} is the Winner`);
    assert.ok(master(world, c).sounds.includes("applause"));
    for (let s = 0; s < 3; s++) assert.equal(c.graph(SLUG).active.get(`p${s + 1}_join`), true, "every station back to Join");
  }
  assert.ok(liars + truths >= 10, `${rounds} rounds`);
  checkAgreement(world);
  console.log(`full game: ${rounds} rounds, ${liars} liars, ${truths} true bids, winner ${end.lastWinnerName}`);
});

test("a challenge: a false bid costs the bidder a die, a true bid costs the challenger; one Continue per result", async () => {
  const world = newWorld(12);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await settle(world);
  await startGame(world, players);
  // False bid: one more than there is.
  let dice = allDice(world, players);
  const ann = toAct(world, players);
  assert.equal(ann, players[0]);
  await bid(world, ann, count(dice, 4, true) + 1, 4);
  await callIt(world, players[1]!);
  let r = master(world, players[1]!);
  assert.equal(r.resultMulti > r.resultSum, true);
  assert.equal(r.resultLoser, 0, "the bidder lost");
  assert.deepEqual(r.remaining.slice(0, 2), [4, 5]);
  assert.match(plain(r.displayText.text), /^Ann is a liar:\n Bid: \d+ X 5 die\n Actual \d+ X 5 die\nAnn losses a dice$/);
  // F33: every die is shown; counting dice tinted.
  for (const f of r.DieFrames().slice(0, 10)) assert.ok(f.frame <= 5 || f.frame === 7);
  // D06: both press Continue in the same tick: one new round, and the loser (Ann) opens it.
  const round = r.round;
  players[0]!.click(SLUG, "0", "p1_continue_sel");
  players[1]!.click(SLUG, "0", "p2_continue_sel");
  await waitPhase(world, Phase.Bidding);
  await world.run(3000);
  r = master(world, players[0]!);
  assert.equal(r.round, round + 1, "two Continue presses start one round");
  assert.equal(r.playingPlayer, 0, "the loser bids first (F39)");

  // True bid: exactly what there is (at least 1).
  dice = allDice(world, players);
  const face = [1, 2, 3, 4, 5, 0].find((f) => count(dice, f, true) > 0)!;
  await bid(world, players[0]!, count(dice, face, true), face);
  await callIt(world, players[1]!);
  r = master(world, players[0]!);
  assert.ok(r.resultMulti <= r.resultSum);
  assert.equal(r.resultLoser, 1, "the challenger lost");
  assert.deepEqual(r.remaining.slice(0, 2), [4, 4]);
  assert.match(plain(r.displayText.text), /^Ann is not a liar:\n.*\nBob losses a dice$/s);
  await continueGame(world, players[1]!);
  assert.equal(master(world, players[0]!).playingPlayer, 1, "the challenger who lost opens the next round");
  checkAgreement(world);
});

test("ones wild on and off, and a bid on ones ends their wildness for the round", async () => {
  const world = newWorld(13);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await settle(world);
  const face = 3; // "4"
  for (const wildOn of [true, false]) {
    if (!wildOn) {
      // The menu toggle, in the lobby, changes it for everyone (F29).
      await click(world, players[1]!, "onesWildButton");
      await until(world, "ones wild off everywhere", () => players.every((p) => master(world, p).onesWild === false));
      for (const p of players) assert.equal(p.graph(SLUG).active.get("onesWildCheck"), false);
    }
    await startGame(world, players);
    // Play rounds until some die shows a one, so that wildness changes the count.
    for (let tries = 0; ; tries++) {
      assert.ok(tries < 8, "no ones in eight rounds");
      const dice = allDice(world, players);
      const opener = toAct(world, players);
      const callerClient = players.find((p) => p !== opener)!;
      if (count(dice, 0, false) > 0 && count(dice, face, false) + 1 <= 10 - [...dice.values()].reduce((n, l) => n + (5 - l.length), 0)) {
        const m = master(world, opener);
        assert.equal(m.displayText.text.includes("Ones are Wild"), wildOn, "the ones line shows only while ones are wild");
        if (wildOn) assert.equal(opener.graph(SLUG).active.get(`p${seatOfClient(world, opener) + 1}_wild`), true, "the wild icon on the face-1 button");
        await bid(world, opener, count(dice, face, false) + 1, face);
        await callIt(world, callerClient);
        const r = master(world, players[0]!);
        assert.equal(r.resultSum, count(dice, face, wildOn));
        assert.equal(r.resultLoser, wildOn ? seatOfClient(world, callerClient) : seatOfClient(world, opener), wildOn ? "ones made the bid true" : "without ones the bid was a lie");
        break;
      }
      // No ones this round: settle it quickly and roll again.
      await bid(world, opener, 1, 5);
      await callIt(world, callerClient);
      await continueGame(world, callerClient);
    }
    if (wildOn) {
      // A bid on ones: wildness ends for the rest of the round (F31), and comes back next round (F32).
      const r0 = master(world, players[0]!);
      const presser = players.find((p) => r0.contestPlayers.includes(idOf(world, p)))!;
      await continueGame(world, presser);
      if (master(world, players[0]!).gameStarted) {
        const dice = allDice(world, players);
        const opener = toAct(world, players);
        await bid(world, opener, 1, 0);
        for (const p of players) {
          assert.equal(master(world, p).onesInvalid, true);
          assert.ok(master(world, p).displayText.text.includes("<s>Ones are Wild</s>"));
        }
        const second = toAct(world, players);
        await bid(world, second, 2, face);
        const third = toAct(world, players);
        await callIt(world, third);
        const r = master(world, players[0]!);
        assert.equal(r.resultWild, false);
        assert.equal(r.resultSum, count(dice, face, false), "ones no longer count");
        const presser2 = players.find((p) => r.contestPlayers.includes(idOf(world, p)))!;
        await continueGame(world, presser2);
        if (r.gameStarted) assert.equal(master(world, players[0]!).onesInvalid, false, "wild again next round");
      }
    }
    // End the game: everyone leaves it through the menu (the last one left wins).
    while (master(world, players[0]!).gameStarted) {
      if (master(world, players[0]!).phase !== Phase.Bidding) {
        const r = master(world, players[0]!);
        if (r.phase === Phase.Result) await continueGame(world, players.find((p) => r.contestPlayers.includes(idOf(world, p)))!);
        else await world.run(STEP);
        continue;
      }
      await click(world, players[1]!, "leaveGameButton");
      await until(world, "the game over", () => !master(world, players[0]!).gameStarted);
    }
  }
  checkAgreement(world);
});

test("players leaving: in the lobby (D04), as the player to act (F45), and down to one player (F46)", async () => {
  const world = newWorld(14);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" }), world.join({ name: "Dan" })];
  await settle(world);
  // Lobby: two seated, one leaves the world: a plain seat release, no winner, no crash.
  await press(world, players[2]!, 2, "join");
  await press(world, players[3]!, 3, "join");
  await until(world, "two seated", () => master(world, players[0]!).numJoinedPlayers === 2);
  world.leave(players[3]!);
  await until(world, "Dan's seat released", () => master(world, players[0]!).numJoinedPlayers === 1, 30000);
  const lobby = master(world, players[0]!);
  assert.equal(lobby.gameStarted, false);
  assert.equal(lobby.lastWinner, -1, "nobody won a game that never started");
  assert.equal(lobby.currentPlayers[2], idOf(world, players[2]!));
  assert.equal(plain(lobby.displayText.text), "Liar's Dice");
  await press(world, players[2]!, 2, "leave");
  await until(world, "Cat stood up", () => master(world, players[0]!).numJoinedPlayers === 0);

  // A game of three; the player to act leaves the world mid-round: the turn passes on, the bid stands.
  const three = players.slice(0, 3);
  await startGame(world, three);
  await bid(world, toAct(world, three), 2, 1);
  const actor = toAct(world, three);
  const actorSeat = seatOfClient(world, actor);
  const rest = three.filter((p) => p !== actor);
  world.leave(actor);
  await until(world, "the turn moves on", () => {
    const m = master(world, rest[0]!);
    return m.numJoinedPlayers === 2 && m.currentPlayers[actorSeat] === -1 && m.playingPlayer !== actorSeat;
  }, 30000);
  let m = master(world, rest[0]!);
  assert.equal(m.currentMulti, 2);
  assert.equal(m.currentDie, 1, "the standing bid stays (F45)");
  assert.equal(m.gameStarted, true);
  assert.equal(m.DieFrames()[actorSeat * 5]!.frame, 8, "the leaver's dice show the logo (F47)");
  // One of the two left takes the "Leave mid Game" button: the other wins.
  await click(world, rest[0]!, "leaveGameButton");
  await until(world, "the game over", () => !master(world, rest[1]!).gameStarted);
  m = master(world, rest[1]!);
  assert.equal(m.lastWinnerName, rest[1]!.name);
  assert.equal(plain(m.displayText.text), `${rest[1]!.name} is the Winner`);
  checkAgreement(world);
});

test("a late joiner sees the table as it is, cannot join a running game, and sees a result without replaying it", async () => {
  const world = newWorld(15);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await settle(world);
  await startGame(world, players);
  await bid(world, toAct(world, players), 3, 4);
  const eve = world.join({ name: "Eve" });
  await settle(world);
  const me = master(world, eve);
  assert.equal(me.gameStarted, true);
  assert.equal(me.currentMulti, 3);
  assert.equal(plain(me.displayText.text), plain(master(world, players[0]!).displayText.text));
  assert.equal(eve.graph(SLUG).active.get("p3_join"), false, "Join hidden during a game (F07)");
  // Pressing it anyway does nothing.
  eve.click(SLUG, "0", "p3_join_sel");
  await world.run(2000);
  assert.equal(master(world, players[0]!).currentPlayers[2], -1);
  checkAgreement(world);
  // The challenge result, then a second late joiner arrives during it (D01).
  await callIt(world, toAct(world, players));
  const fay = world.join({ name: "Fay" });
  await settle(world);
  const mf = master(world, fay);
  assert.equal(mf.phase, Phase.Result);
  assert.equal(plain(mf.displayText.text), plain(master(world, players[0]!).displayText.text), "the result text, not the bidding screen");
  assert.deepEqual(mf.DieFrames(), master(world, players[0]!).DieFrames(), "and the revealed dice");
  assert.deepEqual(mf.sounds, [], "no boo or cheer replayed from the snapshot (D14)");
  assert.equal(world.instance(fay).commands.run, 0);
  checkAgreement(world);
});

test("the referee leaves mid-round: another takes over and the game goes on (F62, D12)", async () => {
  const world = newWorld(16);
  const ref = world.join({ name: "Ref", uid: "user-00" });
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  await settle(world);
  assert.equal(world.instance(ref).networking.IsReferee, true, "the spectator who ranks first is the referee");
  await startGame(world, players);
  const opener = toAct(world, players);
  await bid(world, opener, 1, 2);
  // The spectator referee goes, mid-bidding.
  world.leave(ref);
  await until(world, "a new referee", () => players.some((p) => world.instance(p).networking.IsReferee), 30000);
  const dice = allDice(world, players);
  const second = toAct(world, players);
  await bid(world, second, 2, 2);
  const third = toAct(world, players);
  // The new referee is seated; it leaves during the reveal, and counts as not revealing.
  const newRef = players.find((p) => world.instance(p).networking.IsReferee)!;
  // It will leave before revealing.
  station(world, newRef, seatOfClient(world, newRef)).RevealOwnDice = () => {};
  await press(world, third, seatOfClient(world, third), "callIt");
  await until(world, "revealing or later", () => master(world, players.find((p) => p !== newRef)!).phase >= Phase.Revealing);
  const refSeat = seatOfClient(world, newRef);
  const r0 = master(world, players[0] === newRef ? players[1]! : players[0]!);
  assert.equal(r0.phase, Phase.Revealing, "the referee leaves while dice are being shown");
  const bidderSeat = r0.bidder;
  const challengerSeat = r0.challenger;
  world.leave(newRef);
  const left = players.filter((p) => p !== newRef);
  await until(world, "the result", () => left.every((p) => master(world, p).phase === Phase.Result || !master(world, p).gameStarted), 60000);
  const r = master(world, left[0]!);
  if (r.gameStarted) {
    if (refSeat === bidderSeat) assert.equal(r.resultKind, 1, "the bidder left before revealing: forfeit");
    else if (refSeat === challengerSeat) assert.equal(r.resultKind, 2, "the challenger left before revealing: forfeit");
    else {
      assert.equal(r.resultKind, 0);
      const counted = new Map([...dice].filter(([s]) => s !== refSeat));
      assert.equal(r.resultSum, count(counted, 2, true), "the leaver's dice do not count");
    }
    assert.equal(r.currentPlayers[refSeat], -1);
  }
  assert.ok(left.some((p) => world.instance(p).networking.IsReferee));
  checkAgreement(world);
});

test("a cheating client that changes its secret after the referee's number is rejected and forfeits", async () => {
  const world = newWorld(17);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  await settle(world);
  await startGame(world, players);
  const label = master(world, players[0]!).Label();
  const cheat = toAct(world, players); // Ann bids first and then cheats
  const before = allDice(world, players);
  // The cheat does not like the dice: a new secret under the same label, hoping for a new number.
  world.instance(cheat).secrets.beginDraw(label);
  await world.run(2000);
  for (const c of players) assert.equal(world.instance(c).secrets.drawOf(cheat.sid, label).state, "rejected", `${c.name} sees the swap`);
  await bid(world, cheat, 2, 3);
  const caller = toAct(world, players);
  await callIt(world, caller);
  const r = master(world, players[1]!);
  assert.equal(r.resultKind, 1, "the bidder's reveal does not match the pinned commitment");
  assert.equal(r.resultLoser, 0, "the cheat (seat 0) is the one who loses");
  assert.equal(r.currentPlayers[0], -1, "the cheat is out of the game");
  assert.equal(r.remaining[1], 5, "the challenger lost nothing");
  assert.equal(r.remaining[2], 5, "nobody else lost anything");
  assert.ok(r.DieFrames().slice(0, 5).every((f) => f.frame === FRAME_UNKNOWN), "the cheat's dice are never shown");
  assert.deepEqual(r.DieFrames().slice(5, 10).map((f) => f.frame), before.get(1), "the honest dice are");
  assert.match(plain(r.displayText.text), /^Ann did not show their dice:/);
  await continueGame(world, caller);
  assert.equal(master(world, players[1]!).playingPlayer, seatOfClient(world, caller), "the challenger bids next");
  checkAgreement(world);
});

test("a player who does not reveal in time forfeits; one who does not roll in time is removed", async () => {
  const world = newWorld(18);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  await settle(world);
  await startGame(world, players);
  const opener = toAct(world, players);
  await bid(world, opener, 1, 1);
  const silent = toAct(world, players); // the challenger will not reveal
  const silentSeat = seatOfClient(world, silent);
  station(world, silent, silentSeat).RevealOwnDice = () => {};
  const label = master(world, players[0]!).Label();
  await press(world, silent, silentSeat, "callIt");
  await waitPhase(world, Phase.Revealing);
  await world.run(10000);
  assert.equal(master(world, opener).phase, Phase.Revealing, "still waiting before the 15 s deadline");
  await waitPhase(world, Phase.Result, "0", 20000);
  await world.run(2000);
  for (const c of players) assert.equal(world.instance(c).secrets.drawOf(silent.sid, label).state, "forfeit", `${c.name} sees the forfeit`);
  const r = master(world, players[0]!);
  assert.equal(r.resultKind, 2);
  assert.equal(r.currentPlayers[silentSeat], -1);
  assert.equal(r.remaining[seatOfClient(world, opener)], 5, "the bidder lost nothing");
  // Next round: Cat (or whoever is left) never rolls and is removed at the commit deadline.
  const two = players.filter((p) => p !== silent);
  const lazy = two.find((p) => p !== opener)!;
  station(world, lazy, seatOfClient(world, lazy)).RollOwnDice = () => {};
  await press(world, opener, r.contestPlayers.indexOf(idOf(world, opener)), "continue");
  await waitPhase(world, Phase.Rolling);
  await until(world, "the game over", () => !master(world, opener).gameStarted, 30000);
  assert.equal(master(world, opener).lastWinnerName, opener.name, "the only player who rolled wins");
  await world.run(3000);
  checkAgreement(world);
});

test("two players cannot take one station, and one player cannot take two (F05, F06)", async () => {
  const world = newWorld(19);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await settle(world);
  players[0]!.click(SLUG, "0", "p1_join_sel");
  players[1]!.click(SLUG, "0", "p1_join_sel");
  await world.run(3000);
  const m = master(world, players[0]!);
  assert.equal(m.numJoinedPlayers, 1);
  await press(world, players[0]!, 1, "join");
  await world.run(2000);
  assert.equal(master(world, players[0]!).numJoinedPlayers, 1, "a second seat for the same player is refused");
  checkAgreement(world);
});

test("two tables in one room stay separate", async () => {
  const world = newWorld(20);
  const elements = [{ room: "north" }, { room: "south" }];
  const players = [world.join({ name: "Ann", elements }), world.join({ name: "Bob", elements }), world.join({ name: "Cat", elements }), world.join({ name: "Dan", elements })];
  await settle(world, "north");
  await settle(world, "south");
  const north = players.slice(0, 2);
  const south = players.slice(2, 4);
  await startGame(world, north, "north");
  await startGame(world, south, "south");
  for (const c of players) {
    assert.equal(master(world, c, "north").numJoinedPlayers, 2);
    assert.equal(master(world, c, "south").numJoinedPlayers, 2);
    assert.notDeepEqual(master(world, c, "north").currentPlayers, master(world, c, "south").currentPlayers.map(() => -1));
  }
  await bid(world, toAct(world, north, "north"), 2, 3, "north");
  assert.equal(master(world, players[0]!, "south").currentDie, -1, "a bid at north is not a bid at south");
  await callIt(world, toAct(world, north, "north"), "north");
  assert.equal(master(world, players[3]!, "south").phase, Phase.Bidding);
  assert.equal(master(world, players[3]!, "north").phase, Phase.Result);
  const keys = world.room.stateKeys("pk1.");
  assert.ok(keys.every((k) => k.startsWith("pk1.liars-dice.north.") || k.startsWith("pk1.liars-dice.south.")), keys.join(" "));
  assert.ok(keys.some((k) => k.startsWith("pk1.liars-dice.north.")) && keys.some((k) => k.startsWith("pk1.liars-dice.south.")));
  assert.notEqual(master(world, players[0]!, "north").gameId, master(world, players[0]!, "south").gameId);
  checkAgreement(world, "north");
  checkAgreement(world, "south");
});

test("the rules button cycles the rule lines locally, and the game's state fits the room's budget", async () => {
  const world = newWorld(21);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await settle(world);
  const lines: string[] = [];
  for (let i = 0; i < 11; i++) {
    await press(world, players[0]!, 2, "rules", "0", 100);
    lines.push(master(world, players[0]!).rulesText.text);
  }
  assert.equal(lines[0], "To begin each round, all players roll their dice simultaneously.");
  assert.equal(lines[8], "The winner of the game is the last player to have any dice remaining.");
  assert.equal(lines[9], "", "then blank");
  assert.equal(lines[10], lines[0], "then round again");
  assert.equal(master(world, players[1]!).rulesText.text, "", "only for the player who pressed (F51)");

  const budget = leafBudget(world.bindings, (type) => {
    const cls = world.game.behaviours[type];
    return cls ? { synced: (cls.synced ?? []).length, perPlayer: cls.perPlayer === true } : null;
  });
  assert.ok(budget.spaceLeaves <= 10, `this game uses ${budget.spaceLeaves} space-state leaves per copy`);
  assert.ok(budget.userLeavesPerPlayer <= 6);
});

test("a seated player reloads their page mid-round: the same seat and the same dice come back, and they count at the challenge", async () => {
  const world = newWorld(22);
  let players = [world.join({ name: "Ann", uid: "user-a" }), world.join({ name: "Bob", uid: "user-b" }), world.join({ name: "Cat", uid: "user-c" })];
  await settle(world);
  await startGame(world, players);
  await bid(world, toAct(world, players), 1, 2);
  // Someone seated who is not the referee reloads their page while bidding goes on: a new session (and player id) of
  // the same user, on the same device, which saved the round's draw.
  const reloader = players.find((p) => !world.instance(p).networking.IsReferee && p !== toAct(world, players))!;
  const seat = seatOfClient(world, reloader);
  const dice = allDice(world, players).get(seat)!;
  const oldId = idOf(world, reloader);
  world.leave(reloader);
  const rest = players.filter((p) => p !== reloader);
  await world.run(1500);
  assert.equal(master(world, rest[0]!).currentPlayers[seat], oldId, "the seat is held while the player may be reloading");
  const again = world.join({ name: reloader.name, uid: reloader.uid });
  await settle(world);
  await until(world, "the seat moves to the reloaded page", () => rest.concat(again).every((p) => master(world, p).currentPlayers[seat] === idOf(world, again)), 30000);
  players = players.map((p) => (p === reloader ? again : p));
  assert.notEqual(idOf(world, again), oldId, "a reload is a new player id");
  assert.equal(master(world, again).phase, Phase.Bidding, "the round goes on");
  assert.deepEqual(master(world, again).MyDice(seat), dice, "the same dice come back on the reloaded page");
  assert.deepEqual(master(world, again).DieFrames().slice(seat * 5, seat * 5 + dice.length).map((f) => f.frame), dice, "and are drawn there");
  for (const p of rest) assert.ok(master(world, p).DieFrames().slice(seat * 5, seat * 5 + dice.length).every((f) => f.frame === FRAME_UNKNOWN), `${p.name} still sees "?"`);
  // Play on: a bid, a challenge; the reloaded player's dice are revealed from the restored secret and counted.
  const all = allDice(world, players);
  assert.deepEqual(all.get(seat), dice);
  const second = toAct(world, players);
  await bid(world, second, 2, 2);
  await callIt(world, toAct(world, players));
  const r = master(world, players[0]!);
  assert.equal(r.resultKind, 0, "everyone revealed, the reloaded player included");
  assert.equal(r.resultSum, count(all, 2, true));
  assert.deepEqual(r.DieFrames().slice(seat * 5, seat * 5 + dice.length).map((f) => f.frame), dice, "their dice are shown to all");
  checkAgreement(world);
});

test("a player who leaves mid-game and does not come back loses the seat after rejoin-grace", async () => {
  const world = newWorld(23);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  await settle(world);
  await startGame(world, players);
  const leaver = players.find((p) => !world.instance(p).networking.IsReferee && p !== toAct(world, players))!;
  const seat = seatOfClient(world, leaver);
  world.leave(leaver);
  const rest = players.filter((p) => p !== leaver);
  await world.run(15000);
  assert.notEqual(master(world, rest[0]!).currentPlayers[seat], -1, "held for 20 s (the default)");
  await until(world, "the seat freed", () => rest.every((p) => master(world, p).currentPlayers[seat] === -1), 15000);
  assert.equal(master(world, rest[0]!).numJoinedPlayers, 2);
  checkAgreement(world);
});

test("a button's buzz goes to the hand that clicked; both hands when the runtime cannot tell", async () => {
  const world = newWorld(24);
  const [ann] = [world.join({ name: "Ann" }), world.join({ name: "Bob" })];
  await settle(world);
  ann!.haptics.length = 0;
  await press(world, ann!, 0, "rules");
  assert.deepEqual([...new Set(ann!.haptics.map((h) => h.side))].sort(), [0, 1], "no hand known (desktop): both");
  ann!.haptics.length = 0;
  ann!.input({ type: "button", button: 0, side: 0, pressed: true });
  await world.run(50);
  await press(world, ann!, 0, "rules");
  assert.ok(ann!.haptics.length >= 2, "push and release");
  assert.deepEqual([...new Set(ann!.haptics.map((h) => h.side))], [0], "the left hand pulled the trigger: only the left buzzes");
});
