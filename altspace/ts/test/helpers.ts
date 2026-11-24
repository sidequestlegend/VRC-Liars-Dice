// Test helpers: players at a liar's dice table in the fake room, pressing the station buttons as a player does
// (a click on the button's selector), and reading the table back.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FakeClient } from "../portkit/src/platform/fake.ts";
import { TestWorld } from "../portkit/src/testing.ts";
import game from "../src/index.ts";
import { Phase, type LiarsDiceMaster } from "../src/LiarsDiceMaster.ts";
import type { PlayerHandle } from "../src/PlayerHandle.ts";

export const bindings = JSON.parse(readFileSync(fileURLToPath(new URL("../bindings.json", import.meta.url)), "utf8"));
export const SLUG = game.slug;
export const FACES = ["one", "two", "three", "four", "five", "six"];
/** Time given to every press: a round trip through the fake room and the 0.5 s button lockout, and some. */
export const STEP = 700;

export function newWorld(seed = 1): TestWorld {
  return new TestWorld(game, bindings, { seed });
}

export const master = (world: TestWorld, c: FakeClient, inst = "0") => world.behaviour<LiarsDiceMaster>(c, "master", inst);
export const station = (world: TestWorld, c: FakeClient, seat: number, inst = "0") => world.behaviour<PlayerHandle>(c, `p${seat + 1}`, inst);

/** Everyone has started and agrees on a referee. */
export async function settle(world: TestWorld, inst = "0"): Promise<void> {
  await world.settle(inst);
  await world.run(2500);
}

/** Clicks a station button's selector (`button` is join, leave, start, continue, rules, submit, callIt, one..six, plus, minus). */
export async function press(world: TestWorld, c: FakeClient, seat: number, button: string, inst = "0", wait = STEP): Promise<void> {
  assert.ok(c.click(SLUG, inst, `p${seat + 1}_${button}_sel`), `${c.name}: cannot click ${button} of station ${seat + 1}`);
  await world.run(wait);
}

export async function click(world: TestWorld, c: FakeClient, key: string, inst = "0"): Promise<void> {
  assert.ok(c.click(SLUG, inst, key), `${c.name}: cannot click ${key}`);
  await world.run(STEP);
}

export async function until(world: TestWorld, what: string, done: () => boolean, maxMs = 20000): Promise<void> {
  if (await world.room.runUntil(done, maxMs)) return;
  throw new Error(`timed out waiting for ${what}`);
}

/** The players take stations 0, 1, 2 ... in order. */
export async function seatAll(world: TestWorld, players: FakeClient[], inst = "0"): Promise<void> {
  for (let i = 0; i < players.length; i++) await press(world, players[i]!, i, "join", inst);
  await until(world, "every seat taken", () => master(world, players[0]!, inst).numJoinedPlayers === players.length);
}

/**
 * Every page is in `phase`. For bidding, also every seated page has its own dice: the referee opens the bidding once its
 * own copy of its number table is complete, and that table (the referee's user state) can reach a page a tick after the
 * phase (space state) does; until then the page shows "?" on its own dice.
 */
export async function waitPhase(world: TestWorld, phase: number, inst = "0", maxMs = 20000): Promise<void> {
  const pages = () => world.clients.filter((c) => world.started(c, inst));
  await until(world, `phase ${phase}`, () => pages().every((c) => master(world, c, inst).phase === phase && !(phase === Phase.Bidding && seatedWithoutDice(world, c, inst))), maxMs);
}

/** A seated page that does not know its own dice (yet). */
export function seatedWithoutDice(world: TestWorld, c: FakeClient, inst = "0"): boolean {
  const m = master(world, c, inst);
  const seat = m.currentPlayers.indexOf(world.instance(c, inst).networking.LocalPlayer.playerId);
  return seat >= 0 && m.MyDice(seat) === null;
}

/** Seated players and their seats, from one client's view. */
export function seatOf(world: TestWorld, players: FakeClient[], c: FakeClient, inst = "0"): number {
  const m = master(world, players[0]!, inst);
  return m.currentPlayers.indexOf(world.instance(c, inst).networking.LocalPlayer.playerId);
}

