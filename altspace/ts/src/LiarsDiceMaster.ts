// LiarsDiceMaster.cs (akalink/VRC-Liars-Dice, MIT, Copyright (c) 2022 Garrett McPherson), translated for the
// portkit runtime. Line references `M:<n>` are to the upstream file.
//
// "The script handles all syncing and core logic for the liars dice table. It stores the state of the game and
// distributes that data to all the UI logic scripts (playerHandle). It updates the visuals of all synced aspects
// of the table." (M:14-19)
//
// What differs from upstream, and why (PORT.md section 3a and section 10):
//   - Nobody's dice travel before a challenge. Each seated player makes a fair self-roll (Secrets.beginDraw: the
//     player commits to a secret, the referee publishes a number, the dice come from both); at "Call it" every
//     seated player reveals, the referee checks each reveal against the pinned commitment and only then writes
//     the dice into `dieValues`. A changed secret is rejected; a player who does not reveal in time forfeits.
//   - So a round is several messages: an explicit `phase` (lobby, rolling, bidding, revealing, result) and the
//     fields upstream kept on the owner only (postContestTurn, postContestTurnPlayer, onesInvalid) are synced,
//     and the challenge result is state (late arrivals see it; D01, D12).
//   - The referee checks every request (turn, phase, bid) instead of trusting the sender's panel.
//   - Three upstream bugs fixed on purpose: remaining[-1] when a lobby player leaves (D04), a second Continue
//     skipping a turn (D06), the turn landing on an empty seat (D05 and ReturnNextUser).
//   - Names are kept in state (D11); dice counts reset at game end (D13); the + limit is counted first (D07);
//     Start no longer lingers (D08); the ones-wild check mark no longer flips during a game (D09).

import {
  Behaviour,
  type DeserializationResult,
  type DrawState,
  type GameObject,
  type AudioClipRef,
  type AudioSourceRef,
  NetworkEventTarget,
  type Player,
  type RendererRef,
  type TextRef,
  Color,
  fnv1a,
} from "../portkit/src/index.ts";
import type { PlayerHandle } from "./PlayerHandle.ts";
import type { ProximityEnable } from "./ProximityEnable.ts";

/** Port addition: where a round stands. Upstream had no explicit phase (PORT.md section 3a). */
export const Phase = { Lobby: 0, Rolling: 1, Bidding: 2, Revealing: 3, Result: 4 } as const;

/** Flipbook frames of the dice atlas (PORT.md, top): 0 to 5 faces, 6 "?", 7 red X, 8 logo. */
export const FRAME_UNKNOWN = 6;
export const FRAME_LOST = 7;
export const FRAME_LOGO = 8;

const SEATS = 4;
const DICE_PER_SEAT = 5; // "number of dice per player, make modular" (M:112)

// ---- pure rules, exported for the golden vectors ----------------------------------------------------------------

/**
 * ReturnNextUser (M:294-310): the seat after `next` that is taken and still has dice, unless the next turn belongs
 * to the loser of a challenge (postContestTurn) or `next` has no dice.
 *
 * Deliberate difference: upstream can return a seat that is empty or has no dice (the post-contest player left,
 * or `next` itself is empty with no dice), and with no playable seat at all it never returns. Here a result that
 * is not a taken seat with dice moves on to the next one that is, and -1 means there is none.
 */
export function returnNextUser(next: number, postContestTurn: boolean, currentPlayers: readonly number[], remaining: readonly number[]): number {
  const n = currentPlayers.length;
  const playable = (i: number) => i >= 0 && i < n && currentPlayers[i] !== -1 && remaining[i]! >= 1;
  if (!postContestTurn && next >= 0 && next < n && remaining[next]! > 0) {
    let steps = 0;
    do {
      next++;
      if (next >= n) next = 0;
      if (++steps > n) return -1; // upstream would loop for ever
    } while (currentPlayers[next] === -1 || remaining[next]! < 1);
  }
  if (playable(next)) return next;
  // The fix: never hand the turn to an empty seat or one without dice.
  for (let k = 1; k <= n; k++) {
    const i = (((next < 0 ? -1 : next) + k) % n + n) % n;
    if (playable(i)) return i;
  }
  return -1;
}

/** ReturnLastPlayer (M:389-401): the taken seat before `lastPlayer`. -1 when no seat is taken (upstream: no return). */
export function returnLastPlayer(lastPlayer: number, currentPlayers: readonly number[]): number {
  const n = currentPlayers.length;
  let steps = 0;
  do {
    lastPlayer--;
    if (lastPlayer < 0) lastPlayer = n - 1;
    if (++steps > n) return -1;
  } while (currentPlayers[lastPlayer] === -1);
  return lastPlayer;
}

export interface SumAndDice {
  sum: number;
  /** The flipbook frame CalcSumShowDice sets on each die, or null where it leaves the die alone. */
  frames: Array<number | null>;
  /** "cyan" for a die that counts, "white" for one that does not, null where no colour is set. */
  tints: Array<"cyan" | "white" | null>;
  /** Stations that get the Continue button (M:409-412). */
  continueSeats: boolean[];
}

/** CalcSumShowDice (M:403-435), its counting rule (M:413-421) unchanged. */
export function calcSumShowDice(
  dieValues: readonly number[],
  currentPlayers: readonly number[],
  remaining: readonly number[],
  currentDie: number,
  onesWild: boolean,
  onesInvalid: boolean,
  stations = SEATS,
): SumAndDice {
  let sum = 0;
  const frames: Array<number | null> = dieValues.map(() => null);
  const tints: Array<"cyan" | "white" | null> = dieValues.map(() => null);
  const continueSeats = new Array<boolean>(stations).fill(false);
  for (let i = 0; i < dieValues.length; i++) {
    const playerNum = Math.trunc(i / DICE_PER_SEAT);
    if (i < stations && currentPlayers[i] !== -1) continueSeats[i] = true;
    if (currentPlayers[playerNum] === -1) continue;
    if ((i % DICE_PER_SEAT) + 1 <= remaining[playerNum]!) {
      if (dieValues[i] === currentDie || (onesWild && !onesInvalid && dieValues[i] === 0)) {
        sum++;
        tints[i] = "cyan";
      } else {
        tints[i] = "white";
      }
      frames[i] = dieValues[i]!;
    } else {
      frames[i] = FRAME_LOST;
    }
  }
  return { sum, frames, tints, continueSeats };
}

/** The part of the master's state a challenge changes (M:330-387, the owner's branch). */
export interface ContestState {
  currentPlayers: number[];
  remaining: number[];
  numJoinedPlayers: number;
  playingPlayer: number;
  postContestTurnPlayer: number;
  postContestTurn: boolean;
  currentMulti: number;
  currentDie: number;
  onesWild: boolean;
  onesInvalid: boolean;
  dieValues: number[];
}

export interface ContestOutcome {
  sum: number;
  /** True when the bid was a lie (the bidder loses). */
  liar: boolean;
  bidder: number;
  loser: number;
  /** The loser lost their last die. */
  eliminated: boolean;
}

