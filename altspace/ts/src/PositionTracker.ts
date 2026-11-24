// PositionTracker.cs (akalink/VRC-Liars-Dice, MIT, Copyright (c) 2022 Garrett McPherson): not ported.
//
// Upstream moves two small trigger spheres onto the local player's index fingertips every frame (T:113-127) and
// looks for the finger bones again after an avatar change (T:128-141), so that FingerTrigger can see a finger
// push a button. The page is told the head and hands only, never finger bones, so buttons are clicked instead
// (FingerTrigger.ts) and this behaviour has nothing to do. It stays as an empty class so that the file map of
// PORT.md section 7 holds, and so that finger pressing has a place to go if the platform ever reports fingers.

import { Behaviour } from "../portkit/src/index.ts";

export class PositionTracker extends Behaviour {}
