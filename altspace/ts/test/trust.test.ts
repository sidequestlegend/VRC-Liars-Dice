// Rung 1, the review's findings (REVIEW-FINDINGS.md, liars-dice): reloads and the fair draw, players who withhold their
// dice, the clients' own check of the referee's result, and what travels before a challenge.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import { Draw } from "../portkit/src/secrets.ts";
import { sha256, toHex } from "../portkit/src/sha256.ts";
import type { TestWorld } from "../portkit/src/testing.ts";
import { utf8Encode } from "../portkit/src/util.ts";
import { FRAME_LOST, FRAME_UNKNOWN, Phase, type LiarsDiceMaster } from "../src/LiarsDiceMaster.ts";
import { allDice, bid, callIt, continueGame, count, master, newWorld, plain, press, seatAll, settle, station, toAct, until, waitPhase } from "./helpers.ts";

const idOf = (world: TestWorld, c: FakeClient) => world.instance(c).networking.LocalPlayer.playerId;
const seatOf = (world: TestWorld, c: FakeClient) => master(world, c).currentPlayers.indexOf(idOf(world, c));
const isRef = (world: TestWorld, c: FakeClient) => world.instance(c).networking.IsReferee;

async function startGame(world: TestWorld, players: FakeClient[]): Promise<void> {
  await seatAll(world, players);
  await press(world, players[0]!, 0, "start");
  await waitPhase(world, Phase.Bidding);
}

async function threePlayers(seed: number): Promise<{ world: TestWorld; players: FakeClient[] }> {
  const world = newWorld(seed);
  const players = [world.join({ name: "Ann", uid: "user-a" }), world.join({ name: "Bob", uid: "user-b" }), world.join({ name: "Cat", uid: "user-c" })];
  await settle(world);
  await startGame(world, players);
  return { world, players };
}

/** A player reloads their page: leaves, and the same user opens it again (on the same device unless `device` is given). */
async function reload(world: TestWorld, who: FakeClient, device?: string): Promise<FakeClient> {
  world.leave(who);
  await world.run(800);
  const again = world.join({ name: who.name, uid: who.uid, device: device ?? who.uid });
  await world.room.runUntil(() => world.started(again), 20000);
  return again;
}

const frames = (m: LiarsDiceMaster, seat: number, n = 5) => m.DieFrames().slice(seat * 5, seat * 5 + n).map((f) => f.frame);

// ---- finding 2: the kit's reload rules (portkit 30881dd) -------------------------------------------------------------

test("a player who reloads while the dice are being rolled rolls as soon as the page is back (no 3 s wait)", async () => {
  const { world, players } = await threePlayers(41);
  await bid(world, toAct(world, players), 1, 2);
  await callIt(world, toAct(world, players));
  // During the result a seated player who is not the referee reloads; another presses Continue while they are away,
  // so the rolling phase opens without them (the seat is held for rejoin-grace).
  const r = master(world, players[0]!);
  const reloader = players.find((p) => !isRef(world, p) && r.currentPlayers.includes(idOf(world, p)))!;
  const seat = seatOf(world, reloader);
  const presser = players.find((p) => p !== reloader && r.contestPlayers.includes(idOf(world, p)))!;
  world.leave(reloader);
  await press(world, presser, r.contestPlayers.indexOf(idOf(world, presser)), "continue");
  await waitPhase(world, Phase.Rolling);
  const again = world.join({ name: reloader.name, uid: reloader.uid, device: reloader.uid });
  await world.room.runUntil(() => world.started(again), 20000);
  const startedAt = world.room.clockSeconds();
  const label = master(world, again).Label();
  await until(world, "the reloaded page's draw is numbered", () => world.instance(again).secrets.drawOf(again.sid, label).state === "numbered", 10000);
  const took = world.room.clockSeconds() - startedAt;
  assert.ok(took < 2, `the reloaded page rolled ${took.toFixed(2)} s after it started (the old 3 s wait is gone)`);
  const players2 = players.map((p) => (p === reloader ? again : p));
  await waitPhase(world, Phase.Bidding);
  assert.equal(master(world, again).currentPlayers[seat], idOf(world, again), "the seat moved to the reloaded page");
  assert.ok(master(world, again).MyDice(seat), "and it knows its dice");
  assert.ok(world.agree());
  void players2;
});

