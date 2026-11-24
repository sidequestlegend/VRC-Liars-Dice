// The game's definition: its slug and the classes bindings.json names by `type`. The build reads the default export.

import type { GameDefinition, GameInstance } from "../portkit/src/index.ts";
import { CreditsPanel } from "./CreditsPanel.ts";
import { FingerTrigger } from "./FingerTrigger.ts";
import { LiarsDiceMaster } from "./LiarsDiceMaster.ts";
import { PlayerHandle } from "./PlayerHandle.ts";
import { PositionTracker } from "./PositionTracker.ts";
import { ProximityEnable } from "./ProximityEnable.ts";

const game: GameDefinition = {
  slug: "liars-dice",
  behaviours: { LiarsDiceMaster, PlayerHandle, ProximityEnable, FingerTrigger, PositionTracker, CreditsPanel },
  debug: (instance: GameInstance) => debugHooks(instance),
};

export default game;

/** Readers for Play-mode tests (window.__pk1.debug["liars-dice:<inst>"]): the table as this page holds it. */
function debugHooks(instance: GameInstance): Record<string, unknown> {
  const master = () => instance.behaviour<LiarsDiceMaster>(instance.bindings.behaviours.find((b) => b.type === "LiarsDiceMaster")!.id);
  const station = (seat: number) => master().playerHandles[seat]!;
  const me = () => instance.networking.LocalPlayer;
  return {
    pathOf: (key: string) => instance.bindings.objects[key]?.path ?? "",
    me: () => ({ sid: me().sid, uid: me().uid, name: me().displayName, id: me().playerId }),
    /** This page's seat, or -1. */
    mySeat: () => master().currentPlayers.indexOf(me().playerId),
    table: () => {
      const m = master();
      return {
        phase: m.phase,
        gameStarted: m.gameStarted,
        round: m.round,
        seats: m.currentPlayers.slice(),
        names: m.playerNames.slice(),
        remaining: m.remaining.slice(),
        playing: m.playingPlayer,
        multi: m.currentMulti,
        die: m.currentDie,
        onesWild: m.onesWild,
        contestSeq: m.contestSeq,
        resultKind: m.resultKind,
        resultSum: m.resultSum,
        resultLoser: m.resultLoser,
        bidder: m.bidder,
        challenger: m.challenger,
        lastWinnerName: m.lastWinnerName,
        display: m.displayText.text,
        integrityOk: m.integrityOk,
      };
    },
    /** The frame and tint each of the 20 dice shows on this page. */
    frames: () => master().DieFrames(),
    /** This page's own dice for a seat (null unless it is this page's seat in a round). */
    myDice: (seat: number) => master().MyDice(seat),
    /** A station's panel as this page draws it. */
    panel: (seat: number) => {
      const s = station(seat);
      return { yourTurn: s.yourTurn, multiNum: s.multiNum, dieNumber: s.dieNumber, min: s.min, max: s.max, colors: s.colors };
    },
    sounds: () => master().sounds.slice(),
  };
}
