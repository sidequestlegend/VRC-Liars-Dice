// PlayerHandle.cs (akalink/VRC-Liars-Dice, MIT, Copyright (c) 2022 Garrett McPherson), translated for the
// portkit runtime. Line references `P:<n>` are to the upstream file.
//
// "This script handles all the logic for the individual "station" that player interacts from. In simplest terms,
// this script handles the UI for the player." (P:11-18)
//
// What differs from upstream:
//   - `task` was a synced field read back as a command by every client (P:24, P:645-690). It is a numbered
//     command to the referee now (SendCommand "Task"): run once, in order, never replayed to a late arrival
//     (D14), and the referee checks who sent it. So the station has no synced fields and no owner of its own;
//     `owner` is the player the master has in this seat.
//   - The VR collider juggling (P:93-172) is gone: every button is clicked (FingerTrigger.ts).
//   - Button colours go through the relay's uiColor op; the 30-frame lockout is 0.5 s.
//   - The station rolls and reveals its player's dice (RollOwnDice, RevealOwnDice: PORT.md section 3a).

import { type AudioClipRef, type AudioSourceRef, Behaviour, Color, type GameObject, type Player, type TextRef } from "../portkit/src/index.ts";
import type { LiarsDiceMaster } from "./LiarsDiceMaster.ts";

/** Task numbers (P:24). */
export const Task = { Claim: 1, Leave: 2, Bid: 3, Contest: 4, Start: 5, Continue: 6, LeaveGame: 7 } as const;

export type ButtonColor = "white" | "cyan" | "gray";

/**
 * HighLightButton (P:371-414): the colour of the six face buttons and of +, -, Submit and Call it, as a pure
 * function for the golden vectors.
 */
export function highlightColors(
  num: number,
  multiNum: number,
  min: number,
  max: number,
  dieNumber: number,
  prevDieNumber: number,
  firstTurnFlag: number,
): { faces: ButtonColor[]; others: ButtonColor[] } {
  const faces: ButtonColor[] = [];
  for (let i = 0; i < 6; i++) {
    let c: ButtonColor = i === num ? "cyan" : "white"; // if i and num are equal, assign the color cyan, if not use white
    c = 6 === num ? "gray" : c; // greys out every number if 6, which means not your turn.
    faces.push(c);
  }
  const others: ButtonColor[] = [];
  for (let i = 0; i < 4; i++) {
    // 0 = +, 1 = -, 2 = submit, 3 = call it
    let c: ButtonColor = num < 6 ? "white" : "gray";
    switch (i) {
      case 0:
        if (multiNum >= max) c = "gray";
        break;
      case 1:
        if (multiNum <= min) c = "gray";
        break;
      case 2:
        if (!(multiNum > min || dieNumber > prevDieNumber) || dieNumber === -1) c = "gray";
        break;
      default:
        if (firstTurnFlag < 0) c = "gray";
        break;
    }
    others.push(c);
  }
  return { faces, others };
}

const COLORS: Record<ButtonColor, () => Color> = { white: () => Color.white, cyan: () => Color.cyan, gray: () => Color.gray };

export class PlayerHandle extends Behaviour {
  /** Reached by SendCommand (the runtime refuses any other name from the network). */
  static override networkCallable = ["Task"];

  // #region Instance Variables (P:22-73)
  private stationNum = 0;
  /** The player seated here, as the master says (upstream: the station's own owner variable). */
  owner: Player | null = null;
  diceMaster!: LiarsDiceMaster;
  multiNum = 1;
  min = 1;
  max = 20;
  dieNumber = 6;
  prevDieNumber = 6;
  yourTurn = false;
  firstTurnFlag = -1;
  private interactDelay = true;

  numButtons: GameObject[] = [];
  otherButtons: GameObject[] = [];
  numberDisplay: TextRef | null = null;
  playerNameDisplay: TextRef | null = null;
  joinUi!: GameObject;
  leaveUi!: GameObject;
  startUi!: GameObject;
  continueUi!: GameObject;
  preGameUi!: GameObject;
  inGameUi!: GameObject;
  wildIconUi!: GameObject;