/** _PlayerContests (M:330-387) on the owner, without the text and sound lines. Changes `s` as upstream does. */
export function playerContests(s: ContestState): ContestOutcome {
  const lastPlayer = returnLastPlayer(s.playingPlayer, s.currentPlayers);
  const sum = calcSumShowDice(s.dieValues, s.currentPlayers, s.remaining, s.currentDie, s.onesWild, s.onesInvalid).sum;
  const leave = (seat: number) => {
    // _PlayerLeft(player, false) (M:554-583): the seat of that player id is freed.
    const id = s.currentPlayers[seat];
    for (let i = 0; i < s.currentPlayers.length; i++) {
      if (s.currentPlayers[i] === id) {
        s.currentPlayers[i] = -1;
        s.numJoinedPlayers--;
        break;
      }
    }
  };
  s.postContestTurn = true;
  let loser: number;
  let eliminated: boolean;
  const liar = s.currentMulti > sum;
  if (liar) {
    loser = lastPlayer;
    eliminated = s.remaining[lastPlayer]! - 1 === 0; // ProcessALosingPlayer (M:437-455)
    s.postContestTurnPlayer = lastPlayer;
    s.remaining[lastPlayer]!--;
    if (s.remaining[lastPlayer] === 0) {
      s.postContestTurnPlayer = s.playingPlayer;
      leave(lastPlayer);
    }
    s.playingPlayer = lastPlayer;
  } else {
    loser = s.playingPlayer;
    eliminated = s.remaining[s.playingPlayer]! - 1 === 0;
    s.postContestTurnPlayer = s.playingPlayer;
    s.remaining[s.playingPlayer]!--;
    if (s.remaining[s.playingPlayer] === 0) {
      leave(s.playingPlayer);
      s.postContestTurnPlayer = lastPlayer;
    }
  }
  s.currentDie = -1;
  s.currentMulti = 1;
  s.playingPlayer = lastPlayer;
  return { sum, liar, bidder: lastPlayer, loser, eliminated };
}

/** The bid line upstream writes on the display (M:715, M:372). */
export function bidLine(multi: number, die: number): string {
  return multi + " X " + (die + 1) + " die";
}

// ---- the behaviour ------------------------------------------------------------------------------------------------

export class LiarsDiceMaster extends Behaviour {
  /*Buglist (upstream, M:23-25):
      Late joiners during contests will not see the correct message. (Fixed here: the result is state.)
      Nothing is initalized until table is interacted with */

  /** Reached by SendCustomNetworkEvent (the runtime refuses any other name from the network). */
  static override networkCallable = ["OnesWildNetwork", "DiceRollSound", "ResetStations", "GameEndSound"];

  static override synced = [
    "dieValues",
    "remaining",
    "currentPlayers",
    "numJoinedPlayers",
    "playingPlayer",
    "gameStarted",
    "currentMulti",
    "currentDie",
    "lastWinner",
    "onesWild",
    // owner-only upstream, synced here (D12)
    "postContestTurnPlayer",
    "postContestTurn",
    "onesInvalid",
    // port additions (PORT.md section 3a)
    "phase",
    "gameId",
    "round",
    "deadline",
    "contestPlayers",
    "bidder",
    "challenger",
    "contestSeq",
    "resultKind",
    "resultSum",
    "resultLoser",
    "resultEliminated",
    "resultMulti",
    "resultDie",
    "resultWild",
    "resultNames",
    "resultOut",
    "playerNames",
    "lastWinnerName",
    "playerUids",
  ];

  // #region Instance Variables (M:27-89)
  /** -1 for every die except during a result, when it holds the frame each die shows (PORT.md 3a). */
  dieValues: number[] = new Array<number>(SEATS * DICE_PER_SEAT).fill(-1);
  remaining: number[] = new Array<number>(SEATS).fill(DICE_PER_SEAT);
  private diceLeft = 0;
  diceMesh: Array<RendererRef | null> = [];
  materialFloatName = "_frame";
  currentPlayers: number[] = new Array<number>(SEATS).fill(-1);
  numJoinedPlayers = 0;
  playingPlayer = -1;
  postContestTurnPlayer = -1;
  postContestTurn = false;
  gameStarted = false;
  currentMulti = 1;
  currentDie = -1;
  lastWinner = -1;
  onesWild = true;
  onesWildStateVisual: GameObject | null = null;
  onesInvalid = false;
  private canInteract = false;

  phase: number = Phase.Lobby;
  gameId = "";
  round = 0;
  /** Synced seconds by which the current rolling or revealing phase must be complete. */
  deadline = 0;
  /** Who was seated when "Call it" was pressed: they reveal, and they may press Continue. */
  contestPlayers: number[] = new Array<number>(SEATS).fill(-1);
  bidder = -1;
  challenger = -1;
  contestSeq = 0;
  /** 0 counted, 1 the bidder did not reveal, 2 the challenger did not reveal. */
  resultKind = 0;
  resultSum = 0;
  resultLoser = -1;
  resultEliminated = false;
  resultMulti = 1;
  resultDie = -1;
  resultWild = false;
  resultNames: string[] = new Array<string>(SEATS).fill("");
  /** Seats out of the game because they did not reveal valid dice. */
  resultOut: boolean[] = new Array<boolean>(SEATS).fill(false);
  playerNames: string[] = new Array<string>(SEATS).fill("");
  lastWinnerName = "";
  /**
   * The user id of each seat's player (meaningful while the seat is taken). A page reload is a new session with a new
   * player id: the referee gives the seat back to the same user if they return within `rejoin-grace` seconds.
   */
  playerUids: string[] = new Array<string>(SEATS).fill("");

  displayText!: TextRef;
  rulesText!: TextRef;
  playerHandles: PlayerHandle[] = [];
  private rulesIndex = 0;
  proximityEnable: ProximityEnable | null = null;

  private readonly rules: readonly string[] = [
    "",
    "To begin each round, all players roll their dice simultaneously.",
    "Each player looks at their own dice after they roll, keeping them hidden from the other players.",
    'The first player then states a bid consisting of a face ("1\'s", "5\'s", etc.) and a quantity.',
    'The quantity represents the player\'s guess as to how many of each face have been rolled by all the players at the table, including themselves. For example, a player might bid "five 2\'s."',
    'Each subsequent player can either then make a higher bid of the same face (e.g., "six 2\'s"), or they can challenge the previous bid',
    "If the player challenges the previous bid, all players reveal their dice. If the bid is matched or exceeded, the bidder wins. Otherwise the challenger wins.",
    "If the bidder loses, they remove one of their dice from the game.",
    "The loser of the previous round begins the next round.",
    "The winner of the game is the last player to have any dice remaining.",
  ];
  private readonly white = "<color=#FFFFFF>";

  // #region AudioClips
  TruthContestSfx: AudioClipRef | null = null;
  LiarContestSfx: AudioClipRef | null = null;
  DiceRollSmallSfx: AudioClipRef | null = null;
  DiceRollLargeSfx: AudioClipRef | null = null;
  gameEndSfx: AudioClipRef | null = null;
  speaker: AudioSourceRef | null = null;
  audioState = true;
  audioStateVisual: GameObject | null = null;
  slider: GameObject | null = null;
  logging = false;
  // #endregion

  // Port: local bookkeeping.
  private heardContest = -1;
  private commitTimeout = 15;
  private revealTimeout = 15;
  private rejoinGrace = 20;
  /**
   * Port addition (`min-players`, default 2 as upstream): the fewest seated players a game starts with and goes on
   * with. 1 allows practising alone (and the one-player Play-mode test): the turn then always comes back to that player.
   */
  private minPlayers = 2;
  private readonly absentSince = new Array<number>(SEATS).fill(-1);
  /**
   * Each client checks the referee's result against the reveals it can see itself and the dice counts it saw during the
   * round (PORT.md 3a, step 7): "pending" while reveals may still arrive, "ok" when every counted die and the count
   * check out, "partial" when some could not be checked (a reveal never reached this page, or it arrived after the
   * bidding and did not see the counts), "failed" when something does not match. A failure is shown on the display.
   */
  integrity: "pending" | "ok" | "partial" | "failed" = "ok";
  get integrityOk(): boolean {
    return this.integrity !== "failed";
  }
  private checkedContest = -1;
  private checkingContest = -1;
  private resultSeenAt = -1;
  /** The dice count of each seat this page saw while the round was being played (`<gameId>.<round>`), for the check. */
  private seenCounts: { round: string; counts: number[] } | null = null;
  /** Seats whose dice this page shows as void (red X) during the round, as last drawn: a change redraws them. */
  private voidSeats = "";
  /** Sounds this client played on the table speaker, by name (for tests). */
  readonly sounds: string[] = [];
  /** Lines this client showed on the display, in order (for tests). */
  readonly shown: string[] = [];

