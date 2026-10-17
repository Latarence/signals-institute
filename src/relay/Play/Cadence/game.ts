// Cadence: plan a year of sessions across a community's venues, run it month by month, read the named
// reason, revise. The model lives in model.ts; this file is the DOM, input, save and timing.
import type { PlayBrand } from "../../PlayKit/brand";
import { createShell } from "../../PlayKit/shell";
import type { AboutSection, HowTo } from "../../PlayKit/shell";
import { createSurface } from "../../PlayKit/canvas";
import { createLoop, prefersReducedMotion } from "../../PlayKit/loop";
import { attachPointer, attachKeys, History } from "../../PlayKit/input";
import { createStore } from "../../PlayKit/save";
import { utcDayNumber, dayLabel } from "../../PlayKit/rng";
import type { Design, LevelDef, Result } from "./model";
import { CADENCES, DECAY, FOLLOW_H, GAIN, MONTHS, REVEAL_AFTER, SESSION_H, VENUE_TYPES, WINDOW, defaultDesign, evaluate, steadyBefore } from "./model";
import { LEVEL1, dailyLevel } from "./levels";
import type { Cam, View } from "./render";
import { HUD_H, LANE_H, SX, SY, draw, fitCam } from "./render";

interface LevelSave { d: Design; done: boolean; marks: boolean[] }
interface SaveData { lv: { [id: string]: LevelSave }; hinted: boolean; last: string }

const pc = (v: number) => Math.round(v * 100) + "%";

const ABOUT: AboutSection[] = [
  {
    h: "The idea",
    body: [
      "The Signals Institute describes its approach as a longitudinal, signal-driven system with three parts. Engagement: \"build trust and consistent interaction within schools, community organizations, and faith-based networks. This establishes the conditions where meaningful signals can be observed.\" Exposure: people are \"introduced to new fields, mentors, and opportunities grounded in relationship.\" Transition: \"converting early signals into lasting outcomes.\"",
      "Its pillars page adds the method this game is named for: \"A repeatable cadence that builds trust\", where \"each event will point participants to the next step: youth programs, veteran transition, or continued community learning.\"",
      "Signals, in the Institute's words, \"are indicators of change, need, and opportunity. They exist in science, in systems, and in human relationships.\" In Cadence the signal is a person's interest, and it becomes visible only where trust has been built.",
    ],
  },
  {
    h: "The model",
    body: [
      "Each venue starts with some trust (a faith-based center or a school usually starts higher than a new city facility). Each session closes " + pc(GAIN) + " of the gap between the venue's trust and full trust. Each month without a session loses " + pc(DECAY) + " of the trust built. Over a year, trust just before each session climbs toward full trust at a venue that meets monthly, levels off near " + pc(steadyBefore(2)) + " at every 2 months, and near " + pc(steadyBefore(3)) + " at every 3 months.",
      "Each person has a level of trust they need before they come, between 30% and 65%. In a month when a venue in walking reach (" + (LEVEL1.reach / 1000).toFixed(1) + " km) holds a session, a person comes if the trust built there before that session meets their need. Schools reach young people only; the other venues reach everyone.",
      "A person's signal shows on their visit number " + REVEAL_AFTER + ". From then on they need a next step within " + WINDOW + " months: a visit to a venue with follow-through, where a facilitator connects them to youth programs, veteran transition, or continued community learning. Without one, the signal fades.",
      "Hours: each session takes " + SESSION_H + " h of facilitator time (setup, the session and notes), and follow-through takes " + FOLLOW_H + " h a year at each venue.",
    ],
  },
  {
    h: "What's simplified",
    body: [
      "This is a model of an idea, made for play. The rates, thresholds and hours are round figures chosen so the trade-offs show; they are not measurements, and they are not figures from the Institute's programs.",
      "Real trust is personal and uneven, people move and change, and one good conversation can matter more than a dozen sessions. The model keeps one lesson from all of that: steady presence builds trust, and a noticed signal needs a next step.",
    ],
  },
];