  speaker: AudioSourceRef | null = null;
  localSelectionSfx: AudioClipRef | null = null;
  altSelectionSfx: AudioClipRef | null = null;
  turnNotificationSfx: AudioClipRef | null = null;
  private audioState = true;
  // #endregion

  /** The colours this client last gave the buttons (for tests): faces, then +, -, Submit, Call it. */
  colors: { faces: ButtonColor[]; others: ButtonColor[] } = { faces: [], others: [] };
  /** Port: the draw label this client has rolled and revealed for its player. */
  rolledLabel = "";
  revealedLabel = "";
  /** Local sounds, by name (for tests). */
  readonly sounds: string[] = [];

  // #region Set Logic (P:79-234)
  private startedAt = 0;

  override Start(): void {
    this.startedAt = this.Time.time;
    this.NumberCalc(0);
  }

  _SetAudioState(state: boolean): void {
    this.audioState = state;
  }

  _SetVolume(f: number): void {
    if (this.speaker) this.speaker.volume = f;
  }

  _SetPlayerNameUI(): void {
    const name = this.diceMaster.playerNames[this.stationNum] ?? "";
    if (this.playerNameDisplay) this.playerNameDisplay.text = this.diceMaster._ReturnPlayerColor(name);
  }

  _ClearPlayerNameUI(): void {
    if (this.playerNameDisplay) this.playerNameDisplay.text = "";
  }

  _SetPlayerNumber(num: number): void {
    this.stationNum = num;
  }

  _GetPlayerNumber(): number {
    return this.stationNum;
  }

  _SetOwner(id: number): void {
    const player = this.Networking.GetPlayerById(id);
    if (this.owner !== null && player !== null && this.owner.playerId === player.playerId) return;
    this.owner = player;
    this.joinUi.SetActive(false);
    this.leaveUi.SetActive(true);
  }

  _LeaveSetter(): void {
    this.owner = null;
    this.joinUi.SetActive(true);
    this.leaveUi.SetActive(false);
    this.preGameUi.SetActive(true);
    this.inGameUi.SetActive(false);
  }

  _GameStarted(): void {
    this.joinUi.SetActive(false);
  }
  // #endregion

  // #region UI display logic (P:236-254)
  _StartState(state: boolean): void {
    this.startUi.SetActive(state);
  }

  _ContinueState(state: boolean): void {
    this.continueUi.SetActive(state);
    if (state) this.inGameUi.SetActive(false);
  }
  // #endregion

  // #region turn display logic (P:256-362)
  _isInGame(): void {
    this.inGameUi.SetActive(true);
    this.preGameUi.SetActive(false);
  }

  _NotInGame(): void {
    this.inGameUi.SetActive(false);
    this.preGameUi.SetActive(true);
  }

  _TurnStart(multi: number, die: number, remainder: number, onesWild: boolean): void {
    this.TurnNotificationSound();
    this.firstTurnFlag = die; // flag that die is -1
    this.wildIconUi.SetActive(onesWild);
    this.yourTurn = true;
    this.min = multi;
    this.multiNum = multi;
    this.max = remainder;
    this.UpdateMultiDisplay();
    this.dieNumber = die;
    this.prevDieNumber = die;
    this.HighLightButton(die);
  }

  _NotActive(): void {
    this.yourTurn = false;
    this.HighLightButton(6);
  }

  _EndGame(): void {
    this.yourTurn = false;
    this.HighLightButton(6);
    this.owner = null;
    this._NotInGame();
  }

  private IsLocalOwner(): boolean {
    return this.owner !== null && this.owner.playerId === this.Networking.LocalPlayer.playerId;
  }

  private _LocalClickSound(f: number): void {
    if (this.audioState && this.localSelectionSfx !== null && this.speaker !== null) {
      this.speaker.pitch = f;
      this.speaker.clip = this.localSelectionSfx;
      this.speaker.Play();
      this.sounds.push(`click ${f}`);
    }
  }

  _DepressedClickSoundAll(): void {
    this._LocalClickSound(0.7);
  }

  _DepressedClickSoundOwner(): void {
    if (this.IsLocalOwner()) this._LocalClickSound(0.7);
  }