  // #region initialization (M:91-125)
  override Start(): void {
    this.logging = this.Settings.get("debug") === "true";
    this.onesWild = this.Settings.get("ones-wild") !== "false";
    this.audioState = this.Settings.get("sound") !== "false";
    this.commitTimeout = numberSetting(this.Settings.get("commit-timeout"), 15);
    this.revealTimeout = numberSetting(this.Settings.get("reveal-timeout"), 15);
    this.rejoinGrace = Math.max(0, numberSetting(this.Settings.get("rejoin-grace"), 20));
    this.minPlayers = Math.min(SEATS, Math.max(1, Math.round(numberSetting(this.Settings.get("min-players"), 2))));
    this._ShowRules();
    for (let i = 0; i < this.currentPlayers.length; i++) {
      if (i < this.playerHandles.length) this.playerHandles[i]!._SetPlayerNumber(i); // PlayerHandle behaviors store their own index
    }
    if (!this.audioState) {
      this.audioState = true;
      this._ToggleAudio();
    }
    const volume = numberSetting(this.Settings.get("volume"), 1);
    if (volume !== 1) this._SetVolume(volume);
    // Randomize() (M:122) is gone: nobody holds anyone's dice.
    this.AllDeserialization();
  }

  override OnInstanceStart(): void {
    this.heardContest = this.contestSeq;
    this.AllDeserialization();
  }
  // #endregion

  // #region settings methods (M:126-186)
  _ShowRules(): void {
    if (this.rulesIndex >= this.rules.length) this.rulesIndex = 0;
    this.rulesText.text = this.rules[this.rulesIndex]!;
    this.rulesIndex++;
  }

  _OnesWild(): void {
    // D09: upstream flipped the check mark even when the press could change nothing.
    if (!this.gameStarted) this.onesWildStateVisual?.SetActive(!this.onesWild);
    this.SendCustomNetworkEvent(NetworkEventTarget.All, "OnesWildNetwork");
  }

  OnesWildNetwork(): void {
    if (!this.gameStarted && this.Networking.IsOwner(this.gameObject)) {
      this.onesWild = !this.onesWild;
      this.RequestSerialization();
      this.AllDeserialization();
    }
  }

  _ToggleAudio(): void {
    this.audioState = !this.audioState;
    this.audioStateVisual?.SetActive(this.audioState);
    for (let i = 0; i < this.playerHandles.length; i++) this.playerHandles[i]!._SetAudioState(this.audioState);
  }

  /** Upstream reads slider.value (M:161-168); the slider event hands the value over. */
  _SetVolume(value: number): void {
    const v = Math.min(1, Math.max(0.025, Number(value) || 0));
    if (this.speaker) this.speaker.volume = v;
    for (const pH of this.playerHandles) pH._SetVolume(v);
  }

  _LeaveGame(): void {
    if (this.gameStarted && this.canInteract) {
      for (let i = 0; i < this.currentPlayers.length; i++) {
        if (this.currentPlayers[i] === this.Networking.LocalPlayer.playerId) {
          this.Log(this.Networking.LocalPlayer.displayName + " requested to leave game");
          this.playerHandles[i]!._RequestToLeaveGame();
          return;
        }
      }
    }
  }
  // #endregion

  // #region game logic (M:188-501)
  _GetGameStarted(): boolean {
    return this.gameStarted;
  }

  _GetCanInteract(): boolean {
    return this.canInteract;
  }

  _GetNumJoinedPlayers(): number {
    return this.numJoinedPlayers;
  }

  _GetMinPlayers(): number {
    return this.minPlayers;
  }

  /** Task 5. Port: the referee checks the request (a seated player, two or more seated, no game running). */
  _InitializeGame(station: number, caller: Player): void {
    if (!this.Networking.IsOwner(this.gameObject)) return;
    if (this.gameStarted || this.numJoinedPlayers < this.minPlayers || this.currentPlayers[station] !== caller.playerId) return;
    this.Log("Starting new game with " + this.numJoinedPlayers + " number of players");
    this.gameStarted = true;
    this.playingPlayer = this.currentPlayers.length - 1;
    for (let i = 0; i < this.remaining.length; i++) this.remaining[i] = DICE_PER_SEAT;
    this.gameId = this.NewGameId();
    this.round = 0;
    this._NewRound();
  }

  /**
   * Upstream rolled every die here and went straight to the first turn (M:219-234). Now it opens the rolling
   * phase: every seated player rolls for themselves, and _CommitsComplete gives the first turn.
   */
  _NewRound(): void {
    if (!this.Networking.IsOwner(this.gameObject)) return;
    if (this.numJoinedPlayers < this.minPlayers || this.numJoinedPlayers === 0) {
      // As upstream: Continue with one player left plays the roll, then NextTurn ends the game.
      this.SendCustomNetworkEvent(NetworkEventTarget.All, "DiceRollSound");
      if (this.postContestTurn) this.NextTurn(this.postContestTurnPlayer);
      else this.NextTurn();
      return;
    }
    this.round++;
    this.phase = Phase.Rolling;
    this.dieValues.fill(-1);
    this.contestPlayers.fill(-1);
    this.resultOut.fill(false);
    this.deadline = this.Networking.GetServerTimeInSeconds() + this.commitTimeout;
    this.RequestSerialization();
    this.AllDeserialization();
    this.SendCustomNetworkEvent(NetworkEventTarget.All, "DiceRollSound");
  }

  /** Port: every seated player has committed and been given the referee's number; the round begins (M:225-232). */
  _CommitsComplete(): void {
    if (!this.Networking.IsOwner(this.gameObject)) return;
    this.phase = Phase.Bidding;
    if (this.postContestTurn) this.NextTurn(this.postContestTurnPlayer);
    else this.NextTurn();
  }

  /** Task 3. Port: the referee checks what the station's panel used to (P:491-517, P:416-425). */
  _ReceiveBid(multi: number, die: number, station: number, caller: Player): void {
    if (!this.Networking.IsOwner(this.gameObject)) return;
    if (this.phase !== Phase.Bidding || station !== this.playingPlayer || this.currentPlayers[station] !== caller.playerId) return;
    if (!Number.isInteger(multi) || !Number.isInteger(die) || die < 0 || die > 5) return;
    if (multi < this.currentMulti || multi > this.CountDiceLeft() || !bidAccepted(multi, this.currentMulti, die, this.currentDie)) return;
    this.currentMulti = multi;
    this.currentDie = die;
    this.NextTurn();
  }