test("the referee reloads its page mid-round on the same device: its seat and dice come back, and they count", async () => {
  const { world, players } = await threePlayers(42);
  await bid(world, toAct(world, players), 1, 2);
  const ref = players.find((p) => isRef(world, p) && p !== toAct(world, players));
  assert.ok(ref, "the referee is seated and not the player to act (seed 42)");
  const seat = seatOf(world, ref);
  const dice = allDice(world, players).get(seat)!;
  const again = await reload(world, ref);
  const players2 = players.map((p) => (p === ref ? again : p));
  await until(world, "the seat moves to the reloaded page", () => players2.every((p) => master(world, p).currentPlayers[seat] === idOf(world, again)), 30000);
  await until(world, "the reloaded referee's dice come back", () => master(world, again).MyDice(seat) !== null, 10000);
  assert.deepEqual(master(world, again).MyDice(seat), dice, "the same dice");
  assert.equal(master(world, again).MyDiceLost(seat), false);
  const all = allDice(world, players2);
  await bid(world, toAct(world, players2), 2, 2);
  await callIt(world, toAct(world, players2));
  const r = master(world, players2.find((p) => p !== again)!);
  assert.equal(r.resultKind, 0, "everyone revealed, the reloaded referee included");
  assert.equal(r.resultOut[seat], false);
  assert.equal(r.resultSum, count(all, 2, true));
  assert.deepEqual(frames(r, seat, dice.length), dice, "its dice are shown to all");
  for (const p of players2) assert.equal(master(world, p).integrity, "ok", `${p.name}: the check passes`);
  assert.ok(world.agree());
  assert.deepEqual(world.problems(), []);
});

test("a player whose dice cannot come back (a reload on another device) is told so at once, and is out at the challenge", async () => {
  const { world, players } = await threePlayers(43);
  await bid(world, toAct(world, players), 1, 2);
  const actor = toAct(world, players);
  const reloader = players.find((p) => !isRef(world, p) && p !== actor)!;
  const seat = seatOf(world, reloader);
  const again = await reload(world, reloader, "another-device");
  const players2 = players.map((p) => (p === reloader ? again : p));
  await until(world, "the seat moves to the reloaded page", () => players2.every((p) => master(world, p).currentPlayers[seat] === idOf(world, again)), 30000);
  await world.run(1500);
  const mine = master(world, again);
  assert.equal(mine.MyDice(seat), null, "the secret stayed on the other device");
  assert.equal(mine.MyDiceLost(seat), true);
  assert.deepEqual(frames(mine, seat), [FRAME_LOST, FRAME_LOST, FRAME_LOST, FRAME_LOST, FRAME_LOST], "its own dice show the red X");
  assert.match(plain(mine.displayText.text), /Your dice did not come back with the reload/, "the page says why");
  for (const p of players2.filter((q) => q !== again)) assert.doesNotMatch(plain(master(world, p).displayText.text), /did not come back/, `${p.name}: not on other pages`);
  // A modified page that commits a new secret under the same label (a re-roll) is refused: rejected everywhere, red X everywhere.
  world.instance(again).secrets.beginDraw(mine.Label());
  await world.run(1500);
  for (const p of players2) {
    assert.equal(world.instance(p).secrets.drawOf(again.sid, mine.Label()).state, "rejected", `${p.name}: the re-roll is refused`);
    assert.deepEqual(frames(master(world, p), seat), [FRAME_LOST, FRAME_LOST, FRAME_LOST, FRAME_LOST, FRAME_LOST], `${p.name}: the void dice show the red X`);
  }
  await callIt(world, actor);
  const r = master(world, players2[0]!);
  assert.equal(r.resultOut[seat], true, "out at the challenge");
  assert.match(plain(r.displayText.text), new RegExp(`${reloader.name}( did not show their dice|.*eliminated)`));
});

// ---- finding 3: both sides of a challenge withhold ---------------------------------------------------------------------

