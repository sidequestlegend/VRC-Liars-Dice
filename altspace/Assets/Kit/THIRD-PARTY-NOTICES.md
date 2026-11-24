# Liar's Dice (Altspace snippet `liars-dice`): third-party notices

This kit and its script are a port of **VRC Liars Dice** by akalink (Garrett McPherson),
https://github.com/akalink/VRC-Liars-Dice, under the MIT licence:

> MIT License
>
> Copyright (c) 2022 Garrett McPherson
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Port source: https://github.com/sidequestlegend/VRC-Liars-Dice (branch `altspace`). The script also bundles the portkit
runtime (MIT). Not affiliated with VRChat.

## What the kit holds from upstream (MIT, as above)

The table prefab, the table and dice models, the table textures, the face sprites `01.png` to `06.png`, `button.png`, the
button animations (corrected copies), and the dice atlas, whose two lettered cells (the "LIAR'S DICE" logo and the "?")
were drawn again in Archivo Black for this port.

## Sounds

| File | Use | Author, source | Licence | Changes |
|---|---|---|---|---|
| `dice roll large.wav` | dice roll, more than 10 dice | "dice_06.wav" by **dermotte**, https://freesound.org/s/220744/ | **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/ | imported as mono |
| `dice roll small.wav` | dice roll, 1 to 10 dice | "Dice Rolling on Table" by Flem0527, https://freesound.org/s/629982/ | CC0 1.0 | imported as mono |
| `audience-clapping.wav` | the end of a game | "Audience Clapping.wav" by Zeraora, https://freesound.org/s/429422/ | CC0 1.0 | imported as mono |
| `click_001.ogg`, `select_002.ogg`, `confirmation_001.ogg` | button clicks, turn chime | "Interface Sounds" by Kenney (www.kenney.nl), https://opengameart.org/content/interface-sounds | CC0 1.0 | imported as mono |
| `jingles_SAX01.ogg`, `jingles_SAX02.ogg` | a lie found, a true bid | "85 short music jingles" by Kenney, https://opengameart.org/content/85-short-music-jingles | CC0 1.0 | imported as mono |

The licence of each freesound sound was read on its freesound.org page on 2026-11-24; the Kenney packs carry their CC0
licence files (`Audio/Kenney-*-License.txt`).

## Fonts

- **Archivo Black**, Copyright 2017 The Archivo Black Project Authors (https://github.com/Omnibus-Type/ArchivoBlack),
  SIL Open Font License 1.1 (full text: `Fonts/ArchivoBlack-OFL.txt`; from Google Fonts). Every text of the kit, and the
  lettering of the dice atlas.
- **Liberation Sans** (TextMesh Pro's default, SIL Open Font License 1.1): the fallback for letters Archivo Black lacks.

## Made for this port

The dice shader (`Shaders/DiceFlipbook.shader`) and the "ones are wild" icon (`Art/wild.png`).

## Not in the kit

Upstream's Heavitas font (free for personal use only), its TextMesh Pro assets, the old atlas lettering made with it,
the five sounds and the icon of unstated origin (`boo.wav`, `yay.wav`, `chime.wav`, `click-01.wav`,
`click w-pitch amp.wav`, `teeth.png`), and the built-in-pipeline shaders.
