// Rungs 3 and 4: the liar's dice table in editor Play mode, driven through the SDK's desktop player with the port kit's
// input (InputSim: a mouse of the test's own; the SDK casts its own rays and raises the clicks itself), and checked in
// Unity with the kit's probe command. Not part of the snippet: the test page loads it before the snippet.
//
// window.__ldPlan: "single" (one player, min-players="1": take a station, start, bid through the panel, read the bid
// display, call it) or "multi" (two Local Multiplayer players: a full round with a challenge; each sees only their own
// dice before it, both see the same dice after; the second player reloads its page during the result and comes back to
// its seat; state digests match at equal versions).
(function () {
  "use strict";
  const KEY = "liars-dice:0";
  const HOLDER = "pk1:liars-dice:0";
  const PHASE = { Lobby: 0, Rolling: 1, Bidding: 2, Revealing: 3, Result: 4 };
  const FACES = ["one", "two", "three", "four", "five", "six"];
  const say = (kind, what, detail) => console.log("PKTEST " + kind + " " + what + (detail !== undefined ? ": " + detail : ""));
  let passed = 0;
  let failed = 0;
  const check = (ok, what, detail) => {
    if (ok) passed++;
    else failed++;
    say(ok ? "PASS" : "FAIL", what, detail);
    return ok;
  };
  const replies = new Map();
  let count = 0;
  window.__pktest = Object.assign(window.__pktest || {}, {
    reply(id, text) {
      const resolve = replies.get(id);
      if (resolve) {
        replies.delete(id);
        resolve(text);
      }
    },
  });
  const cmd = (line, ms) =>
    new Promise((resolve) => {
      const id = "k" + ++count;
      replies.set(id, resolve);
      console.log("PKTEST CMD " + id + " " + line);
      setTimeout(() => {
        if (replies.delete(id)) resolve("error: no reply");
      }, ms || 30000);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(test, ms, step) {
    const end = Date.now() + ms;
    for (;;) {
      let value = false;
      try {
        value = test();
      } catch (e) {
        value = false;
      }
      if (value) return value;
      if (Date.now() > end) return false;
      await sleep(step || 100);
    }
  }
  const debug = () => window.__pk1 && window.__pk1.debug && window.__pk1.debug[KEY];
  const table = () => debug().table();
  const path = (key) => debug().pathOf(key).replace(/ /g, "%20");
  const probe = (what, key, extra) => cmd("probe " + HOLDER + " " + what + " " + path(key) + (extra ? " " + extra : ""));
  /** Probes until the answer passes `ok` (a relay op lands in Unity a tick or two after the page's state changes). */
  async function probeUntil(what, key, extra, ok, ms) {
    const end = Date.now() + (ms || 5000);
    for (;;) {
      const v = await probe(what, key, extra);
      if (ok(v) || Date.now() > end) return v;
      await sleep(150);
    }
  }
  const plain = (t) => String(t).replace(/<\/?color[^>]*>/g, "").replace(/<\/?s>/g, "").replace(/<\/?b>/g, "");

  /** A click on a kit object through the desktop player: look at it, point the test's mouse at it, click. */
  async function clickKey(key, what) {
    const pos = await probe("pos", key);
    await cmd("look " + pos);
    const r = await cmd("click " + pos);
    say("INFO", "click " + what, r);
    return r.startsWith("ok");
  }

  /** The station button `name` (join, start, submit, callIt, plus, one..six ...) of seat s, clicked on its selector. */
  const press = (seat, name) => clickKey(`p${seat + 1}_${name}_sel`, `p${seat + 1} ${name}`);

  /** What the 5 dice of a seat show in Unity: the _frame each renderer's material has, set by the relay's matFloat op. */
  async function unityFrames(seat) {
    const out = [];
    for (let k = 0; k < 5; k++) out.push(Math.round(Number(await probe("matfloat", `p${seat + 1}_die${k}`, "_frame"))));
    return out;
  }

  /** unityFrames, again until it equals `want` (the relay lands a tick or two after the page's state), up to `ms`. */
  async function framesUntil(seat, want, ms) {
    const end = Date.now() + (ms || 5000);
    for (;;) {
      const f = await unityFrames(seat);
      if (JSON.stringify(f) === JSON.stringify(want) || Date.now() > end) return f;
      await sleep(200);
    }
  }

  async function waitStarted(back) {
    const ok = await until(() => debug() && debug().table, 120000, 250);
    check(!!ok, "the kit loads from a hand-written bs-snippet and the instance starts", ok ? "" : "no debug hooks after 120 s");
    if (!ok) return false;
    const exists = await probe("exists", "billboard");
    await until(() => table().display !== "", 10000, 200);
    const shown = await probe("text", "display");
    if (back) check(exists === "True", "the kit is in the scene again", `holder ${exists}`);
    else
      check(exists === "True" && plain(shown) === "Liar's Dice" && (await probe("active", "p1_join")) === "True",
        "the kit is in the scene: the centre display (relay op text) reads Liar's Dice and Join shows", `holder ${exists}, display '${plain(shown)}'`);
    return true;
  }

  /** The seat to act bids `multi` X `face` (0..5) through its panel: face button, + until there, Submit. */
  async function bidThroughPanel(seat, multi, face) {
    await press(seat, FACES[face]);
    await until(() => debug().panel(seat).dieNumber === face, 4000);
    const colour = await probeUntil("uicolor", `p${seat + 1}_${FACES[face]}`, "", (v) => v === "0.000 1.000 1.000 1.000");
    check(colour === "0.000 1.000 1.000 1.000", `the picked face button turns cyan (relay op uiColor), seat ${seat + 1}`, colour);
    while (debug().panel(seat).multiNum < multi) {
      const before = debug().panel(seat).multiNum;
      await press(seat, "plus");
      if (!(await until(() => debug().panel(seat).multiNum > before, 4000))) break;
    }
    const number = await probeUntil("text", `p${seat + 1}_number`, "", (v) => v === String(multi));
    check(number === String(multi), `the quantity on the panel reads ${multi}`, number);
    await sleep(600); // the panel's 0.5 s lockout after the last press of another button
    await press(seat, "submit");
    return until(() => table().multi === multi && table().die === face, 8000, 200);
  }

  // ---- one player --------------------------------------------------------------------------------------------
  async function single() {
    if (!(await waitStarted())) return;
    // The kit builder no longer blanks upstream's placeholder texts ("name", "MehStrongBadMeh ..."): the page's first ""
    // must reach Unity by itself (portkit f3eaaa1, a TextRef starts unknown).
    const emptyName = await probeUntil("text", "p2_name", "", (v) => v === "");
    const rulesLine = await probeUntil("text", "rules", "", (v) => v === "");
    check(emptyName === "" && rulesLine === "", "the page clears upstream's placeholder texts by itself (an empty station's name, the rules line)", `'${emptyName}', '${rulesLine}'`);
    await sleep(2500);
    const me = debug().me();
    await press(0, "join");
    await until(() => table().seats[0] === me.id, 8000);
    check(table().seats[0] === me.id, "Join (a click on the station's selector) seats the player", JSON.stringify(table().seats));
    const name = plain(await probeUntil("text", "p1_name", "", (v) => plain(v) === me.name));
    check(name === me.name, "the station shows the player's name (relay op text, colour tag)", name);
    check((await probeUntil("active", "p1_join", "", (v) => v === "False")) === "False" && (await probeUntil("active", "p1_leave", "", (v) => v === "True")) === "True", "Join gives way to Leave Game", "");
    await sleep(800);
    check((await probe("active", "p1_start")) === "True", "Start Game shows (min-players 1)", "");
    await sleep(600);
    await press(0, "start");
    const bidding = await until(() => table().phase === PHASE.Bidding, 30000, 200);
    check(!!bidding && table().playing === 0, "Start Game: the dice are rolled (fair draw) and station 1 opens the bidding", `phase ${table().phase}, playing ${table().playing}`);
    const dice = debug().myDice(0);
    const frames = await framesUntil(0, dice);
    check(!!dice && JSON.stringify(frames) === JSON.stringify(dice), "the player's own dice show their faces in Unity (relay op matFloat, URP flipbook shader)", `dice ${JSON.stringify(dice)}, frames ${JSON.stringify(frames)}`);
    const empty = await framesUntil(2, [8, 8, 8, 8, 8]);
    check(empty.every((f) => f === 8), "the dice of an empty station show the logo", JSON.stringify(empty));
    const opening = plain(await probeUntil("text", "display", "", (v) => plain(v).includes("starts the round")));
    check(opening === `${me.name}\n starts the round\nOnes are Wild`, "the display says who starts the round", JSON.stringify(opening));

    // a bid through the panel: face four, + to 2, Submit
    const ok = await bidThroughPanel(0, 2, 3);
    check(!!ok, "the bid 2 X 4 is made through the panel buttons", `${table().multi} X ${table().die + 1}`);
    await sleep(800);
    const display = plain(await probeUntil("text", "display", "", (v) => plain(v).includes("2 X 4 die")));
    check(display === `${me.name}'s turn\n2 X 4 die\nOnes are Wild`, "the bid display in Unity reads the bid", JSON.stringify(display));
    const panel = debug().panel(0);
    check(panel.yourTurn && panel.min === 2, "the turn comes back to the only player, the quantity starts at the standing bid", JSON.stringify(panel));

    // Call it: the dice are revealed and judged
    await sleep(600);
    await press(0, "callIt");
    const result = await until(() => table().phase === PHASE.Result, 30000, 200);
    const sum = dice.filter((v) => v === 3 || v === 0).length;
    check(!!result && table().resultSum === sum, "Call it: the dice are revealed and counted (fours and wild ones)", `sum ${table().resultSum}, expected ${sum}`);
    const text = plain(await probeUntil("text", "display", "", (v) => plain(v).includes("Actual")));
    check(text.includes(`Actual ${sum} X 4 die`), "the result shows on the display", JSON.stringify(text));
    const tint = await probe("color", "p1_die0", "_Color");
    const counts = dice[0] === 3 || dice[0] === 0;
    check(tint === (counts ? "0.000 1.000 1.000 1.000" : "1.000 1.000 1.000 1.000"), "a counting die is tinted cyan, the others white (relay op color)", `${tint} for a ${dice[0] + 1}`);
    check((await probe("active", "p1_continue")) === "True", "Continue shows", "");
    await cmd("shot single_result 0.9 1.7 0.2 0 0.85 1.3 55");

    // rules line and credits: local, through the same input path
    await press(0, "rules");
    await sleep(600);
    const rule = await probe("text", "rules");
    check(rule === "To begin each round, all players roll their dice simultaneously.", "the rules button shows the first rule line", rule);
    await clickKey("creditsButton", "Credits");
    const open = await probeUntil("active", "creditsPanel", "", (v) => v === "True");
    await sleep(600);
    await clickKey("creditsPanel", "the credits panel");
    const closed = await probeUntil("active", "creditsPanel", "", (v) => v === "False");
    check(open === "True" && closed === "False", "the credits panel opens and closes", `${open}, ${closed}`);
    const checked = await until(() => table().integrity !== "pending" && table().integrity, 8000, 200);
    check(checked === "ok", "the page's own check of the referee's result passes (the dice count it saw, the reveal, the sum)", String(checked));
  }

  // ---- two players -------------------------------------------------------------------------------------------
  const heard = [];
  function channel() {
    const scene = window.BS.Scene.GetInstance();
    scene.On("one-shot", (e) => {
      const data = e && e.detail && e.detail.data;
      if (typeof data !== "string" || data.indexOf("ldTest") < 0) return;
      try {
        heard.push(JSON.parse(data));
      } catch (x) {
        /* not ours */
      }
    });
    return (message) => scene.OneShot(JSON.stringify(Object.assign({ ldTest: 1 }, message)));
  }
  const reloaded = () => {
    try {
      return sessionStorage.getItem("ldTestReloaded") === "1";
    } catch (e) {
      return false;
    }
  };
  const hear = (kind, ms) => until(() => heard.find((m) => m.kind === kind), ms || 60000, 200);
  /**
   * Compares the other page's stamp (version and digest of the synced state) with this page's once both are at the same
   * version: a digest is only comparable between equal versions (portkit 812f285, `stamp()`).
   */
  async function sameState(theirs) {
    if (!theirs) return { ok: false, detail: "no word" };
    await until(() => debug().stamp().version === theirs.version, 8000, 200);
    const mine = debug().stamp();
    return { ok: mine.version === theirs.version && mine.digest === theirs.digest, detail: `${theirs.digest} @ ${theirs.version} / ${mine.digest} @ ${mine.version}` };
  }

  async function multi() {
    const back = reloaded();
    if (!(await waitStarted(back))) return;
    const send = channel();
    const two = await until(() => window.__pk1.debug[KEY].players().length >= 2, 90000, 500);
    check(!!two, "two players in the room", JSON.stringify(debug().players()));
    if (!two) return;
    await sleep(2500);
    const me = debug().me();
    if (back) return multiAfterReload(me, send);
    const others = debug().players().filter((p) => p.sid !== me.sid);
    const first = me.sid < others[0].sid; // takes station 1 and opens; the other takes station 2
    const mine = first ? 0 : 1;
    const theirs = 1 - mine;
    say("INFO", `${me.name} plays station ${mine + 1}`);
    if (first) {
      await press(0, "join");
      await until(() => table().seats[0] !== -1 && table().seats[1] !== -1, 60000, 250);
      await sleep(800);
      await press(0, "start");
    } else {
      await until(() => table().seats[0] !== -1, 60000, 250);
      await press(1, "join");
    }
    const bidding = await until(() => table().phase === PHASE.Bidding, 60000, 250);
    check(!!bidding && table().seats[mine] === me.id && table().seats[theirs] !== -1, "both players are seated and the round starts", JSON.stringify(table().seats));
    // before the challenge: my dice visible in Unity, theirs "?" (frame 6); this page cannot compute theirs
    const myDice = (await until(() => debug().myDice(mine), 5000, 100)) || null;
    const myFrames = await framesUntil(mine, myDice);
    const theirFrames = await framesUntil(theirs, [6, 6, 6, 6, 6]);
    check(!!myDice && JSON.stringify(myFrames) === JSON.stringify(myDice), "before the challenge this page shows its own dice", JSON.stringify(myFrames));
    check(theirFrames.every((f) => f === 6) && debug().myDice(theirs) === null, "and only '?' for the other player's dice (it does not know them)", JSON.stringify(theirFrames));

    if (first) {
      await sleep(800);
      const ok = await bidThroughPanel(0, 2, 2);
      check(!!ok, "station 1 bids 2 X 3 through its panel", `${table().multi} X ${table().die + 1}`);
    } else {
      const seen = await until(() => table().multi === 2 && table().die === 2 && table().playing === 1, 60000, 250);
      const display = plain(await probeUntil("text", "display", "", (v) => plain(v).endsWith("2 X 3 die\nOnes are Wild")));
      check(!!seen && display.endsWith("2 X 3 die\nOnes are Wild"), "the bid arrives at the other page and shows on its display", JSON.stringify(display));
      await sleep(1000);
      await press(1, "callIt");
    }
    const result = await until(() => table().phase === PHASE.Result, 60000, 250);
    check(!!result, "Call it: both pages reach the result", `phase ${table().phase}`);
    await sleep(1500);
    const all = (await unityFrames(0)).concat(await unityFrames(1));
    check(JSON.stringify(all.slice(mine * 5, mine * 5 + 5)) === JSON.stringify(myDice), "after the reveal this page's dice are the ones it rolled", JSON.stringify(all));
    send({ kind: "revealed", frames: all, theirs: myDice, seat: mine, stamp: debug().stamp() });
    const other = await hear("revealed");
    check(!!other && JSON.stringify(other.frames) === JSON.stringify(all), "both pages show the same ten dice after the reveal", other ? `${JSON.stringify(other.frames)} / ${JSON.stringify(all)}` : "no word");
    check(!!other && JSON.stringify(all.slice(other.seat * 5, other.seat * 5 + 5)) === JSON.stringify(other.theirs), "the other player's revealed dice are the ones that player saw before the challenge", other ? JSON.stringify(other.theirs) : "");
    const sum = all.filter((v) => v === 2 || v === 0).length;
    check(table().resultSum === sum, "the count is the threes and wild ones among the ten dice", `${table().resultSum} / ${sum}`);
    const same1 = await sameState(other && other.stamp);
    check(same1.ok, "both pages hold the same state after the result (digest at equal version)", same1.detail);
    const checked = await until(() => table().integrity !== "pending" && table().integrity, 8000, 200);
    check(checked === "ok", "this page's own check of the referee's result passes", String(checked));

    if (!first) {
      // the second player reloads during the result and must come back to its seat
      try {
        sessionStorage.setItem("ldTestReloaded", "1");
        sessionStorage.setItem("ldTestSeat", String(mine));
      } catch (e) {
        /* no storage: the reload test cannot run */
      }
      say("INFO", "station 2 reloads its page");
      await sleep(500);
      location.reload();
      await sleep(60000);
      return;
    }
    // station 1: waits for the reloaded page, then both go on with a Continue
    const backMsg = await hear("back", 120000);
    const same2 = await sameState(backMsg && backMsg.stamp);
    check(same2.ok, "the reloaded page holds the same state as this one (late join by reload; digest at equal version)", same2.detail);
    const next = await until(() => table().phase === PHASE.Bidding && table().round === 2, 90000, 250);
    check(!!next, "Continue on the reloaded page starts round 2 for both", `phase ${table().phase}, round ${table().round}`);
    await sleep(1500);
    send({ kind: "round2", stamp: debug().stamp() });
    const theirs2 = await hear("round2b", 30000);
    const same3 = await sameState(theirs2 && theirs2.stamp);
    check(same3.ok, "both pages reach the same state in round 2 (digest at equal version)", same3.detail);
  }

  async function multiAfterReload(me, send) {
    let seat = 1;
    try {
      seat = Number(sessionStorage.getItem("ldTestSeat") || "1");
      sessionStorage.removeItem("ldTestReloaded");
    } catch (e) {
      /* nothing */
    }
    const kept = await until(() => table().seats[seat] === me.id, 60000, 250);
    check(!!kept, "after reloading its page the player has its station back (same user, new session)", `${JSON.stringify(table().seats)} me ${me.id}`);
    check(table().phase === PHASE.Result, "and sees the challenge's result (late join)", `phase ${table().phase}`);
    const all = (await unityFrames(0)).concat(await unityFrames(1));
    await sleep(1500);
    const late = await until(() => table().integrity !== "pending" && table().integrity, 8000, 200);
    check(late === "ok" || late === "partial", "the reloaded page checks the result as far as it can (it did not see the bidding): no false alarm", String(late));
    send({ kind: "back", stamp: debug().stamp(), frames: all });
    say("INFO", `the revealed dice after the reload: ${JSON.stringify(all)}`);
    check(all.every((f) => f >= 0 && f <= 7) && all.some((f) => f <= 5), "the revealed dice are drawn after the reload", JSON.stringify(all));
    await until(() => debug().myDice !== undefined, 1000);
    await sleep(1000);
    await press(seat, "continue");
    const next = await until(() => table().phase === PHASE.Bidding && table().round === 2, 90000, 250);
    check(!!next, "Continue (pressed on the reloaded page) starts round 2", `phase ${table().phase}, round ${table().round}`);
    // the referee's number table (its user state) can reach this page a tick after the phase (space state): wait for it
    const dice = (await until(() => debug().myDice(seat), 5000, 100)) || null;
    const want = dice ? dice.concat(new Array(5 - dice.length).fill(7)) : [];
    const frames = await framesUntil(seat, want);
    check(!!dice && JSON.stringify(frames) === JSON.stringify(want), "the reloaded page rolls and sees its own dice in round 2 (a lost die shows the red X)", `${JSON.stringify(frames)} for ${dice ? dice.length : 0} dice`);
    check(debug().myDiceLost(seat) === false && !plain(table().display).includes("did not come back"), "and its dice are not marked lost", plain(table().display));
    await hear("round2", 30000);
    await sleep(500);
    send({ kind: "round2b", stamp: debug().stamp() });
  }

  window.__ldRun = async function (plan) {
    try {
      if (plan === "single") await single();
      else if (plan === "multi") await multi();
    } catch (e) {
      check(false, "the test ran to its end", e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
    }
    say("INFO", "page result " + passed + " passed, " + failed + " failed");
    console.log("PKTEST DONE");
  };
  if (window.__ldPlan) window.__ldRun(window.__ldPlan);
})();