  _DepressedClickSoundOwnerTurn(): void {
    if (this.IsLocalOwner() && this.yourTurn) this._LocalClickSound(0.7);
  }

  private _AltClickSound(f: number): void {
    if (this.audioState && this.altSelectionSfx !== null && this.speaker !== null) {
      this.speaker.pitch = f;
      this.speaker.clip = this.altSelectionSfx;
      this.speaker.Play();
      this.sounds.push(`alt ${Math.round(f * 100) / 100}`);
    }
  }

  _DepressedAltClickSoundAll(): void {
    this._AltClickSound(0.7);
  }

  _DepressedAltClickSoundOwnerTurn(): void {
    if (this.IsLocalOwner() && this.yourTurn) this._AltClickSound(0.7);
  }

  private TurnNotificationSound(): void {
    if (this.audioState && this.IsLocalOwner() && this.turnNotificationSfx !== null && this.speaker !== null) {
      this.speaker.pitch = 1;
      this.speaker.clip = this.turnNotificationSfx;
      this.speaker.Play();
      this.sounds.push("chime");
    }
  }
  // #endregion

  // #region panel visual update methods (P:364-426)
  private UpdateMultiDisplay(): void {
    if (this.numberDisplay) this.numberDisplay.text = String(this.multiNum);
  }

  private HighLightButton(num: number): void {
    this.colors = highlightColors(num, this.multiNum, this.min, this.max, this.dieNumber, this.prevDieNumber, this.firstTurnFlag);
    for (let i = 0; i < this.numButtons.length; i++) this.Host.uiColor(this.numButtons[i]!.key, COLORS[this.colors.faces[i]!]());
    for (let i = 0; i < this.otherButtons.length; i++) this.Host.uiColor(this.otherButtons[i]!.key, COLORS[this.colors.others[i]!]());
  }

  private NumberCalc(num: number): void {
    if (this.multiNum + num >= this.min && this.multiNum + num <= this.max) {
      this.multiNum += num;
      if (this.yourTurn) this._AltClickSound(this.multiNum / 10 + 0.9);
      this.UpdateMultiDisplay();
      this.HighLightButton(this.dieNumber);
    }
  }
  // #endregion

  // #region buttonInteracts (P:428-636)
  _InteractionDelay(): void {
    this.interactDelay = true;
  }

  /** Upstream: SendCustomEventDelayedFrames(_InteractionDelay, 30). */
  private Lockout(): void {
    this.interactDelay = false;
    this.SendCustomEventDelayedSeconds("_InteractionDelay", 0.5);
  }

  _StartGame(): void {
    if (this.interactDelay && this.IsLocalOwner() && this.diceMaster._GetCanInteract() && this.diceMaster._GetNumJoinedPlayers() >= this.diceMaster._GetMinPlayers()) {
      if (this.yourTurn) this._LocalClickSound(1);
      this.Lockout();
      this._StartState(false);
      this.SendTask(Task.Start);
    }
  }

  _RequestToLeaveGame(): void {
    this.SendTask(Task.LeaveGame);
  }

  _Join(): void {
    if (this.interactDelay && this.owner === null && !this.diceMaster._GetGameStarted()) {
      this.Lockout();
      this._LocalClickSound(1.1);
      this.SendTask(Task.Claim);
    }
  }

  _Leave(): void {
    if (this.interactDelay && this.IsLocalOwner()) {
      this.Lockout();
      this._LocalClickSound(0.9);
      this.SendTask(Task.Leave);
    }
  }

  _Rules(): void {
    this.diceMaster._ShowRules();
    this._LocalClickSound(0.8);
  }

  _Submit(): void {
    if (this.interactDelay && this.IsLocalOwner() && this.yourTurn) {
      if (this.dieNumber < 0) return;
      if (this.multiNum > this.min || this.dieNumber > this.prevDieNumber) {
        // disable button
        this.Host.uiColor(this.otherButtons[2]!.key, Color.gray);
        this.colors.others[2] = "gray";
        this.Lockout();
        this._LocalClickSound(1.1);
        this.SendTask(Task.Bid);
      }
    }
  }