  private NextTurn(lastPlayer: number = this.playingPlayer): void {
    this.Log("passed in previous player is index " + lastPlayer);
    if (!this.Networking.IsOwner(this.gameObject)) return;
    const next = this.ReturnNextUser(lastPlayer);
    this.postContestTurn = false;

    if (this.numJoinedPlayers < this.minPlayers || this.numJoinedPlayers === 0) {
      this.gameStarted = false;
      this.lastWinner = this.playingPlayer >= 0 ? this.currentPlayers[this.playingPlayer]! : -1;
      this.lastWinnerName = this.playingPlayer >= 0 ? this.playerNames[this.playingPlayer]! : "";
      for (let i = 0; i < this.currentPlayers.length; i++) {
        if (this.remaining[i]! > 0 && this.currentPlayers[i] !== -1) {
          this.lastWinner = this.currentPlayers[i]!;
          this.lastWinnerName = this.playerNames[i]!;
        }
        this.currentPlayers[i] = -1;
        this.playerNames[i] = "";
      }
      if (this.lastWinner === -1) this.lastWinnerName = "";
      this.currentMulti = 1;
      this.currentDie = -1;
      this.numJoinedPlayers = 0;
      // D13: upstream left the last game's dice counts until the next start.
      for (let i = 0; i < this.remaining.length; i++) this.remaining[i] = DICE_PER_SEAT;
      this.dieValues.fill(-1);
      this.contestPlayers.fill(-1);
      this.phase = Phase.Lobby;

      this.SendCustomNetworkEvent(NetworkEventTarget.All, "ResetStations");
      this.playingPlayer = -1;
      this.RequestSerialization();
      this.AllDeserialization();
      this.SendCustomNetworkEvent(NetworkEventTarget.All, "GameEndSound");
      return;
    }

    this.playingPlayer = next;
    this.RequestSerialization();
    this.AllDeserialization();
  }

  private ReturnNextUser(next: number): number {
    const result = returnNextUser(next, this.postContestTurn, this.currentPlayers, this.remaining);
    this.Log("Next player id is " + result + " old one is " + this.playingPlayer + " numJoinedPlayer is " + this.numJoinedPlayers);
    return result;
  }

  GameEndSound(): void {
    if (this.audioState && this.gameEndSfx !== null && this.speaker !== null) {
      this.speaker.clip = this.gameEndSfx;
      this.speaker.Play();
      this.sounds.push("applause");
    }
  }

  ResetStations(): void {
    for (let i = 0; i < this.playerHandles.length; i++) this.playerHandles[i]!._EndGame();
  }

  /**
   * Task 4, "Call it". Upstream judged at once on every client from the dice it already had (M:330-387). Here
   * the referee opens the revealing phase; _ResolveContest judges once the reveals are in.
   */
  _PlayerContests(station: number, caller: Player): void {
    if (!this.Networking.IsOwner(this.gameObject)) return;
    if (this.phase !== Phase.Bidding || station !== this.playingPlayer || this.currentPlayers[station] !== caller.playerId) return;
    if (this.currentDie < 0) return; // "Call it" needs a standing bid (P:523, firstTurnFlag)
    this.challenger = this.playingPlayer;
    this.bidder = this.ReturnLastPlayer(this.playingPlayer);
    for (let i = 0; i < SEATS; i++) {
      this.contestPlayers[i] = this.currentPlayers[i]!;
      this.resultNames[i] = this.playerNames[i]!;
      this.resultOut[i] = false;
    }
    this.resultMulti = this.currentMulti;
    this.resultDie = this.currentDie;
    this.resultWild = this.onesWild && !this.onesInvalid;
    this.phase = Phase.Revealing;
    this.deadline = this.Networking.GetServerTimeInSeconds() + this.revealTimeout;
    this.Secrets.demandReveal(this.Label(), this.revealTimeout);
    this.RequestSerialization();
    this.AllDeserialization();
  }

  /** The referee judges the challenge from the checked reveals: M:330-387 plus the forfeit rules of PORT.md 3a. */
  _ResolveContest(): void {
    if (!this.Networking.IsOwner(this.gameObject) || this.phase !== Phase.Revealing) return;
    const label = this.Label();
    const missing = new Array<boolean>(SEATS).fill(false);
    const values = new Array<number>(SEATS * DICE_PER_SEAT).fill(-1);
    const countAtStart = this.remaining.slice();
    for (let s = 0; s < SEATS; s++) {
      if (this.contestPlayers[s] === -1) continue;
      const draw = this.CheckedDraw(s, label);
      if (draw) {
        const dice = draw.Ints(countAtStart[s]!, 6);
        for (let k = 0; k < dice.length; k++) values[s * DICE_PER_SEAT + k] = dice[k]!;
      } else missing[s] = true;
    }
    const bidder = this.bidder;
    const challenger = this.challenger;
    // Anyone else who did not reveal valid dice is out, and their dice do not count (as a player who leaves, M:413).
    for (let s = 0; s < SEATS; s++) {
      if (!missing[s]) continue;
      this.resultOut[s] = true;
      if (s === bidder || s === challenger) continue;
      this.ForfeitSeat(s);
    }
    this.resultKind = 0;
    this.resultSum = 0;
    if (missing[bidder]) {
      this.resultKind = 1;
      this.resultLoser = bidder;
      this.resultEliminated = true;
      this.ForfeitSeat(bidder);
      // A challenger who also withheld is out as well (review finding 3): withholding never escapes the forfeit.
      if (missing[challenger] && challenger !== bidder) this.ForfeitSeat(challenger);
      this.postContestTurn = true;
      this.postContestTurnPlayer = challenger;
      this.currentDie = -1;
      this.currentMulti = 1;
      this.playingPlayer = bidder;
    } else if (missing[challenger]) {
      this.resultKind = 2;
      this.resultLoser = challenger;
      this.resultEliminated = true;
      this.ForfeitSeat(challenger);
      this.postContestTurn = true;
      this.postContestTurnPlayer = bidder;
      this.currentDie = -1;
      this.currentMulti = 1;
      this.playingPlayer = bidder;
    } else {
      const s: ContestState = {
        currentPlayers: this.currentPlayers,
        remaining: this.remaining,
        numJoinedPlayers: this.numJoinedPlayers,
        playingPlayer: this.playingPlayer,
        postContestTurnPlayer: this.postContestTurnPlayer,
        postContestTurn: this.postContestTurn,
        currentMulti: this.currentMulti,
        currentDie: this.currentDie,
        onesWild: this.onesWild,
        onesInvalid: this.onesInvalid,
        dieValues: values,
      };
      const outcome = playerContests(s);
      if (outcome.bidder !== bidder) this.Debug.LogWarning(`bidder seat ${outcome.bidder} differs from the one recorded at the challenge (${bidder})`);
      this.numJoinedPlayers = s.numJoinedPlayers;
      this.playingPlayer = s.playingPlayer;
      this.postContestTurnPlayer = s.postContestTurnPlayer;
      this.postContestTurn = s.postContestTurn;
      this.currentMulti = s.currentMulti;
      this.currentDie = s.currentDie;
      this.resultSum = outcome.sum;
      this.resultLoser = outcome.loser;
      this.resultEliminated = outcome.eliminated;
      for (let s2 = 0; s2 < SEATS; s2++) if (this.currentPlayers[s2] === -1) this.playerNames[s2] = "";
    }
    // What every die shows during the result.
    for (let i = 0; i < this.dieValues.length; i++) {
      const seat = Math.trunc(i / DICE_PER_SEAT);
      const k = i % DICE_PER_SEAT;
      if (this.contestPlayers[seat] === -1) this.dieValues[i] = FRAME_LOGO;
      else if (k + 1 > countAtStart[seat]!) this.dieValues[i] = FRAME_LOST;
      else if (missing[seat]) this.dieValues[i] = FRAME_UNKNOWN;
      else this.dieValues[i] = values[i]!;
    }
    this.phase = Phase.Result;
    this.contestSeq++;
    this.RequestSerialization();
    this.AllDeserialization();
    this.ContestSound();
  }

