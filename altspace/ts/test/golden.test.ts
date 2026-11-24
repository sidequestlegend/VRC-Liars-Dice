// The pure rules against golden vectors from the upstream C# (golden/harness: LiarsDiceMaster.cs and
// PlayerHandle.cs compiled unchanged with dotnet 8 against stubs; `npm run golden` writes golden/vectors.json).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  bidAccepted,
  calcSumShowDice,
  LiarsDiceMaster,
  Phase,
  playerContests,
  returnLastPlayer,
  returnNextUser,
  type ContestState,
} from "../src/LiarsDiceMaster.ts";
import { highlightColors } from "../src/PlayerHandle.ts";
import { plain } from "./helpers.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const V: any = JSON.parse(readFileSync(fileURLToPath(new URL("../golden/vectors.json", import.meta.url)), "utf8"));
const name = (id: number) => (id < 0 ? "" : "P" + id);

test("V1 ReturnNextUser and ReturnLastPlayer match upstream wherever upstream gives a playable seat", () => {
  let same = 0;
  let fixed = 0;
  for (const v of V.nextUser) {
    const port = returnNextUser(v.next, v.postContestTurn, v.currentPlayers, v.remaining);
    const playable = (i: number) => i >= 0 && v.currentPlayers[i] !== -1 && v.remaining[i] >= 1;
    if (typeof v.result === "number" && playable(v.result)) {
      assert.equal(port, v.result, JSON.stringify(v));
      same++;
      continue;
    }
    // Upstream threw (remaining[-1]) or returned an empty seat or one without dice: the port moves on to the
    // next playable seat after `next`, or -1 when there is none (deliberate difference).
    let expected = -1;
    for (let k = 1; k <= 4; k++) {
      const i = ((v.next < 0 ? -1 : v.next) + k + 4) % 4;
      if (playable(i)) {
        expected = i;
        break;
      }
    }
    assert.equal(port, expected, JSON.stringify(v));
    fixed++;
  }
  for (const v of V.lastPlayer) assert.equal(returnLastPlayer(v.lastPlayer, v.currentPlayers), v.result, JSON.stringify(v));
  assert.ok(same > 500, `${same} identical`);
  console.log(`V1: ${same} identical, ${fixed} where upstream gives no playable seat (fixed), ${V.lastPlayer.length} ReturnLastPlayer; upstream never returns in ${V.skipped.nextUser} + ${V.skipped.lastPlayer} patterns`);
});

test("V2 the count, each die's frame and tint, and the Continue stations match CalcSumShowDice", () => {
  for (const v of V.calcSum) {
    const r = calcSumShowDice(v.dieValues, v.currentPlayers, v.remaining, v.currentDie, v.onesWild, v.onesInvalid);
    assert.equal(r.sum, v.sum, JSON.stringify(v));
    assert.deepEqual(r.frames, v.frames);
    assert.deepEqual(r.tints, v.tints);
    assert.deepEqual(r.continueSeats, v.continueSeats);
  }
  console.log(`V2: ${V.calcSum.length} tables`);
});

test("V3 bid acceptance and the ten button colours match PlayerHandle", () => {
  let accepted = 0;
  for (const v of V.bids) {
    assert.deepEqual(highlightColors(v.num, v.multiNum, v.min, v.max, v.dieNumber, v.prevDieNumber, v.firstTurnFlag), { faces: v.faces, others: v.others }, JSON.stringify(v));
    assert.equal(bidAccepted(v.multiNum, v.min, v.dieNumber, v.prevDieNumber), v.accepted, JSON.stringify(v));
    if (v.accepted) accepted++;
  }
  assert.ok(accepted > 1000 && accepted < V.bids.length - 1000);
  console.log(`V3: ${V.bids.length} panels, ${accepted} bids accepted`);
});

test("V4 challenge resolution matches _PlayerContests: state after and display text", () => {
  let liars = 0;
  let eliminations = 0;
  for (const v of V.contests) {
    const s: ContestState = { ...structuredClone(v.in), postContestTurn: false };
    const outcome = playerContests(s);
    const out = {
      currentPlayers: s.currentPlayers,
      remaining: s.remaining,
      numJoinedPlayers: s.numJoinedPlayers,
      playingPlayer: s.playingPlayer,
      postContestTurnPlayer: s.postContestTurnPlayer,
      postContestTurn: s.postContestTurn,
      currentMulti: s.currentMulti,
      currentDie: s.currentDie,
    };
    assert.deepEqual(out, v.out, JSON.stringify(v.in));
    // The text, as the port writes it from the stored result.
    const m = new LiarsDiceMaster();
    m.resultKind = 0;
    m.bidder = outcome.bidder;
    m.challenger = v.in.playingPlayer;
    m.resultLoser = outcome.loser;
    m.resultEliminated = outcome.eliminated;
    m.resultSum = outcome.sum;
    m.resultMulti = v.in.currentMulti;
    m.resultDie = v.in.currentDie;
    m.resultNames = v.in.currentPlayers.map(name);
    assert.equal(plain(m.ContestText()), v.text, JSON.stringify(v.in));
    if (outcome.liar) liars++;
    if (outcome.eliminated) eliminations++;
  }
  assert.ok(liars > 300 && eliminations > 100);
  console.log(`V4: ${V.contests.length} challenges, ${liars} liars, ${eliminations} eliminations`);
});

test("V5 the display text matches UpdateText (colour tags removed)", () => {
  for (const v of V.texts) {
    const m = new LiarsDiceMaster();
    m.currentPlayers = v.currentPlayers;
    m.gameStarted = v.gameStarted;
    m.phase = v.gameStarted ? Phase.Bidding : Phase.Lobby;
    m.playingPlayer = v.playingPlayer;
    m.currentDie = v.currentDie;
    m.currentMulti = v.currentMulti;
    m.onesWild = v.onesWild;
    m.onesInvalid = v.onesInvalid;
    m.lastWinner = v.lastWinner;
    m.lastWinnerName = name(v.lastWinner);
    m.playerNames = v.currentPlayers.map(name);
    assert.equal(plain(m.DisplayText("Liar's Dice")), v.text, JSON.stringify(v));
  }
  console.log(`V5: ${V.texts.length} displays`);
});

test("the name colour: same name, same colour; one hex digit per channel, doubled (M:598-608)", () => {
  const m = new LiarsDiceMaster();
  const tag = m._ReturnPlayerColor("Ann");
  assert.equal(tag, m._ReturnPlayerColor("Ann"));
  assert.match(tag, /^<color=#([0-9A-F])\1([0-9A-F])\2([0-9A-F])\3>Ann$/);
  // A fully saturated hue: one channel is at sqrt(255) -> F.
  assert.ok(/F/.test(tag.slice(8, 14)));
  assert.notEqual(m._ReturnPlayerColor("Bob"), tag);
});