test("the bidder and the challenger both withhold their dice: both are out, nobody else loses a die", async () => {
  const { world, players } = await threePlayers(44);
  const bidder = toAct(world, players);
  await bid(world, bidder, 1, 2);
  const challenger = toAct(world, players);
  const bs = seatOf(world, bidder);
  const cs = seatOf(world, challenger);
  for (const c of [bidder, challenger]) station(world, c, seatOf(world, c)).RevealOwnDice = () => {};
  const third = players.find((p) => p !== bidder && p !== challenger)!;
  const ts = seatOf(world, third);
  await callIt(world, challenger);
  const r = master(world, third);
  assert.equal(r.resultKind, 1, "the bidder did not show: their forfeit is the result");
  assert.equal(r.resultOut[bs], true);
  assert.equal(r.resultOut[cs], true, "the challenger who withheld does not escape");
  assert.equal(r.currentPlayers[bs], -1);
  assert.equal(r.currentPlayers[cs], -1, "the challenger is out of the game too");
  assert.equal(r.remaining[ts], 5, "the third player lost nothing");
  const text = plain(r.displayText.text);
  assert.match(text, new RegExp(`^${bidder.name} did not show their dice:`));
  assert.match(text, new RegExp(`${challenger.name} did not show their dice and has been eliminated`));
  assert.equal(r.integrity, "ok");
  await continueGame(world, third);
  assert.equal(master(world, third).gameStarted, false, "one player left: the game is over");
  assert.equal(master(world, third).lastWinnerName, third.name);
  assert.ok(world.agree());
});

// ---- finding 4: every page checks the referee's result, from what it saw itself, and says so ---------------------------

/** Makes `ref`'s page a referee that changes the result it writes, after judging honestly. */
function tamper(world: TestWorld, ref: FakeClient, change: (m: LiarsDiceMaster) => void): void {
  const m = master(world, ref);
  const honest = m._ResolveContest.bind(m);
  m._ResolveContest = () => {
    honest();
    if (m.phase !== Phase.Result) return;
    change(m);
    m.RequestSerialization();
    m.AllDeserialization();
  };
}

test("a referee that marks a live die lost is caught by every other page, which says so on its display", async () => {
  const { world, players } = await threePlayers(45);
  const ref = players.find((p) => isRef(world, p))!;
  const victim = players.find((p) => p !== ref)!;
  const vs = seatOf(world, victim);
  const dice = allDice(world, players);
  // The referee hides the victim's last die (as if they had one die fewer) and keeps its own count consistent with that.
  tamper(world, ref, (m) => {
    const k = vs * 5 + dice.get(vs)!.length - 1;
    const v = m.dieValues[k]!;
    if (v === m.resultDie || (m.resultWild && v === 0)) m.resultSum--;
    m.dieValues[k] = FRAME_LOST;
  });
  await bid(world, toAct(world, players), 1, 2);
  await callIt(world, toAct(world, players));
  await world.run(1000);
  for (const p of players.filter((q) => q !== ref)) {
    const m = master(world, p);
    assert.equal(m.integrity, "failed", `${p.name}: the die count is the one this page saw, not the referee's`);
    assert.equal(m.integrityOk, false);
    assert.match(plain(m.displayText.text), /Check failed: this result does not match the dice shown/, `${p.name}: the page says so`);
  }
});

