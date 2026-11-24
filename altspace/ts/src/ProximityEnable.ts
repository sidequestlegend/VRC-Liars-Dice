// ProximityEnable.cs (akalink/VRC-Liars-Dice, MIT, Copyright (c) 2022 Garrett McPherson), translated for the
// portkit runtime. Line references `X:<n>` are to the upstream file.
//
// Upstream turns every text, button image and station collider of the table on while the local player stands
// inside a 7 m wide trigger cylinder around it (X:38-79), and off when they leave. The page has no player
// trigger and no per-component enable, so: the local head's horizontal distance from the table centre is tested
// on the tick, and the table's canvases are switched with SetActive. The range is the `ui-range` setting
// (default 3.5 m, the cylinder's radius); 0 keeps the UI on. Until the page knows where the player is (it is told
// only while they move), the UI stays on rather than hiding a table nobody can then see.

import { Behaviour, type GameObject } from "../portkit/src/index.ts";

export class ProximityEnable extends Behaviour {
  objectToToggle: GameObject | null = null;
  /** Port: the canvases to switch (upstream: every TextMeshProUGUI and Image under the table, X:28-31). */
  canvases: GameObject[] = [];
  currentState = false;
  range = 3.5;

  override Start(): void {
    const text = this.Settings.get("ui-range");
    const n = text === undefined || text.trim() === "" ? 3.5 : Number(text);
    this.range = Number.isFinite(n) ? n : 3.5;
    this.currentState = this.Inside();
    this.SetSetter(this.currentState);
  }

  /** Upstream: OnPlayerTriggerEnter / OnPlayerTriggerExit for the local player (X:38-54). */
  override Update(): void {
    const inside = this.Inside();
    if (inside === this.currentState) return;
    this.currentState = inside;
    this.SetSetter(this.currentState);
  }

  private Inside(): boolean {
    if (!(this.range > 0)) return true;
    const head = this.Input.Position;
    const centre = this.transform.known ? this.transform.position : null;
    if (!head || !centre) return true;
    const dx = head.x - centre.x;
    const dz = head.z - centre.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.range;
  }

  private SetSetter(state: boolean): void {
    this.objectToToggle?.SetActive(state);
    for (const canvas of this.canvases) canvas.SetActive(state);
  }
}