const HOW_TO: HowTo = {
  goal: [
    "Plan a year of sessions across Harborside's five venues so that enough people find a next step: youth programs, veteran transition, or continued community learning. The number you need is shown above the map.",
  ],
  control: [
    "Tap a venue on the map (a square) to choose it. Then use the buttons below the map to set how often it meets: Off, every 3 months, every 2 months, or monthly.",
    "Turn Follow-through on at a venue so a facilitator there connects each interested person to a next step. A green arrow beside a venue means follow-through is on.",
    "Press Run the year, or Space or Enter, to watch the year play month by month. Arrow keys move between venues, and 0 to 3 set how often the chosen venue meets. Undo, Redo and Reset sit next to Run the year.",
  ],
  cost: [
    "You have a set number of facilitator hours for the year, shown at the top right of the map.",
    "Each session takes " + SESSION_H + " hours, so monthly costs 36 hours a year, every 2 months 18, and every 3 months 12. Follow-through costs " + FOLLOW_H + " hours a year at each venue.",
    "Running the year costs nothing, so you can try as many plans as you like.",
  ],
  earn: [
    "Each community has three marks. The first is for reaching the number of next steps within the hours. That passes the level.",
    "The second is for losing no one: every person whose interest showed also found a next step. The third is for all three groups: young people, veterans and community members each reach the number shown on the mark.",
    "A passed level gets a check mark on its tab, and your plan and marks are saved in this browser. The hours are your budget; there is no money involved.",
  ],
  hard: [
    "Trust grows with each session and fades in the months between. Sessions spread thinly across every venue never build enough trust for most people to come.",
    "Each person needs a certain level of trust before they come, and a person's interest only shows on their second visit.",
    "Once someone's interest shows, they need follow-through within " + WINDOW + " months or the signal fades. Follow-through everywhere costs hours that sessions also need. There is no timer. A new community arrives each day at midnight UTC.",
  ],
  tip: "Steady beats scattered. Choose a few venues that reach the most people, meet often there, and put follow-through where the signals show. After a run, people who never came show the trust they needed.",
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function mountGame(host: HTMLElement, brand: PlayBrand): () => void {
  const day = utcDayNumber();
  const reduced = prefersReducedMotion();
  const store = createStore<SaveData>("play.cadence", 1, () => ({ lv: {}, hinted: false, last: "l1" }));
  const save = store.load();
  if (!save.lv || typeof save.lv !== "object") save.lv = {};
  let daily: LevelDef | null = null;
  const levelFor = (t: string): LevelDef => (t === "today" ? daily || (daily = dailyLevel(day)) : LEVEL1);

  let tab = save.last === "today" ? "today" : "l1";
  let lv: LevelDef = levelFor(tab);
  let d: Design = loadDesign(lv);
  let res: Result | null = null;
  let mode: View["mode"] = "build";
  let month = 0;
  let sel = 0;
  let hover = -1;
  let lastTitle = "";
  let hintOn = !save.hinted;
  const history = new History<Design>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cam: Cam = { s: 1, ox: 0, oy: 0, w: 1, h: 1, rot: false, lw: 1 };
  const MONTH_S = 0.62;

  function loadDesign(L: LevelDef): Design {
    const s = save.lv[L.id];
    const base = defaultDesign(L);
    if (!s || !s.d) return base;
    const r = s.d;
    if (!r.cad || !r.ft || r.cad.length !== L.venues.length || r.ft.length !== L.venues.length) return base;
    for (let i = 0; i < r.cad.length; i++) if (!(r.cad[i] >= 0 && r.cad[i] < CADENCES.length)) return base;
    return clone(r);
  }

  const shell = createShell(host, {
    brand,
    slug: "cadence",
    name: "Cadence",
    tagline: "Show up steadily. Notice the signals. Point each one to a next step.",
    about: ABOUT,
    howTo: HOW_TO,
    onLevel: (id) => switchLevel(id),
    productLine: "See how the Institute builds pathways",
  });
  const trivLink = shell.root.querySelector('.pk-foot a[href="' + brand.triviaHref + '"]');
  if (trivLink) trivLink.textContent = "Today's trivia";

  const surf = createSurface(shell.stage, {
    aspect: 1.45,
    minH: host.clientWidth < 640 ? Math.round(host.clientWidth * 1.5) + HUD_H + LANE_H : 460,
    onResize: (w, h) => {
      cam = fitCam(lv, w, h);
    },
  });
  cam = fitCam(lv, surf.w, surf.h);

  // ---------- controls ----------
  const g1 = shell.group();
  const cadSeg = shell.segmented({
    label: "Library",
    options: CADENCES.map((c, i) => ({ id: String(i), label: i === 0 ? "Off" : i === 3 ? "Monthly" : "Every " + c.every + " mo", title: c.label + (i ? ", " + (12 / c.every) * SESSION_H + " h a year" : "") })),
    value: "0",
    onChange: (id) => change((x) => { x.cad[sel] = parseInt(id, 10); if (!x.cad[sel]) x.ft[sel] = false; }),
    parent: g1,
  });
  const ftSeg = shell.segmented({
    label: "Follow-through",
    options: [
      { id: "0", label: "Off" },
      { id: "1", label: "On", title: "A facilitator connects each interested person to a next step, " + FOLLOW_H + " h a year" },
    ],
    value: "0",
    onChange: (id) => change((x) => { x.ft[sel] = id === "1"; if (x.ft[sel] && !x.cad[sel]) x.cad[sel] = 2; }),
    parent: g1,
  });
  const g3 = shell.group();
  const undoBtn = shell.button("Undo", () => undo(), { parent: g3, title: "Undo (Ctrl/Cmd+Z)" });
  const redoBtn = shell.button("Redo", () => redo(), { parent: g3, title: "Redo (Ctrl+Y)" });
  shell.button("Reset", () => change((x) => { const f = defaultDesign(lv); x.cad = f.cad; x.ft = f.ft; }), { parent: g3, title: "Back to an empty plan" });
  const runBtn = shell.button("Run the year", () => (mode === "run" ? finish() : runYear()), { primary: true, parent: g3, title: "Run the year (Space or Enter)" });

  function venueTitle(i: number): string {
    const t = VENUE_TYPES[lv.venues[i].type].name;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function syncControls(): void {
    cadSeg.set(String(d.cad[sel]));
    ftSeg.set(d.ft[sel] ? "1" : "0");
    const lab = cadSeg.el.querySelector("i");
    if (lab) lab.textContent = venueTitle(sel) + " (" + (sel + 1) + "/" + lv.venues.length + ")";
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
    runBtn.textContent = mode === "run" ? "Skip to year's end" : "Run the year";
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
    shell.setBrief(lv.name, lv.story, [lv.people.length + " people", lv.hours + " facilitator hours", lv.target + " next steps needed"]);
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
  function select(i: number): void {
    if (mode !== "build") prepEdit();
    sel = (i + lv.venues.length) % lv.venues.length;
    if (hintOn) hintOn = false;
    shell.audio.ui();
    syncControls();
  }

  function switchLevel(id: string): void {
    persist(true);
    tab = id === "today" ? "today" : "l1";
    lv = levelFor(tab);
    d = loadDesign(lv);
    history.clear();
    mode = "build";
    res = null;
    sel = 0;
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

  // ---------- run ----------
  function runYear(): void {
    if (mode === "run") return;
    shell.hideCard();
    hintOn = false;
    res = evaluate(lv, d);
    month = 0;
    lastMonth = -1;
    mode = "run";
    syncControls();
    shell.audio.start();
    if (!reduced) shell.audio.bed(0.45, 110, 520);
    if (!save.hinted) { save.hinted = true; store.save(save); }
    shell.track("play_test", { level: tab });
    if (reduced || res.over) finish();
  }

  let lastMonth = -1;
  function step(dt: number): void {
    if (mode !== "run" || !res) return;
    month += dt / MONTH_S;
    const mi = Math.floor(month);
    if (mi !== lastMonth && mi < MONTHS) {
      lastMonth = mi;
      let any = false, nexts = 0;
      for (let i = 0; i < lv.venues.length; i++) if (res.session[i][mi]) any = true;
      for (let p = 0; p < res.people.length; p++) if (res.people[p].next === mi) nexts++;
      if (nexts) for (let k = 0; k < Math.min(nexts, 4); k++) shell.audio.tick(mi + k);
      else if (any) shell.audio.ui();
    }
    if (month >= MONTHS) finish();
  }

  function finish(): void {
    if (!res) return;
    const r = res;
    month = MONTHS;
    mode = "result";
    syncControls();
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
      ["hours", r.cost + " / " + lv.hours],
      ["next steps", r.nextCount + " / " + lv.target],
      ["signals lost", String(r.lost)],
    ];
    if (!narrow) {
      stats.push(["youth", String(r.byKind[0])]);
      stats.push(["veterans", String(r.byKind[1])]);
      stats.push(["community", String(r.byKind[2])]);
    }
    const actions: { label: string; primary?: boolean; onClick: () => void }[] = [];
    if (r.pass) {
      if (tab === "l1") actions.push({ label: "Today's community", primary: true, onClick: () => switchLevel("today") });
      actions.push({ label: "Keep refining", primary: tab !== "l1", onClick: () => { prepEdit(); syncControls(); } });
    } else {
      actions.push({ label: "Back to the plan", primary: true, onClick: () => { prepEdit(); syncControls(); } });
    }
    shell.showCard({
      pass: r.pass,
      title: r.title,
      cause: r.cause,
      marks: [
        { label: lv.target + " next steps in " + lv.hours + " h", got: r.marks[0] },
        { label: "No signal lost", got: r.marks[1] },
        { label: "Each group ≥ " + lv.groupMin, got: r.marks[2] },
      ],
      stats,
      actions,
    });
  }

  // ---------- pointer ----------
  function venueAt(px: number, py: number): number {
    let best = -1, bd = 30 * 30;
    for (let i = 0; i < lv.venues.length; i++) {
      const dx = px - SX(cam, lv.venues[i].x, lv.venues[i].y), dy = py - SY(cam, lv.venues[i].x, lv.venues[i].y);
      const dd = dx * dx + dy * dy;
      if (dd <= bd) { bd = dd; best = i; }
    }
    return best;
  }

  const detachPointer = attachPointer(surf.canvas, {
    down(p) {
      if (mode === "run" || p.y < HUD_H || p.y > surf.h - LANE_H) return;
      const i = venueAt(p.x, p.y);
      if (i < 0) return;
      if (i === sel && mode === "build") {
        // a second tap on the chosen venue steps through how often it meets
        const nx = (d.cad[i] + 1) % CADENCES.length;
        change((x) => { x.cad[i] = nx; if (!nx) x.ft[i] = false; });
        if (nx) shell.audio.place(); else shell.audio.erase();
        shell.toast(venueTitle(i) + ": " + CADENCES[nx].label.toLowerCase());
      } else {
        select(i);
        shell.toast(venueTitle(i) + " chosen · set how often it meets below");
      }
    },
    move(p) {
      if (mode === "run") return;
      hover = p.y < HUD_H ? -1 : venueAt(p.x, p.y);
      surf.canvas.style.cursor = hover >= 0 ? "pointer" : "default";
    },
    leave() {
      hover = -1;
    },
  });

  const setCad = (c: number) => change((x) => { x.cad[sel] = c; if (!c) x.ft[sel] = false; });
  const detachKeys = attachKeys({
    " ": () => (mode === "run" ? finish() : runYear()),
    enter: () => (mode === "run" ? finish() : runYear()),
    "mod+z": (e) => (e.shiftKey ? redo() : undo()),
    "mod+y": () => redo(),
    arrowright: () => select(sel + 1),
    arrowdown: () => select(sel + 1),
    arrowleft: () => select(sel - 1),
    arrowup: () => select(sel - 1),
    "0": () => setCad(0),
    "1": () => setCad(1),
    "2": () => setCad(2),
    "3": () => setCad(3),
    f: () => change((x) => { x.ft[sel] = !x.ft[sel]; if (x.ft[sel] && !x.cad[sel]) x.cad[sel] = 2; }),
  });

  // ---------- loop ----------
  const view: View = { lv, d, res: null, mode, month: 0, sel, hover, hint: hintOn, time: 0, reduced };
  const loop = createLoop({
    dt: 1 / 60,
    step,
    render: (time) => {
      view.lv = lv;
      view.d = d;
      view.res = res;
      view.mode = mode;
      view.month = month;
      view.sel = sel;
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
  if (hintOn) timers.push(setTimeout(() => shell.toast("Tap a venue, choose how often it meets, then Run the year.", 5200), 400));

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
      if (mode === "run") prepEdit();
      runYear();
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