test("a modified referee that grinds its own number is rejected, and if it counts its dice anyway every page says so", async () => {
  const world = newWorld(46);
  const players = [world.join({ name: "Ann", uid: "user-a" }), world.join({ name: "Bob", uid: "user-b" }), world.join({ name: "Cat", uid: "user-c" })];
  await settle(world);
  const ref = players.find((p) => isRef(world, p))!;
  // The review's probe: after the runtime's own officiate, the referee replaces the number of its own draw with one it
  // searched for (five 1s).
  const S = world.instance(ref).secrets as any;
  const officiate = S.officiate.bind(S);
  let ground: { label: string; secret: string; number: string } | null = null;
  S.officiate = () => {
    officiate();
    const me = S.core.me.sid;
    const table = S.numbers.working();
    const e = table[me];
    if (e && S.mySecret && e[0] === S.mySecret.label && ground?.label !== e[0]) {
      for (let n = 0; n < 200000; n++) {
        const num = "g" + n;
        const d = new Draw(toHex(sha256(utf8Encode(`${S.mySecret.secret}\n${num}\n${e[0]}`)))).Ints(5, 6);
        if (d.every((v: number) => v === 0)) {
          e[2] = num;
          table[me] = e;
          S.numbers.write(table);
          ground = { label: e[0], secret: S.mySecret.secret, number: num };
          break;
        }
      }
    }
  };
  // And its rules count its own dice whatever the runtime says (the honest code would count it out).
  const m = master(world, ref);
  const checked = (m as any).CheckedDraw.bind(m);
  (m as any).CheckedDraw = (seat: number, label: string) => {
    if (m.currentPlayers[seat] === idOf(world, ref) && ground && ground.label === label) {
      return new Draw(toHex(sha256(utf8Encode(`${ground.secret}\n${ground.number}\n${label}`))));
    }
    return checked(seat, label);
  };
  await seatAll(world, players);
  await press(world, players[0]!, 0, "start");
  await until(world, "bidding on the honest pages", () => players.filter((p) => p !== ref).every((p) => master(world, p).phase === Phase.Bidding), 20000);
  await world.run(1500);
  const rs = seatOf(world, ref);
  for (const p of players.filter((q) => q !== ref)) {
    assert.equal(world.instance(p).secrets.drawOf(ref.sid, master(world, p).Label()).state, "rejected", `${p.name}: the ground number is not believed`);
    assert.deepEqual(frames(master(world, p), rs), [FRAME_LOST, FRAME_LOST, FRAME_LOST, FRAME_LOST, FRAME_LOST], `${p.name}: and its dice show as void`);
  }
  await bid(world, toAct(world, players), 1, 1);
  await callIt(world, toAct(world, players));
  await world.run(1000);
  const honest = players.filter((q) => q !== ref);
  const r = master(world, honest[0]!);
  assert.equal(r.resultOut[rs], false, "the modified referee counted its own dice");
  assert.deepEqual(r.dieValues.slice(rs * 5, rs * 5 + 5), [0, 0, 0, 0, 0], "five 1s");
  for (const p of honest) {
    assert.equal(master(world, p).integrity, "failed", `${p.name}: a rejected draw was counted`);
    assert.match(plain(master(world, p).displayText.text), /Check failed/);
  }
});

test("on honest games every page's check passes, and a late arrival that saw no bidding checks what it can", async () => {
  const { world, players } = await threePlayers(47);
  await bid(world, toAct(world, players), 2, 3);
  await callIt(world, toAct(world, players));
  const late = world.join({ name: "Eve" });
  await settle(world);
  await world.run(6000);
  for (const p of players) assert.equal(master(world, p).integrity, "ok", `${p.name}`);
  assert.notEqual(master(world, late).integrity, "failed", "the late arrival does not cry wolf");
  assert.doesNotMatch(plain(master(world, late).displayText.text), /Check failed/);
  assert.deepEqual(world.problems(), []);
});

// ---- finding 5: nothing about a player's dice travels before the challenge --------------------------------------------

interface Watch {
  traffic: string[];
  /** Every moment before the challenge where some page held dice it should not, or a reveal was already published. */
  breaches: string[];
  stop(): void;
}

/**
 * Records every message a page sends the room (space-state batches, user-state writes, one-shots), and on every tick
 * looks at every page while a round is rolling or bidding: `dieValues` must be all -1, no player's user state may hold
 * a reveal (`fr`), and no page may be able to compute another player's draw.
 */
function watch(world: TestWorld, players: () => FakeClient[]): Watch {
  const room = world.room as any;
  const traffic: string[] = [];
  const breaches: string[] = [];
  const os = room.serverOneShot.bind(room);
  const sb = room.serverStateBatch.bind(room);
  const us = room.serverUserSet.bind(room);
  room.serverOneShot = (s: any, d: string) => (traffic.push(String(d)), os(s, d));
  room.serverStateBatch = (s: any, sc: any, ops: any, a: any, r: any) => (traffic.push(JSON.stringify(ops)), sb(s, sc, ops, a, r));
  room.serverUserSet = (s: any, p: string, v: unknown, r: any) => (traffic.push(p + "=" + JSON.stringify(v)), us(s, p, v, r));
  let on = true;
  const tick = () => {
    if (!on) return;
    for (const c of players()) {
      if (!world.started(c)) continue;
      const m = master(world, c);
      if (m.phase !== Phase.Rolling && m.phase !== Phase.Bidding) continue;
      if (m.dieValues.some((v) => v !== -1)) breaches.push(`${c.name} holds dieValues ${JSON.stringify(m.dieValues)} in phase ${m.phase}`);
      for (const other of players()) {
        if (!world.started(other)) continue;
        if (revealIn(room.userStateOf(other.sid))) breaches.push(`${other.name}'s user state holds a reveal in phase ${m.phase}`);
        if (other !== c && world.instance(c).secrets.drawOf(other.sid, m.Label()).draw) breaches.push(`${c.name} can compute ${other.name}'s draw in phase ${m.phase}`);
      }
    }
    room.schedule(50, tick);
  };
  room.schedule(50, tick);
  return {
    traffic,
    breaches,
    stop: () => {
      on = false;
      room.serverOneShot = os;
      room.serverStateBatch = sb;
      room.serverUserSet = us;
    },
  };
}

