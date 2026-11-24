// The game's definition: its slug and the classes bindings.json names by `type`. The build reads the default export.

import type { GameDefinition } from "../portkit/src/index.ts";
import { FingerTrigger } from "./FingerTrigger.ts";
import { LiarsDiceMaster } from "./LiarsDiceMaster.ts";
import { PlayerHandle } from "./PlayerHandle.ts";
import { PositionTracker } from "./PositionTracker.ts";
import { ProximityEnable } from "./ProximityEnable.ts";

const game: GameDefinition = {
  slug: "liars-dice",
  behaviours: { LiarsDiceMaster, PlayerHandle, ProximityEnable, FingerTrigger, PositionTracker },
};

export default game;