/** The client of the player to act. */
export function toAct(world: TestWorld, players: FakeClient[], inst = "0"): FakeClient {
  const m = master(world, players[0]!, inst);
  const id = m.currentPlayers[m.playingPlayer];
  const c = players.find((p) => world.started(p, inst) && world.instance(p, inst).networking.LocalPlayer.playerId === id);
  assert.ok(c, `nobody holds the seat to act (${m.playingPlayer})`);
  return c;
}

/** Every seated player's own dice, each read on that player's own page (nobody else has them). */
export function allDice(world: TestWorld, players: FakeClient[], inst = "0"): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const c of players) {
    if (!world.started(c, inst)) continue;
    const m = master(world, c, inst);
    const seat = m.currentPlayers.indexOf(world.instance(c, inst).networking.LocalPlayer.playerId);
    if (seat < 0) continue;
    const dice = m.MyDice(seat);
    assert.ok(dice, `${c.name} has no dice of their own`);
    out.set(seat, dice);
  }
  return out;
}

/** How many dice count for a bid on `face` (0..5), by the upstream rule (M:417). */
export function count(dice: Map<number, number[]>, face: number, wild: boolean): number {
  let n = 0;
  for (const list of dice.values()) for (const v of list) if (v === face || (wild && v === 0)) n++;
  return n;
}

/** The player to act bids `multi` X `face`, through the panel: face button, + until there, Submit. */
export async function bid(world: TestWorld, c: FakeClient, multi: number, face: number, inst = "0"): Promise<void> {
  const m = master(world, c, inst);
  const seat = m.currentPlayers.indexOf(world.instance(c, inst).networking.LocalPlayer.playerId);
  assert.ok(seat >= 0, `${c.name} is not seated`);
  const panel = station(world, c, seat, inst);
  assert.ok(panel.yourTurn, `${c.name}: not their turn`);
  await press(world, c, seat, FACES[face]!, inst, 60);
  while (panel.multiNum < multi) {
    const before = panel.multiNum;
    await press(world, c, seat, "plus", inst, 60);
    assert.ok(panel.multiNum > before, `${c.name}: + did nothing at ${before} (max ${panel.max})`);
  }
  const contests = m.contestSeq;
  const before = `${m.currentMulti}x${m.currentDie}`;
  await press(world, c, seat, "submit", inst);
  await until(world, `${c.name}'s bid ${multi} X ${face + 1}`, () => `${m.currentMulti}x${m.currentDie}` !== before || m.contestSeq !== contests);
}

/** The player to act calls the standing bid; resolves once every client shows the result. */
export async function callIt(world: TestWorld, c: FakeClient, inst = "0"): Promise<void> {
  const m = master(world, c, inst);
  const seat = m.currentPlayers.indexOf(world.instance(c, inst).networking.LocalPlayer.playerId);
  await press(world, c, seat, "callIt", inst);
  await waitPhase(world, Phase.Result, inst, 40000);
}

/** A player seated at the challenge presses Continue; resolves when bidding has begun or the game is over. */
export async function continueGame(world: TestWorld, c: FakeClient, inst = "0"): Promise<void> {
  const m = master(world, c, inst);
  const me = world.instance(c, inst).networking.LocalPlayer.playerId;
  const seat = m.contestPlayers.indexOf(me);
  assert.ok(seat >= 0, `${c.name} was not at the challenge`);
  await press(world, c, seat, "continue", inst);
  await until(world, "the next round or the end", () => world.clients.filter((p) => world.started(p, inst)).every((p) => {
    const mm = master(world, p, inst);
    return (mm.phase === Phase.Bidding && !seatedWithoutDice(world, p, inst)) || mm.phase === Phase.Lobby;
  }), 40000);
}

/** The text on the display without colour tags. */
export function plain(text: string): string {
  return text.replace(/<\/?color[^>]*>/g, "").replace(/<\/?s>/g, "");
}