  /** A seat out of the game for not revealing: no dice left, seat freed (as an elimination, M:347-352). */
  private ForfeitSeat(seat: number): void {
    if (this.currentPlayers[seat] === -1) return;
    this.remaining[seat] = 0;
    this.currentPlayers[seat] = -1;
    this.playerNames[seat] = "";
    this.numJoinedPlayers--;
  }

  /** The seat's draw for this round if it was revealed and matches the pinned commitment; otherwise null. */
  private CheckedDraw(seat: number, label: string) {
    const id = this.contestPlayers[seat]!;
    if (id === -1 || this.currentPlayers[seat] !== id) return null;
    const player = this.Networking.GetPlayerById(id);
    if (!player) return null;
    const status = this.Secrets.drawOf(player.sid, label);
    return status.state === "revealed" ? status.draw : null;
  }

  private ReturnLastPlayer(lastPlayer: number): number {
    return returnLastPlayer(lastPlayer, this.currentPlayers);
  }

  /** Task 6. Port: only in the result phase (D06), only from a player seated at the challenge. */
  _ContinueGame(station: number, caller: Player): void {
    if (!this.Networking.IsOwner(this.gameObject)) return;
    if (this.phase !== Phase.Result || this.contestPlayers[station] !== caller.playerId) return;
    this._NewRound();
  }

  _MayContinue(station: number, playerId: number): boolean {
    return this.phase === Phase.Result && this.contestPlayers[station] === playerId;
  }

  DiceRollSound(): void {
    if (this.audioState && this.DiceRollSmallSfx !== null && this.DiceRollLargeSfx !== null && this.speaker !== null) {
      this.speaker.pitch = this.Random.Range(0.9, 1.1);
      const diceLeft = this.CountDiceLeft();
      if (diceLeft > 10) {
        this.speaker.clip = this.DiceRollLargeSfx;
        this.speaker.Play();
        this.sounds.push("roll large");
      } else if (diceLeft > 0) {
        this.speaker.clip = this.DiceRollSmallSfx;
        this.speaker.Play();
        this.sounds.push("roll small");
      }
    }
  }

  private ContestSound(): void {
    if (this.heardContest === this.contestSeq) return;
    this.heardContest = this.contestSeq;
    const liar = this.resultKind === 0 ? this.resultMulti > this.resultSum : this.resultKind === 1;
    if (liar) this.LiarFoundSound();
    else this.TruthFoundSound();
  }

  private LiarFoundSound(): void {
    if (this.audioState && this.LiarContestSfx !== null && this.speaker !== null) {
      this.speaker.clip = this.LiarContestSfx;
      this.speaker.Play();
      this.sounds.push("boo");
    }
  }

  private TruthFoundSound(): void {
    if (this.audioState && this.TruthContestSfx !== null && this.speaker !== null) {
      this.speaker.clip = this.TruthContestSfx;
      this.speaker.Play();
      this.sounds.push("cheer");
    }
  }
  // #endregion

  // #region player Involement logic (M:503-589)

  /** Task 1. Port: the seat must be free (two Joins on one station: the first wins, F05). */
  _AddPlayerToGame(player: Player, playerNum: number): void {
    this.Log("The player " + player.displayName + " has requested to join the game");
    if (this.Networking.IsOwner(this.gameObject) && player.IsValid() && !this.gameStarted) {
      if (!(playerNum >= 0 && playerNum < SEATS) || this.currentPlayers[playerNum] !== -1) return;
      for (const id of this.currentPlayers) {
        if (id === player.playerId) {
          this.Log(player.displayName + " is already in the game");
          this.RequestSerialization();
          this.AllDeserialization();
          return;
        }
      }
      this.Log("Adding " + player.displayName + " to the game");
      this.numJoinedPlayers++;
      this.currentPlayers[playerNum] = player.playerId;
      this.playerNames[playerNum] = player.displayName;
      this.playerUids[playerNum] = player.uid;
      this.RequestSerialization();
      this.AllDeserialization();
    }
  }

  /** Task 2: a seat given up in the lobby. Port: not during a game (that is task 7). */
  _RemovePlayerFromGame(player: Player): void {
    this.Log("The player " + player.displayName + " has requested to be removed from the game");
    if (this.Networking.IsOwner(this.gameObject) && player.IsValid() && !this.gameStarted) {
      for (let i = 0; i < this.currentPlayers.length; i++) {
        if (this.currentPlayers[i] === player.playerId) {
          this.Log("The player " + player.displayName + " is being removed from the game");
          this.currentPlayers[i] = -1;
          this.playerNames[i] = "";
          this.numJoinedPlayers--;
          this.playerHandles[i]!._LeaveSetter();
          this.RequestSerialization();
          this.AllDeserialization();
          return;
        }
      }
    }
  }

  /**
   * A seated player leaves the game (task 7, leaving the world, or not rolling in time). Takes the player id, not
   * the player: someone who has left the world is no longer a valid player (D11).
   */
  _PlayerLeft(playerId: number, serialize: boolean): void {
    if (!this.Networking.IsOwner(this.gameObject) || playerId < 0) return;
    for (let i = 0; i < this.currentPlayers.length; i++) {
      if (this.currentPlayers[i] !== playerId) continue;
      this.Log("The player " + this.playerNames[i] + " was in the game, but left the instance, removing them from the game");
      this.currentPlayers[i] = -1;
      this.playerNames[i] = "";
      this.numJoinedPlayers--;
      if (serialize) {
        // D04: in the lobby a departure only frees the seat (upstream ran NextTurn with no player to act).
        if (this.gameStarted) {
          if (this.phase === Phase.Bidding && this.playingPlayer === i) this.NextTurn();
          if (this.gameStarted && this.numJoinedPlayers < this.minPlayers) {
            this.numJoinedPlayers = 0;
            this.NextTurn();
          }
        }
        this.RequestSerialization();
        this.AllDeserialization();
      }
      break;
    }
  }

  override OnPlayerLeft(player: Player): void {
    // During a game the seat is held for `rejoin-grace` seconds (Reconcile): a page reload comes back as a new session
    // of the same user, whose dice the runtime restores. In the lobby a departure frees the seat at once (D04).
    if (this.gameStarted && this.rejoinGrace > 0) return;
    this._PlayerLeft(player.playerId, true);
  }
  // #endregion

  // #region the referee's round upkeep (port)

  /** The draw label of the current round: one fair draw per player per round. */
  Label(): string {
    return `${this.gameId}.${this.round}`;
  }

  override Update(): void {
    if (this.phase === Phase.Result) this.CheckIntegrity();
    else if (this.phase === Phase.Bidding || this.phase === Phase.Revealing) this.WatchVoidSeats();
    this.LocalDuties();
    if (!this.Networking.IsOwner(this.gameObject)) return;
    this.PublishDrawTable();
    this.Reconcile();
    if (this.phase === Phase.Rolling) this.CheckCommits();
    else if (this.phase === Phase.Revealing) this.CheckReveals();
  }

  override OnDrawChanged(_player: Player, _label: string, _state: DrawState): void {
    this.UpdateMesh();
    if (!this.Networking.IsOwner(this.gameObject)) return;
    if (this.phase === Phase.Rolling) this.CheckCommits();
    else if (this.phase === Phase.Revealing) this.CheckReveals();
  }