  _Contest(): void {
    // Call it button
    if (this.interactDelay && this.IsLocalOwner() && this.yourTurn && this.firstTurnFlag > -1) {
      this.Lockout();
      this._LocalClickSound(0.9);
      this.yourTurn = false;
      this.SendTask(Task.Contest);
    }
  }

  _ContinueGame(): void {
    // F38: any player seated at the challenge, including one who was just eliminated.
    if (this.interactDelay && this.diceMaster._MayContinue(this.stationNum, this.Networking.LocalPlayer.playerId)) {
      if (this.yourTurn) this._LocalClickSound(1);
      this.Lockout();
      this.continueUi.SetActive(false);
      this.SendTask(Task.Continue);
    }
  }

  _Add(): void {
    if (this.IsLocalOwner() && this.yourTurn) this.NumberCalc(1);
  }

  _Subtract(): void {
    if (this.IsLocalOwner() && this.yourTurn) this.NumberCalc(-1);
  }

  // #region number buttons
  private Choose(die: number): void {
    if (this.IsLocalOwner() && this.yourTurn) {
      this._AltClickSound(1 + die / 10);
      this.dieNumber = die;
      this.HighLightButton(die);
    }
  }
  _ChooseOne(): void {
    this.Choose(0);
  }
  _ChooseTwo(): void {
    this.Choose(1);
  }
  _ChooseThree(): void {
    this.Choose(2);
  }
  _ChooseFour(): void {
    this.Choose(3);
  }
  _ChooseFive(): void {
    this.Choose(4);
  }
  _ChooseSix(): void {
    this.Choose(5);
  }
  // #endregion
  // #endregion

  // #region synching (P:638-692)

  /** Port: `task = n; RequestSerialization();` becomes one numbered command to the referee. */
  private SendTask(task: number): void {
    this.SendCommand("Task", task, this.multiNum, this.dieNumber);
  }

  /** Runs on the referee only, once per command (upstream: the switch of AllDeserializtaion, P:645-690). */
  Task(task: number, multiNum: number, dieNumber: number): void {
    const caller = this.Networking.CallingPlayer;
    if (!caller) return;
    switch (task) {
      case Task.Claim: // claim station for yourself
        this.diceMaster._AddPlayerToGame(caller, this.stationNum);
        break;
      case Task.Leave: // leave station
        if (this.diceMaster.currentPlayers[this.stationNum] === caller.playerId) this.diceMaster._RemovePlayerFromGame(caller);
        break;
      case Task.Bid: // sends the bid to master
        this.diceMaster._ReceiveBid(multiNum, dieNumber, this.stationNum, caller);
        break;
      case Task.Contest: // contests bid
        this.diceMaster._PlayerContests(this.stationNum, caller);
        break;
      case Task.Start: // starts the game
        this.diceMaster._InitializeGame(this.stationNum, caller);
        break;
      case Task.Continue: // continues the game
        this.diceMaster._ContinueGame(this.stationNum, caller);
        break;
      case Task.LeaveGame: // leave playing game
        if (this.diceMaster.currentPlayers[this.stationNum] === caller.playerId) this.diceMaster._PlayerLeft(caller.playerId, true);
        break;
    }
  }
  // #endregion

  // #region the station's player rolls and reveals (port, PORT.md section 3a)

  /**
   * A fair self-roll: commit to a secret now; the referee's number turns it into dice. Once per round. A page that has
   * just been reloaded first gives the runtime a moment to bring back the draw this device saved for the round.
   */
  RollOwnDice(label: string): void {
    if (this.rolledLabel === label) return;
    if (this.Secrets.drawOf(this.Networking.LocalPlayer.sid, label).state !== "none") {
      this.rolledLabel = label; // already drawn (restored after a reload)
      return;
    }
    if (this.Time.time - this.startedAt < 3) return;
    this.rolledLabel = label;
    this.Secrets.beginDraw(label);
  }

  /** Publish the secret so everyone can check it and see the dice. Once per round (once the draw is known here). */
  RevealOwnDice(label: string): void {
    if (this.revealedLabel === label) return;
    if (!this.Secrets.myDraw(label)) return;
    this.revealedLabel = label;
    this.Secrets.revealDraw(label);
  }
  // #endregion
}
