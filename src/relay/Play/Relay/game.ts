// Relay: connect every home in town to the community hub. Place relays, pick the radio power, Test, read the
// named cause, revise. The radio model lives in model.ts; this file is the DOM, input, save and timing.
import type { PlayBrand } from "../../PlayKit/brand";
import { createShell } from "../../PlayKit/shell";
import type { AboutSection, HowTo } from "../../PlayKit/shell";
import { createSurface } from "../../PlayKit/canvas";
import { createLoop, prefersReducedMotion } from "../../PlayKit/loop";
import { attachPointer, attachKeys, History } from "../../PlayKit/input";
import { createStore } from "../../PlayKit/save";
import { utcDayNumber, dayLabel } from "../../PlayKit/rng";
import type { Design, LevelDef, Result } from "./model";
import { BUILDING_DB, NEED_DB, POWERS, RELAY_COST, defaultDesign, evaluate, fmtMoney, noiseDbm } from "./model";
import { LEVEL1, dailyLevel } from "./levels";
import type { Anim, Cam, View } from "./render";
import { HUD_H, SX, SY, draw, fitCam } from "./render";

interface LevelSave { d: Design; done: boolean; marks: boolean[] }
interface SaveData { lv: { [id: string]: LevelSave }; hinted: boolean; last: string }

const ABOUT: AboutSection[] = [
  {
    h: "The model",
    body: [
      "Every station sends on 2.4 GHz with a simple antenna of 2 dBi at each end. Received power (dBm) = transmit power (dBm) + both antenna gains − open-air path loss − 12 dB for each tall building the straight line between the two ends passes through.",
      "Open-air path loss follows the inverse-square law. In decibels it is FSPL = 20·log10(d in km) + 20·log10(f in MHz) + 32.44. At 2.4 GHz that is 100.0 dB over 1 km, and every doubling of the distance adds 6.0 dB.",
      "Noise: thermal noise at room temperature (290 K) is about −174 dBm in every hertz of bandwidth. Over a 20 MHz channel with a receiver noise figure of 7 dB the noise floor is about −94 dBm.",
      "Signal-to-noise ratio (SNR) = received power − noise floor. A hop carries the signal when its SNR is at least 10 dB. With nothing in the way that gives a reach of about 0.8 km at 10 mW, 2.5 km at 100 mW and 7.9 km at 1 W: ten times the power reaches about three times as far.",
      "Relays decode the signal and send it on at full strength (decode and forward), so each hop is judged on its own. A home's signal is as strong as the weakest hop on its route, and each home and relay takes the route whose weakest hop is strongest.",
      "Costs: $" + RELAY_COST + " per relay site (a small mast, a solar panel and a battery). Each station's radio costs $50 at 10 mW, $100 at 100 mW and $700 at 1 W, where the larger amplifier needs a larger panel and battery.",
    ],
  },
  {
    h: "What's simplified",
    body: [
      "The town is flat and seen from above. Each tall building costs a fixed 12 dB, a round figure; real buildings can cost much less or much more depending on their walls, windows and size. Smaller houses, trees, reflections and weather are left out.",
      "Only the direction from the hub toward the homes is checked. A real network also needs the homes' replies to get back, and a relay that shares one channel gives up some speed.",
      "The figures are a teaching model, not a network plan.",
    ],
  },
  {
    h: "Why signals",
    body: [
      "The Signals Institute is building long-term pathways into advanced technology, engineering, and scientific fields. Every network in this game works the same way those pathways do: each home is reached through the stations in between.",
    ],
  },
];