  /** Rolling: done when every seated player has a numbered draw; at the deadline the rest are removed. */
  private CheckCommits(): void {
    const label = this.Label();
    const late: number[] = [];
    for (let s = 0; s < SEATS; s++) {
      const id = this.currentPlayers[s]!;
      if (id === -1) continue;
      const player = this.Networking.GetPlayerById(id);
      const state = player ? this.Secrets.drawOf(player.sid, label).state : "none";
      if (state === "none" || state === "committed") late.push(id);
    }
    if (!late.length) {
      this._CommitsComplete();
      return;
    }
    if (this.Networking.GetServerTimeInSeconds() < this.deadline) return;
    for (const id of late) {
      if (!this.Networking.GetPlayerById(id)) continue; // gone: Reconcile holds the seat for a reload, then frees it
      this.Log(`player ${id} did not roll in time and is removed`);
      if (this.phase === Phase.Rolling) this._PlayerLeft(id, true);
    }
  }

  /** Revealing: done when every player seated at the challenge has revealed (or cannot), or at the deadline. */
  private CheckReveals(): void {
    const label = this.Label();
    let waiting = false;
    for (let s = 0; s < SEATS; s++) {
      const id = this.contestPlayers[s]!;
      if (id === -1 || this.currentPlayers[s] !== id) continue;
      const player = this.Networking.GetPlayerById(id);
      // A player who is gone may be reloading their page: wait for them until the reveal deadline.
      const state = player ? this.Secrets.drawOf(player.sid, label).state : this.rejoinGrace > 0 ? "committed" : "none";
      if (state === "numbered" || state === "committed") waiting = true;
    }
    if (waiting && this.Networking.GetServerTimeInSeconds() < this.deadline) return;
    this._ResolveContest();
  }

  /**
   * A seat whose player is no longer here. If the same user is back (a page reload: a new session, a new player id),
   * the seat, and their place in a challenge, move to the new player id; the runtime gives their dice back. Otherwise
   * the seat is freed after a few seconds in the lobby (OnPlayerLeft normally does that at once; this catches a
   * departure that happened while no referee was known) and after `rejoin-grace` seconds in a game.
   */
  private Reconcile(): void {
    const now = this.Time.time;
    if (now < 5) return;
    let moved = false;
    for (let s = 0; s < SEATS; s++) {
      const id = this.currentPlayers[s]!;
      if (id === -1 || this.Networking.GetPlayerById(id)) {
        this.absentSince[s] = -1;
        continue;
      }
      const back = this.playerUids[s] ? this.Networking.GetPlayers().find((p) => p.uid === this.playerUids[s] && !this.currentPlayers.includes(p.playerId)) : undefined;
      if (back && this.gameStarted) {
        this.Log(`${back.displayName} is back (player ${id} is now ${back.playerId}): the seat is kept`);
        this.currentPlayers[s] = back.playerId;
        if (this.contestPlayers[s] === id) this.contestPlayers[s] = back.playerId;
        this.playerNames[s] = back.displayName;
        this.absentSince[s] = -1;
        moved = true;
        continue;
      }
      if (this.absentSince[s]! < 0) this.absentSince[s] = now;
      else if (now - this.absentSince[s]! >= (this.gameStarted ? Math.max(3, this.rejoinGrace) : 3)) {
        this.absentSince[s] = -1;
        this._PlayerLeft(id, true);
      }
    }
    if (moved) {
      this.RequestSerialization();
      this.AllDeserialization();
    }
  }

  /** Every client: roll when a round opens, reveal when a challenge is made. */
  private LocalDuties(): void {
    if (!this.gameStarted) return;
    const me = this.LocalPlayerId();
    const label = this.Label();
    for (let s = 0; s < SEATS; s++) {
      if (this.phase === Phase.Rolling && this.currentPlayers[s] === me) this.playerHandles[s]!.RollOwnDice(label);
      if (this.phase === Phase.Revealing && this.contestPlayers[s] === me && this.currentPlayers[s] === me) this.playerHandles[s]!.RevealOwnDice(label);
    }
  }

  /** The local player's own dice this round, from their own draw; null when they have none (yet). */
  MyDice(seat: number): number[] | null {
    if (this.currentPlayers[seat] !== this.LocalPlayerId() || this.phase === Phase.Lobby) return null;
    const draw = this.Secrets.myDraw(this.Label());
    return draw ? draw.Ints(this.remaining[seat]!, 6) : null;
  }

  /**
   * Each client repeats the referee's judgement from what it can see itself (review finding 4): every seat's dice from
   * its revealed draw, with the dice count this page saw during the round (not the count the referee's `dieValues`
   * implies); a seat counted although its draw is rejected or forfeit here; a seat put out although its valid reveal is
   * here; the sum, the kind of result, the loser and the dice left. A mismatch is shown on the display. A page cannot
   * overrule the referee (there is no host and no vote); it can only tell its player.
   */
  private CheckIntegrity(): void {
    if (this.checkedContest === this.contestSeq) return;
    if (this.checkingContest !== this.contestSeq) {
      this.checkingContest = this.contestSeq;
      this.resultSeenAt = this.Time.time;
      this.integrity = "pending";
    }
    const late = this.Time.time - this.resultSeenAt >= 5; // reveals that have not arrived by now are not coming
    const label = this.Label();
    const sawRound = this.seenCounts !== null && this.seenCounts.round === label;
    const failures: string[] = [];
    let unverified = !sawRound;
    let waiting = false;
    const values = new Array<number>(SEATS * DICE_PER_SEAT).fill(-1);
    let complete = true;
    for (let s = 0; s < SEATS; s++) {
      const id = this.contestPlayers[s]!;
      if (id === -1) continue;
      const player = this.Networking.GetPlayerById(id);
      const status = player ? this.Secrets.drawOf(player.sid, label) : null;
      const state = status ? status.state : "none";
      const shown = this.dieValues.slice(s * DICE_PER_SEAT, (s + 1) * DICE_PER_SEAT);
      // The dice count: what this page saw while the round was played; a page that arrived after it can only work back
      // from the referee's `remaining` (the loser has one die fewer).
      const n = sawRound ? this.seenCounts!.counts[s]! : this.remaining[s]! + (this.resultKind === 0 && s === this.resultLoser ? 1 : 0);
      if (this.resultOut[s]) {
        if (shown.some((v) => v >= 0 && v <= 5)) failures.push(`seat ${s + 1} is out but its dice are shown`);
        if (state === "revealed") {
          if (late) failures.push(`seat ${s + 1} is out although its reveal is valid here`);
          else waiting = true; // the runtime's own forfeit mark may still be on its way
        }
        if (sawRound && this.remaining[s] !== 0) failures.push(`seat ${s + 1} is out but keeps ${this.remaining[s]} dice`);
        continue;
      }
      if (state === "rejected" || state === "forfeit") {
        failures.push(`seat ${s + 1} is counted although its draw is ${state} here`);
        continue;
      }
      if (state !== "revealed" || !status?.draw) {
        complete = false;
        if (late) unverified = true;
        else waiting = true;
        continue;
      }
      const dice = status.draw.Ints(n, 6);
      for (let k = 0; k < DICE_PER_SEAT; k++) {
        const expected = k < n ? dice[k]! : FRAME_LOST;
        if (shown[k] !== expected) {
          failures.push(`seat ${s + 1} die ${k + 1} shows ${shown[k]}, its reveal says ${expected}`);
          break;
        }
      }
      for (let k = 0; k < dice.length; k++) values[s * DICE_PER_SEAT + k] = dice[k]!;
      if (sawRound) {
        const left = this.resultKind === 0 && s === this.resultLoser ? n - 1 : n;
        if (this.remaining[s] !== left && !(left === 0 && this.remaining[s] === 0)) failures.push(`seat ${s + 1} has ${this.remaining[s]} dice left, not ${left}`);
      }
    }
    // The kind of result follows from who is out; the loser from the kind and the count.
    const bidderOut = this.bidder >= 0 && this.resultOut[this.bidder] === true;
    const challengerOut = this.challenger >= 0 && this.resultOut[this.challenger] === true;
    const kind = bidderOut ? 1 : challengerOut ? 2 : 0;
    if (kind !== this.resultKind) failures.push(`the result is of kind ${this.resultKind}, the seats out make it ${kind}`);
    if (complete && this.resultKind === 0) {
      let sum = 0;
      for (const v of values) if (v >= 0 && (v === this.resultDie || (this.resultWild && v === 0))) sum++;
      if (sum !== this.resultSum) failures.push(`the count is ${sum}, the referee wrote ${this.resultSum}`);
      const loser = this.resultMulti > sum ? this.bidder : this.challenger;
      if (loser !== this.resultLoser) failures.push(`the loser is seat ${loser + 1}, the referee wrote seat ${this.resultLoser + 1}`);
    } else if (this.resultKind !== 0 && this.resultLoser !== (this.resultKind === 1 ? this.bidder : this.challenger)) {
      failures.push(`the loser of a forfeit is seat ${this.resultLoser + 1}`);
    }
    if (failures.length) {
      this.integrity = "failed";
      this.Debug.LogWarning(`integrity: the result of challenge ${this.contestSeq} does not match what this page saw: ${failures.join("; ")}`);
    } else if (waiting) {
      return; // look again next tick
    } else {
      this.integrity = unverified || !complete ? "partial" : "ok";
    }
    this.checkedContest = this.contestSeq;
    this.UpdateText("Liar's Dice");
  }

