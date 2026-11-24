// Small local stand-ins for things the portkit runtime does not provide (yet). Each one is listed under
// "Runtime gaps" in PORT.md; when the runtime gains it, replace the use here and delete the stand-in.

import { type AudioClipRef, type AudioSourceRef, Color } from "../portkit/src/index.ts";

/** UnityEngine.Color.cyan and .gray (the runtime's Color has white, black, red, green, blue, yellow, clear). */
export const Cyan = (): Color => new Color(0, 1, 1, 1);
export const Gray = (): Color => new Color(0.5, 0.5, 0.5, 1);

/** UnityEngine.Color.HSVToRGB(H, S, V) with hdr = true, as Unity documents it. */
export function HSVToRGB(H: number, S: number, V: number): Color {
  if (S === 0) return new Color(V, V, V, 1);
  if (V === 0) return new Color(0, 0, 0, 1);
  const h = H * 6;
  const temp = Math.floor(h);
  const t = h - temp;
  const var1 = V * (1 - S);
  const var2 = V * (1 - S * t);
  const var3 = V * (1 - S * (1 - t));
  switch (temp) {
    case 0:
    case 6:
      return new Color(V, var3, var1, 1);
    case 1:
      return new Color(var2, V, var1, 1);
    case 2:
      return new Color(var1, V, var3, 1);
    case 3:
      return new Color(var1, var2, V, 1);
    case 4:
      return new Color(var3, var1, V, 1);
    default:
      return new Color(V, var1, var2, 1);
  }
}

/**
 * An AudioSource as upstream uses it: `pitch`, `volume`, `clip`, `Play()`. The runtime's AudioSourceRef only has
 * PlayOneShot, and no relay op sets an audio source's pitch or volume, so both are recorded here (tests read them)
 * but do not reach the app until the runtime has an op for them. `Play()` overlaps instead of cutting off.
 */
export class Speaker {
  readonly source: AudioSourceRef | null;
  pitch = 1;
  volume = 1;
  clip: AudioClipRef | null = null;
  /** Every clip played here, with the pitch and volume it was meant to have (for tests). */
  readonly played: Array<{ clip: number; pitch: number; volume: number }> = [];

  constructor(source: AudioSourceRef | null) {
    this.source = source;
  }

  Play(): void {
    if (!this.clip) return;
    this.played.push({ clip: this.clip.index, pitch: this.pitch, volume: this.volume });
    this.source?.PlayOneShot(this.clip);
  }
}
