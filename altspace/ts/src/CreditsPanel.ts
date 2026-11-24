// The credits panel: an addition of the port (no upstream file). A small "Credits" button on the menu panel opens the
// notices (MIT code, the CC BY dice roll, the CC0 sounds, the OFL font, where the source is); a click on the panel
// closes it. Each viewer opens it for themselves: nothing is shared.

import { Behaviour, type GameObject } from "../portkit/src/index.ts";

export class CreditsPanel extends Behaviour {
  panel!: GameObject;
  private open = false;

  override Start(): void {
    this.panel.SetActive(false);
  }

  override Interact(): void {
    this.Toggle();
  }

  Toggle(): void {
    this.open = !this.open;
    this.panel.SetActive(this.open);
  }

  get IsOpen(): boolean {
    return this.open;
  }
}