  /** What this page sees of the round while it is played (for CheckIntegrity): each seat's dice count. */
  private SeeRound(): void {
    if (!this.gameStarted || (this.phase !== Phase.Rolling && this.phase !== Phase.Bidding && this.phase !== Phase.Revealing)) return;
    const counts = new Array<number>(SEATS).fill(0);
    for (let s = 0; s < SEATS; s++) if (this.currentPlayers[s] !== -1) counts[s] = Math.max(0, Math.min(DICE_PER_SEAT, this.remaining[s]!));
    this.seenCounts = { round: this.Label(), counts };
  }

  /**
   * True when the local player sits at `seat` and the draw of this round is gone for them: rejected or forfeit, or never
   * made on this page with no saved draw coming back (a reload on another device, or after the device forgot it). Their
   * dice will count for nothing and they are out at the challenge; the page tells them (review finding 2).
   */
  MyDiceLost(seat: number): boolean {
    if (!this.gameStarted || (this.phase !== Phase.Bidding && this.phase !== Phase.Revealing)) return false;
    if (this.currentPlayers[seat] !== this.LocalPlayerId()) return false;
    const label = this.Label();
    const state = this.Secrets.drawOf(this.Networking.LocalPlayer.sid, label).state;
    if (state === "rejected" || state === "forfeit") return true;
    return state === "none" && !this.Secrets.hasSavedDraw(label);
  }

  /** A seat whose dice this page shows as void during the round: the local player's lost draw, or a draw rejected here. */
  private SeatVoid(seat: number): boolean {
    if (!this.gameStarted || (this.phase !== Phase.Bidding && this.phase !== Phase.Revealing)) return false;
    const id = this.currentPlayers[seat]!;
    if (id === -1) return false;
    if (id === this.LocalPlayerId()) return this.MyDiceLost(seat);
    const player = this.Networking.GetPlayerById(id);
    if (!player) return false;
    const state = this.Secrets.drawOf(player.sid, this.Label()).state;
    return state === "rejected" || state === "forfeit";
  }

  /** Redraws dice and display when the set of void seats changes (draw states change without a state write). */
  private WatchVoidSeats(): void {
    let key = "";
    for (let s = 0; s < SEATS; s++) key += this.SeatVoid(s) ? "1" : "0";
    if (key === this.voidSeats) return;
    this.voidSeats = key;
    this.UpdateMesh();
    this.UpdateText("Liar's Dice");
  }

  /**
   * Workaround for a kit gap (reported; portkit `secrets.ts` officiate and `refrecord.ts`): a new referee carries on the
   * previous referee's number table but publishes it only when an entry changes. A page that starts in between (a
   * reload, typically of the referee that just left) reads an empty table: its saved draw cannot come back, and every
   * entry numbered before looks new to it, so a witnessed entry is judged as the referee's own and rejected. The game's
   * referee publishes the table it carries as soon as it is the referee. Remove once the kit does this itself.
   */
  private PublishDrawTable(): void {
    const secrets = this.Secrets as unknown as {
      numbers?: { working(): Record<string, unknown>; write(table: Record<string, unknown>): void };
      presence?: { localSid: string; extra(sid: string, name: string): unknown };
    };
    const numbers = secrets.numbers;
    const presence = secrets.presence;
    if (!numbers || !presence || presence.extra(presence.localSid, "fn") !== undefined) return;
    const table = numbers.working();
    if (Object.keys(table).length) numbers.write(table);
  }
  // #endregion

  // #region manual network update (M:591-795)

  _ReturnPlayerColor(player: string): string {
    // Upstream hashes with string.GetHashCode(), whose value VRChat does not publish: FNV-1a (32-bit, signed) here.
    const hash = parseInt(fnv1a(player), 16) | 0;
    const hc = Math.abs((hash % 1000) / 1000);
    const p = Color.HSVToRGB(hc, 1, 1);
    const r = Math.floor(Math.sqrt(p.r * 255));
    const g = Math.trunc(Math.sqrt(p.g * 255));
    const b = Math.trunc(Math.sqrt(p.b * 255));
    const X = (n: number) => n.toString(16).toUpperCase();
    const cu = X(r) + X(r) + X(g) + X(g) + X(b) + X(b);
    return "<color=#" + cu + ">" + player;
  }

  override OnDeserialization(result: DeserializationResult): void {
    // Sounds of a challenge play on the change, never from a snapshot (D14).
    if (result.isSnapshot) this.heardContest = this.contestSeq;
    this.AllDeserialization();
    if (this.phase === Phase.Result) this.ContestSound();
  }

  AllDeserialization(): void {
    this.Log(
      "Joined amount is " + this.numJoinedPlayers + ", Playing Player is " + this.playingPlayer + ", Multi is " + this.currentMulti + ", the die is " + this.currentDie,
    );
    this.onesWildStateVisual?.SetActive(this.onesWild);
    if (this.Networking.IsOwner(this.gameObject)) this.SetOnesWild();
    this.diceLeft = this.CountDiceLeft(); // D07: counted before the panels use it
    this.SeeRound();
    this.UpdateUIState();
    this.UpdateText("Liar's Dice");
    this.UpdateMesh();
    this.LocalDuties();
  }

  /** M:635-648, on the owner only: onesInvalid is synced here. */
  private SetOnesWild(): void {
    if (this.onesWild) {
      if (this.currentDie === 0) this.onesInvalid = true;
      else if (this.currentDie === -1) this.onesInvalid = false; // reset validity since -1 means a new turn
    }
  }

  /** Dice in play: seated players' remaining dice (what UpdateMesh counted as diceLeft, M:771-784). */
  CountDiceLeft(): number {
    let n = 0;
    for (let s = 0; s < SEATS; s++) if (this.currentPlayers[s] !== -1) n += Math.max(0, Math.min(DICE_PER_SEAT, this.remaining[s]!));
    return n;
  }