const HOW_TO: HowTo = {
  goal: [
    "Connect every home in town to the community hub, the large blue square marked HUB, without going over the budget.",
  ],
  control: [
    "Tap a dashed square on the map to put up a relay there. A relay is a small station that receives the signal and sends it on. Tap a relay again to take it down.",
    "Pick the radio power for the whole network: 10 mW, 100 mW or 1 W. The dashed circle around each station shows roughly how far it reaches in the open at that power.",
    "Press Test, or the Space bar or Enter, to send the signal out and see which homes connect. You can also press 1, 2 or 3 to pick the power. Undo, Redo and Reset are next to Test.",
  ],
  cost: [
    "Each town has a dollar budget, shown above the map. The meter at the top right of the map shows what your network costs right now.",
    "Each relay costs $" + RELAY_COST + ". Every station, the hub included, needs a radio: $50 at 10 mW, $100 at 100 mW, or $700 at 1 W.",
    "Testing costs nothing, so you can test as often as you like.",
  ],
  earn: [
    "Each town has three marks. The first is for connecting every home within the budget. That is what passes the level.",
    "The second mark is for thrift: spend 80% of the budget or less. The third is for a strong signal: the weakest home must be well above the noise, by the number of decibels shown on the mark.",
    "A passed town gets a check mark on its tab, and your network and marks are saved in this browser. The dollars are only your budget; there is no money to win.",
  ],
  hard: [
    "A signal gets weaker the farther it travels. Twice the distance leaves a quarter of the power.",
    "Tall buildings, the striped blocks on the map, weaken any signal that passes through them.",
    "A home needs its signal to be clearly stronger than the background noise. A relay that cannot hear the network has nothing to pass on.",
    "More power and more relays both help, and both cost money, so the cheapest network usually runs closest to the edge. There is no timer. A new town arrives each day at midnight UTC.",
  ],
  tip: "When a home stays dark, read the result card: it says how far the home is from the nearest station and what stood in the way. Going around a building is often cheaper than shouting through it.",
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function mountGame(host: HTMLElement, brand: PlayBrand): () => void {
  const day = utcDayNumber();
  const reduced = prefersReducedMotion();
  const store = createStore<SaveData>("play.relay", 1, () => ({ lv: {}, hinted: false, last: "l1" }));
  const save = store.load();
  if (!save.lv || typeof save.lv !== "object") save.lv = {};
  let daily: LevelDef | null = null;
  const levelFor = (t: string): LevelDef => (t === "today" ? daily || (daily = dailyLevel(day)) : LEVEL1);

  let tab = save.last === "today" ? "today" : "l1";
  let lv: LevelDef = levelFor(tab);
  let d: Design = loadDesign(lv);
  let res: Result | null = null;
  let mode: View["mode"] = "build";
  let anim: Anim | null = null;
  let hover = -1;
  let lastTitle = "";
  let hintOn = !save.hinted;
  const history = new History<Design>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cam: Cam = { s: 1, ox: 0, oy: 0, w: 1, h: 1, rot: false, lw: 1 };

  function loadDesign(L: LevelDef): Design {
    const s = save.lv[L.id];
    const base = defaultDesign(L);
    if (!s || !s.d) return base;
    const r = s.d;
    if (!r.relays || r.relays.length !== L.sites.length || typeof r.power !== "number" || !POWERS[r.power]) return base;
    return clone(r);
  }

  const shell = createShell(host, {
    brand,
    slug: "relay",
    name: "Relay",
    tagline: "Connect every home. Strength through connection.",
    about: ABOUT,
    howTo: HOW_TO,
    onLevel: (id) => switchLevel(id),
    productLine: "See how the Institute builds pathways",
  });
  // the shared footer says "Today's <product> trivia"; the Institute's name reads better on its own
  const trivLink = shell.root.querySelector('.pk-foot a[href="' + brand.triviaHref + '"]');
  if (trivLink) trivLink.textContent = "Today's trivia";

  const surf = createSurface(shell.stage, {
    aspect: 1.5,
    minH: host.clientWidth < 640 ? Math.round(host.clientWidth * 1.42) + 56 : 420,
    onResize: (w, h) => {
      cam = fitCam(lv, w, h);
    },
  });
  cam = fitCam(lv, surf.w, surf.h);

  // ---------- controls ----------
  const g1 = shell.group();
  const powSeg = shell.segmented({
    label: "Power",
    options: POWERS.map((p, i) => ({ id: String(i), label: p.label, title: p.label + " radios, $" + p.cost + " per station" })),
    value: String(d.power),
    onChange: (id) => change((x) => { x.power = parseInt(id, 10); }),
    parent: g1,
  });
  const g3 = shell.group();
  const undoBtn = shell.button("Undo", () => undo(), { parent: g3, title: "Undo (Ctrl/Cmd+Z)" });
  const redoBtn = shell.button("Redo", () => redo(), { parent: g3, title: "Redo (Ctrl+Y)" });
  shell.button("Reset", () => change((x) => { const f = defaultDesign(lv); x.relays = f.relays; x.power = f.power; }), { parent: g3, title: "Back to the starting network" });
  shell.button("Test", () => runTest(), { primary: true, parent: g3, title: "Test (Space or Enter)" });

  function syncControls(): void {
    powSeg.set(String(d.power));
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
  }

  function refreshTabs(): void {
    const dl = save.lv["d" + day];
    shell.setLevels(
      [
        { id: "l1", label: "1 · " + LEVEL1.name, done: !!(save.lv[LEVEL1.id] && save.lv[LEVEL1.id].done) },
        { id: "today", label: "Today · " + dayLabel(day), done: !!(dl && dl.done) },
      ],
      tab,
    );
  }

  function refreshBrief(): void {
    shell.setBrief(lv.name, lv.story, [lv.homes.length + " homes", "budget " + fmtMoney(lv.budget), "needs " + NEED_DB + " dB above the noise"]);
  }

  function persist(now?: boolean): void {
    const s = save.lv[lv.id] || { d, done: false, marks: [false, false, false] };
    s.d = clone(d);
    save.lv[lv.id] = s;
    save.last = tab;
    store.save(save, now);
  }

  function prepEdit(): void {
    if (mode !== "build") {
      mode = "build";
      anim = null;
      shell.hideCard();
      shell.audio.silence();
    }
    if (hintOn) hintOn = false;
  }

  function change(mut: (x: Design) => void): void {
    prepEdit();
    history.push(d);
    mut(d);
    afterEdit();
  }
  function afterEdit(): void {
    syncControls();
    persist();
  }
  function undo(): void {
    const p = history.undo(d);
    if (!p) { shell.audio.invalid(); return; }
    prepEdit();
    d = p;
    shell.audio.erase();
    afterEdit();
  }
  function redo(): void {
    const p = history.redo(d);
    if (!p) { shell.audio.invalid(); return; }
    prepEdit();
    d = p;
    shell.audio.place();
    afterEdit();
  }

  function switchLevel(id: string): void {
    persist(true);
    tab = id === "today" ? "today" : "l1";
    lv = levelFor(tab);
    d = loadDesign(lv);
    history.clear();
    mode = "build";
    anim = null;
    res = null;
    lastTitle = "";
    shell.hideCard();
    shell.audio.silence();
    cam = fitCam(lv, surf.w, surf.h);
    refreshTabs();
    refreshBrief();
    syncControls();
    persist();
    shell.track("play_level", { level: tab });
  }

  // ---------- Test ----------
  function runTest(): void {
    if (mode === "test") return;
    shell.hideCard();
    hintOn = false;
    res = evaluate(lv, d);
    const r = res;
    const hops: number[] = [];
    for (let j = 0; j < r.nodes.length; j++) {
      let k = 0;
      for (let p = r.nodes[j].parent; p >= 0 && r.nodes[j].on; p = r.nodes[p].parent) k++;
      hops.push(k);
    }
    const depth: number[] = [];
    for (let j = 0; j < hops.length; j++) depth.push(Math.max(0, hops[j] - 1));
    const homeDepth: number[] = [];
    let maxD = 0;
    for (let k = 0; k < r.homes.length; k++) {
      const v = r.homes[k].via >= 0 ? hops[r.homes[k].via] : 0;
      homeDepth.push(v);
      maxD = Math.max(maxD, v);
    }
    const hopDur = reduced ? 0.01 : 0.55;
    anim = { t: 0, depth, homeDepth, hopDur, end: (maxD + 1) * hopDur + (reduced ? 0 : 0.4) };
    mode = "test";
    shell.audio.start();
    if (!reduced) shell.audio.bed(0.5, 98, 500);
    if (!save.hinted) { save.hinted = true; store.save(save); }
    shell.track("play_test", { level: tab, power: POWERS[d.power].label });
    fired = {};
    if (reduced) finish();
  }

  let fired: { [k: number]: boolean } = {};
  function step(dt: number): void {
    if (mode !== "test" || !anim || !res) return;
    anim.t += dt;
    for (let k = 0; k < res.homes.length; k++) {
      if (!fired[k] && anim.t >= (anim.homeDepth[k] + 1) * anim.hopDur) {
        fired[k] = true;
        if (res.homes[k].linked) shell.audio.tick(k);
        else shell.audio.invalid();
      }
    }
    if (anim.t >= anim.end) finish();
  }

  function finish(): void {
    if (!res || !anim) return;
    const r = res;
    anim.t = Math.max(anim.t, anim.end);
    mode = "result";
    shell.audio.silence();
    lastTitle = r.title;
    const s = save.lv[lv.id] || { d: clone(d), done: false, marks: [false, false, false] };
    if (r.pass) s.done = true;
    for (let i = 0; i < 3; i++) s.marks[i] = !!(s.marks[i] || r.marks[i]);
    s.d = clone(d);
    save.lv[lv.id] = s;
    store.save(save, true);
    refreshTabs();
    if (r.pass) {
      shell.audio.win();
      for (let i = 0; i < 3; i++) if (r.marks[i]) timers.push(setTimeout(() => shell.audio.mark(i), 700 + i * 220));
    } else shell.audio.fail();
    shell.track("play_result", { level: tab, pass: r.pass ? 1 : 0 });

    const narrow = surf.w < 640;
    const stats: [string, string][] = [
      ["cost", fmtMoney(r.cost) + " / " + fmtMoney(lv.budget)],
      ["homes linked", r.linkedCount + " / " + lv.homes.length],
      ["weakest home", (r.worst >= 0 ? "+" : "") + r.worst.toFixed(1) + " dB"],
    ];
    if (!narrow) {
      stats.push(["power", POWERS[d.power].label]);
      stats.push(["noise floor", noiseDbm().toFixed(0) + " dBm"]);
      stats.push(["per building", BUILDING_DB + " dB"]);
    }
    const actions: { label: string; primary?: boolean; onClick: () => void }[] = [];
    if (r.pass) {
      if (tab === "l1") actions.push({ label: "Today's town", primary: true, onClick: () => switchLevel("today") });
      actions.push({ label: "Keep refining", primary: tab !== "l1", onClick: () => { prepEdit(); } });
    } else {
      actions.push({ label: "Back to the map", primary: true, onClick: () => { prepEdit(); } });
    }
    shell.showCard({
      pass: r.pass,
      title: r.title,
      cause: r.cause,
      marks: [
        { label: "Connected in budget", got: r.marks[0] },
        { label: "Thrift ≤ " + fmtMoney(lv.budget * 0.8), got: r.marks[1] },
        { label: "Signal ≥ " + lv.marginMark + " dB", got: r.marks[2] },
      ],
      stats,
      actions,
    });
  }

  // ---------- pointer ----------
  function siteAt(px: number, py: number): number {
    let best = -1, bd = 24 * 24;
    for (let i = 0; i < lv.sites.length; i++) {
      const dx = px - SX(cam, lv.sites[i].x, lv.sites[i].y), dy = py - SY(cam, lv.sites[i].x, lv.sites[i].y);
      const dd = dx * dx + dy * dy;
      if (dd <= bd) { bd = dd; best = i; }
    }
    return best;
  }

  const detachPointer = attachPointer(surf.canvas, {
    down(p) {
      if (mode === "test" || p.y < HUD_H) return;
      const i = siteAt(p.x, p.y);
      if (i < 0) return;
      const on = !d.relays[i];
      change((x) => { x.relays[i] = on; });
      if (on) { shell.audio.place(); shell.toast("Relay up · tap it again to take it down"); }
      else { shell.audio.erase(); shell.toast("Relay taken down · Ctrl/Cmd+Z to undo"); }
    },
    move(p) {
      if (mode === "test") return;
      hover = p.y < HUD_H ? -1 : siteAt(p.x, p.y);
      surf.canvas.style.cursor = hover >= 0 ? "pointer" : "default";
    },
    leave() {
      hover = -1;
    },
  });

  const detachKeys = attachKeys({
    " ": () => runTest(),
    enter: () => runTest(),
    "mod+z": (e) => (e.shiftKey ? redo() : undo()),
    "mod+y": () => redo(),
    "1": () => change((x) => { x.power = 0; }),
    "2": () => change((x) => { x.power = 1; }),
    "3": () => change((x) => { x.power = 2; }),
  });

  // ---------- loop ----------
  const view: View = { lv, d, res: null, anim: null, mode, hover, hint: hintOn, time: 0, reduced };
  const loop = createLoop({
    dt: 1 / 60,
    step,
    render: (time) => {
      view.lv = lv;
      view.d = d;
      view.res = res;
      view.anim = anim;
      view.mode = mode;
      view.hover = hover;
      view.hint = hintOn;
      view.time = time;
      surf.begin();
      draw(surf.ctx, cam, view, brand);
    },
  });
  loop.start();

  refreshTabs();
  refreshBrief();
  syncControls();
  if (hintOn) timers.push(setTimeout(() => shell.toast("Tap a dashed square to place a relay, pick a power, then Test.", 5200), 400));

  // test hook for the headless playtest
  const w = window as unknown as { __playTest?: unknown };
  w.__playTest = {
    useReference(): void {
      if (tab !== "l1") switchLevel("l1");
      prepEdit();
      history.push(d);
      d = clone(LEVEL1.reference);
      afterEdit();
    },
    run(): void {
      if (mode === "test") prepEdit();
      runTest();
    },
    result(): { done: boolean; pass: boolean; title: string } {
      return { done: mode === "result", pass: !!(mode === "result" && res && res.pass), title: lastTitle };
    },
  };

  return () => {
    persist(true);
    loop.stop();
    detachPointer();
    detachKeys();
    for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    surf.destroy();
    shell.destroy();
    delete w.__playTest;
  };
}
