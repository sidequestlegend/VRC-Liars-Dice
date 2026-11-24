// FingerTrigger.cs (akalink/VRC-Liars-Dice, MIT, Copyright (c) 2022 Garrett McPherson), translated for the
// portkit runtime. Line references `F:<n>` are to the upstream file.
//
// Upstream: a VR fingertip entering the button's selector pushes it in (animator bool, push-in sound, a buzz) and
// leaving it fires the button (F:43-75). The page has no finger bones, so a selector is a click target instead,
// on desktop and in VR alike: a click does the push-in and, 0.15 s later, the release. The button's action runs
// on the click itself. The buzz goes to the hand the runtime judges made the click (Input.LastClickSide: the trigger
// pulled in the last second, else the nearest hand); both hands when it cannot tell (nothing on desktop).

import { Behaviour, Hand, type AnimatorRef, type HandSide } from "../portkit/src/index.ts";

export class FingerTrigger extends Behaviour {
  behavior: Behaviour | null = null;
  methodName = "";
  pushInMethod = "_DepressedClickSoundAll";
  /** Upstream: GetComponentInParent<Animator>() (F:26); the station's animator, from bindings. */
  anim: AnimatorRef | null = null;
  private held = false;

  override Interact(): void {
    // OnTriggerEnter (F:43-58)
    this.anim?.SetBool(this.methodName, true);
    this.behavior?.SendCustomEvent(this.pushInMethod);
    this.side = this.Input.LastClickSide;
    this.Buzz(0.2, this.side);
    // OnTriggerExit (F:60-75): the action
    this.behavior?.SendCustomEvent(this.methodName);
    if (!this.held) {
      this.held = true;
      this.SendCustomEventDelayedSeconds("_Release", 0.15);
    }
  }

  _Release(): void {
    this.held = false;
    this.anim?.SetBool(this.methodName, false);
    this.Buzz(0.5, this.side);
  }

  /** The side of the click that pressed this button, kept for the release buzz. */
  private side: HandSide | null = null;

  private Buzz(seconds: number, side: HandSide | null = this.Input.LastClickSide): void {
    if (side !== null) {
      this.Input.Haptic(side, 0.5, seconds);
      return;
    }
    this.Input.Haptic(Hand.Left, 0.5, seconds);
    this.Input.Haptic(Hand.Right, 0.5, seconds);
  }
}