/** Whether a player's user state (as the room holds it) carries a fair-draw reveal (`x.fr` of the runtime's record). */
function revealIn(user: Record<string, unknown>): boolean {
  for (const value of Object.values(user)) {
    let record: unknown = value;
    if (typeof value === "string") {
      try {
        record = JSON.parse(value);
      } catch {
        continue;
      }
    }
    const x = (record as { x?: Record<string, unknown> } | null)?.x;
    if (x && x.fr !== undefined) return true;
  }
  return false;
}

async function threeBids(world: TestWorld, players: FakeClient[]): Promise<void> {
  for (let r = 0; r < 3; r++) await bid(world, toAct(world, players), 1 + r, 2);
}

function secretsIn(world: TestWorld, players: FakeClient[], w: Watch): string[] {
  const all = w.traffic.join("\n");
  const out: string[] = [];
  for (const p of players) {
    const s = world.instance(p).secrets as any;
    const label = master(world, p).Label();
    if (s.mySecret && all.includes(s.mySecret.secret)) out.push(`${p.name}'s secret`);
    const draw = world.instance(p).secrets.myDraw(label);
    if (draw && all.includes(String(draw))) out.push(`${p.name}'s draw seed`);
  }
  return out;
}

test("secrecy: before the challenge no secret, draw seed, die value or reveal is in any message or on any other page", async () => {
  const world = newWorld(48);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  const w = watch(world, () => players);
  await settle(world);
  await startGame(world, players);
  await threeBids(world, players);
  assert.deepEqual(secretsIn(world, players, w), [], "no secret or seed in the traffic");
  assert.deepEqual(w.breaches, [], "no die value, reveal or computable draw before the challenge");
  assert.ok(w.traffic.length > 20, `${w.traffic.length} messages watched`);
  // After the challenge the reveals are public: the watch sees them, so it is looking at the right places.
  await callIt(world, toAct(world, players));
  w.stop();
  assert.notDeepEqual(secretsIn(world, players, w), [], "the reveals travel after the challenge");
});

test("secrecy watch: a page that publishes its reveal during the bidding is caught", async () => {
  const world = newWorld(49);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  const w = watch(world, () => players);
  await settle(world);
  await startGame(world, players);
  const leaky = players[1]!;
  world.instance(leaky).secrets.revealDraw(master(world, leaky).Label());
  await threeBids(world, players);
  w.stop();
  assert.ok(secretsIn(world, players, w).includes("Bob's secret"), "the secret is seen in the traffic");
  assert.ok(w.breaches.some((b) => b.includes("Bob's user state holds a reveal")), "the reveal is seen in user state");
  assert.ok(w.breaches.some((b) => b.includes("can compute Bob's draw")), "and other pages can compute the draw");
});

test("secrecy watch: a referee that writes a die into dieValues during the bidding is caught", async () => {
  const world = newWorld(50);
  const players = [world.join({ name: "Ann" }), world.join({ name: "Bob" }), world.join({ name: "Cat" })];
  const w = watch(world, () => players);
  await settle(world);
  await startGame(world, players);
  const ref = players.find((p) => isRef(world, p))!;
  const m = master(world, ref);
  const seat = seatOf(world, ref);
  m.dieValues[seat * 5] = m.MyDice(seat)![0]!;
  m.RequestSerialization();
  await threeBids(world, players);
  w.stop();
  assert.ok(w.breaches.some((b) => b.includes("holds dieValues")), w.breaches.slice(0, 3).join(" | "));
  void FRAME_UNKNOWN;
});