  private UpdateUIState(): void {
    let included = false;
    const me = this.LocalPlayerId();
    for (let i = 0; i < this.currentPlayers.length; i++) {
      const pH = this.playerHandles[i]!;
      pH._ContinueState(false);
      if (this.currentPlayers[i] !== -1) {
        pH._StartState(!this.gameStarted && this.numJoinedPlayers >= this.minPlayers); // D08: hidden again below two
        pH._SetOwner(this.currentPlayers[i]!);
        pH._SetPlayerNameUI();
        if (this.currentPlayers[i] === me) included = true;
        if (this.gameStarted) {
          pH._isInGame();
          if (this.phase === Phase.Bidding && i === this.playingPlayer) pH._TurnStart(this.currentMulti, this.currentDie, this.diceLeft, this.onesWild && !this.onesInvalid);
          else pH._NotActive();
        }
      } else {
        pH._LeaveSetter();
        pH._StartState(false);
        pH._ClearPlayerNameUI();
      }
      if (this.gameStarted) pH._GameStarted();
      // F38: Continue on every station that was seated at the challenge (upstream: CalcSumShowDice, M:409-412).
      if (this.phase === Phase.Result && this.contestPlayers[i] !== -1) pH._ContinueState(true);
    }
    this.canInteract = included;
  }

  /** The display text for the state (M:697-753, and the challenge lines of M:342-372). */
  DisplayText(listPlayers: string): string {
    const name = (seatName: string) => this._ReturnPlayerColor(seatName);
    const onesLine = () => (this.onesWild ? (!this.onesInvalid ? "\nOnes are Wild" : "\n<s>Ones are Wild</s>") : "");
    let text = "";
    if (!this.gameStarted) text = listPlayers;
    if (this.gameStarted && this.phase === Phase.Rolling) {
      text = "Rolling the dice";
    } else if (this.gameStarted && this.phase === Phase.Revealing) {
      text = name(this.resultNames[this.bidder] ?? "") + this.white + "'s bid is called:\n " + bidLine(this.resultMulti, this.resultDie) + "\nShowing dice";
    } else if (this.gameStarted && this.phase === Phase.Result) {
      text = this.ContestText();
    } else if (this.gameStarted && this.currentDie > -1) {
      text = "";
      if (this.playingPlayer !== -1) text = name(this.playerNames[this.playingPlayer]!) + "'s" + this.white + " turn\n";
      text += bidLine(this.currentMulti, this.currentDie);
      text += onesLine();
    } else if (this.gameStarted && this.playingPlayer !== -1) {
      text = name(this.playerNames[this.playingPlayer]!) + "\n " + this.white + "starts the round";
      text += onesLine();
    }
    if (!this.gameStarted && this.lastWinner !== -1) text = name(this.lastWinnerName) + this.white + " is the Winner";
    // Port lines, for this page only: its player's dice are gone (review finding 2), or the result fails its check (finding 4).
    const me = this.LocalPlayerId();
    for (let s = 0; s < SEATS; s++) {
      if (this.currentPlayers[s] === me && this.MyDiceLost(s)) text += "\n<color=#FF6060>Your dice did not come back with the reload:\nyou are out at the challenge</color>";
    }
    if (this.gameStarted && this.phase === Phase.Result && this.integrity === "failed") text += "\n<color=#FF6060>Check failed: this result does not match the dice shown</color>";
    return text;
  }

  /** The challenge result as upstream words it (M:342, M:358, M:372, M:442, M:450); forfeits are new lines. */
  ContestText(): string {
    const name = (seat: number) => this._ReturnPlayerColor(this.resultNames[seat] ?? "");
    const bid = bidLine(this.resultMulti, this.resultDie);
    let text: string;
    if (this.resultKind === 0) {
      const liar = this.resultMulti > this.resultSum;
      text = name(this.bidder) + this.white + (liar ? " is a liar:\n Bid: " : " is not a liar:\n Bid: ");
      text += this.resultMulti + " X " + (this.resultDie + 1) + " die\n Actual " + this.resultSum + " X " + (this.resultDie + 1) + " die";
      text += "\n" + name(this.resultLoser) + this.white + (this.resultEliminated ? " has been eliminated" : " losses a dice");
    } else {
      text = name(this.resultLoser) + this.white + " did not show their dice:\n Bid: " + bid + "\n" + name(this.resultLoser) + this.white + " has been eliminated";
    }
    for (let s = 0; s < SEATS; s++) {
      if (this.resultOut[s] && s !== this.resultLoser) text += "\n" + name(s) + this.white + " did not show their dice and has been eliminated";
    }
    return text;
  }

  private UpdateText(listPlayers: string): void {
    const text = this.DisplayText(listPlayers);
    if (text !== this.displayText.text) this.shown.push(text);
    this.displayText.text = text;
  }

  /** The frame each die shows on this client, and whether it is tinted cyan (M:755-792, M:420-431). */
  DieFrames(): Array<{ frame: number; cyan: boolean }> {
    const out: Array<{ frame: number; cyan: boolean }> = [];
    const mine = new Map<number, number[] | null>();
    const voids = new Map<number, boolean>();
    for (let i = 0; i < this.dieValues.length; i++) {
      const playerNum = Math.trunc(i / DICE_PER_SEAT);
      if (this.phase === Phase.Result && this.gameStarted) {
        const v = this.dieValues[i]!;
        const counts = v >= 0 && v <= 5 && (v === this.resultDie || (this.resultWild && v === 0));
        out.push({ frame: v < 0 ? FRAME_LOGO : v, cyan: this.resultKind === 0 && counts });
        continue;
      }
      if (this.currentPlayers[playerNum] === -1) {
        out.push({ frame: FRAME_LOGO, cyan: false }); // logo value in flipbook
        continue;
      }
      if ((i % DICE_PER_SEAT) + 1 <= this.remaining[playerNum]!) {
        if (!voids.has(playerNum)) voids.set(playerNum, this.SeatVoid(playerNum));
        if (voids.get(playerNum)) {
          out.push({ frame: FRAME_LOST, cyan: false }); // a void draw: these dice count for nothing (review finding 2)
          continue;
        }
        if (!mine.has(playerNum)) mine.set(playerNum, this.gameStarted ? this.MyDice(playerNum) : null);
        const dice = mine.get(playerNum);
        out.push({ frame: dice ? dice[i % DICE_PER_SEAT]! : FRAME_UNKNOWN, cyan: false });
      } else {
        out.push({ frame: FRAME_LOST, cyan: false }); // elimanated value in flipbook
      }
    }
    return out;
  }

  UpdateMesh(): void {
    const frames = this.DieFrames();
    for (let i = 0; i < frames.length; i++) {
      const mesh = this.diceMesh[i];
      if (!mesh) continue;
      mesh.SetColor(frames[i]!.cyan ? Color.cyan : Color.white, "_Color");
      mesh.SetFloat(this.materialFloatName, frames[i]!.frame);
    }
  }
  // #endregion

  private LocalPlayerId(): number {
    try {
      return this.Networking.LocalPlayer.playerId;
    } catch {
      return -2;
    }
  }

  private NewGameId(): string {
    const part = () => Math.floor(this.Random.value * 0x100000000).toString(16).padStart(8, "0");
    return part() + part();
  }

  private Log(message: string): void {
    if (!this.logging) return;
    this.Debug.Log("-" + this.Time.time.toFixed(2) + "-" + this.gameObject.name + "- " + message);
  }
}

/** The raise rule of the Submit button (P:495-497): a face is picked, and the quantity or the face goes up. */
export function bidAccepted(multiNum: number, min: number, dieNumber: number, prevDieNumber: number): boolean {
  if (dieNumber < 0) return false;
  return multiNum > min || dieNumber > prevDieNumber;
}

function numberSetting(text: string | undefined, fallback: number): number {
  if (text === undefined || text.trim() === "") return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}
