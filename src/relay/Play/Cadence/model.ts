// Cadence: plan a year of sessions across a community's venues. Trust grows where sessions come steadily and
// fades between them; people come once trust clears what they need; a signal shows on the second visit; a
// signal becomes a next step only where someone follows through. DOM-free, so the checks run under Node.
//
// This is a model of an idea from the Institute's own pages ("A repeatable cadence that builds trust";
// Engagement, Exposure, Transition). The rates are chosen for play. They are not measurements.

export const MONTHS = 12;
export const SESSION_H = 3; // facilitator hours per session (setup, the session, the follow-up notes)
export const FOLLOW_H = 8; // facilitator hours a year for follow-through at one venue
export const GAIN = 0.35; // each session closes 35% of the gap to full trust
export const DECAY = 0.2; // each month without a session loses 20% of the trust built
export const REVEAL_AFTER = 2; // a person's signal shows on their second visit
export const WINDOW = 3; // months a noticed signal waits for a next step before it fades

export interface Cad { label: string; short: string; every: number }
export const CADENCES: Cad[] = [
  { label: "Off", short: "off", every: 0 },
  { label: "Every 3 months", short: "every 3 mo", every: 3 },
  { label: "Every 2 months", short: "every 2 mo", every: 2 },
  { label: "Monthly", short: "monthly", every: 1 },
];

export type Kind = 0 | 1 | 2;
export const KINDS = [
  { name: "young person", plural: "young people", group: "Youth", step: "Youth programs" },
  { name: "veteran", plural: "veterans", group: "Veterans", step: "Veteran transition" },
  { name: "community member", plural: "community members", group: "Community", step: "Community learning" },
];

export type VenueType = "library" | "school" | "center" | "faith" | "city";
export const VENUE_TYPES: { [k: string]: { name: string; code: string; serves: boolean[] } } = {
  library: { name: "library", code: "LIB", serves: [true, true, true] },
  school: { name: "school", code: "SCH", serves: [true, false, false] },
  center: { name: "community center", code: "CTR", serves: [true, true, true] },
  faith: { name: "faith-based center", code: "FTH", serves: [true, true, true] },
  city: { name: "city facility", code: "CITY", serves: [true, true, true] },
};

export interface Pt { x: number; y: number }
export interface Venue extends Pt { type: VenueType; t0: number }
export interface Person extends Pt { kind: Kind; need: number }

export interface Design { cad: number[]; ft: boolean[] }

export interface LevelDef {
  id: string;
  name: string;
  story: string;
  w: number; // metres
  h: number;
  reach: number; // walking reach, metres
  hours: number; // facilitator hours for the year
  target: number; // next steps needed to pass
  groupMin: number; // per group, for the third mark
  venues: Venue[];
  people: Person[];
  reference: Design;
}

export type Status = "next" | "faded" | "waiting" | "once" | "low" | "far";

export interface PersonOut {
  status: Status;
  first: number; // month of first visit, -1
  reveal: number; // month the signal showed, -1
  next: number; // month of the next step, -1
  fade: number; // month the signal faded, -1
  via: number; // venue of the next step (or of the reveal), -1
  visits: number[]; // venue attended each month, -1 for none
  near: number; // nearest active venue that serves them, -1
  peak: number; // highest trust (before a session) they saw at a venue in reach
}

export interface Result {
  cost: number;
  over: boolean;
  trust: number[][]; // [venue][month] trust after that month
  before: number[][]; // [venue][month] trust before that month's session (or carried)
  session: boolean[][]; // [venue][month]
  people: PersonOut[];
  nextCount: number;
  byKind: number[];
  revealed: number;
  lost: number; // revealed but never connected (faded or still waiting at year's end)
  pass: boolean;
  marks: boolean[];
  title: string;
  cause: string;
}

/** The level trust settles at just before each session, for a session every `every` months (the fixed point). */
export function steadyBefore(every: number): number {
  const keep = Math.pow(1 - DECAY, every - 1); // trust kept over the months without a session
  const after = GAIN / (1 - (1 - GAIN) * keep);
  return after * keep;
}

export function sessionsPerYear(c: number): number {
  const e = CADENCES[c].every;
  return e ? Math.ceil(MONTHS / e) : 0;
}

export function costOf(d: Design): number {
  let h = 0;
  for (let i = 0; i < d.cad.length; i++) {
    if (!d.cad[i]) continue;
    h += sessionsPerYear(d.cad[i]) * SESSION_H;
    if (d.ft[i]) h += FOLLOW_H;
  }
  return h;
}

export function defaultDesign(lv: LevelDef): Design {
  const cad: number[] = [], ft: boolean[] = [];
  for (let i = 0; i < lv.venues.length; i++) { cad.push(0); ft.push(false); }
  return { cad, ft };
}

export function serves(v: Venue, k: Kind): boolean {
  return VENUE_TYPES[v.type].serves[k];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** "the east library": a venue's type with a compass word, so a cause can name it. */
export function venueName(lv: LevelDef, i: number): string {
  const v = lv.venues[i];
  const t = VENUE_TYPES[v.type].name;
  let same = 0;
  for (let j = 0; j < lv.venues.length; j++) if (lv.venues[j].type === v.type) same++;
  if (same < 2) return "the " + t;
  return "the " + compass(lv, v) + " " + t;
}
export function compass(lv: LevelDef, p: Pt): string {
  const dx = (p.x - lv.w / 2) / lv.w, dy = (p.y - lv.h / 2) / lv.h;
  if (Math.abs(dx) < 0.17 && Math.abs(dy) < 0.17) return "central";
  const ns = dy < -0.17 ? "north" : dy > 0.17 ? "south" : "";
  const ew = dx < -0.17 ? "west" : dx > 0.17 ? "east" : "";
  return ns && ew ? ns + ew : ns || ew;
}

const pct = (v: number) => Math.round(v * 100) + "%";

/** Trust over the year at every venue, for a design. */
export function trustCurves(lv: LevelDef, d: Design): { before: number[][]; trust: number[][]; session: boolean[][] } {
  const before: number[][] = [], trust: number[][] = [], session: boolean[][] = [];
  for (let i = 0; i < lv.venues.length; i++) {
    const e = CADENCES[d.cad[i]].every;
    let t = lv.venues[i].t0;
    const b: number[] = [], a: number[] = [], s: boolean[] = [];
    for (let m = 0; m < MONTHS; m++) {
      const on = e > 0 && m % e === 0;
      b.push(t);
      if (on) t = t + GAIN * (1 - t);
      else t = t * (1 - DECAY);
      a.push(t);
      s.push(on);
    }
    before.push(b);
    trust.push(a);
    session.push(s);
  }
  return { before, trust, session };
}

export function evaluate(lv: LevelDef, d: Design): Result {
  const cost = costOf(d);
  const over = cost > lv.hours;
  const tc = trustCurves(lv, d);
  const people: PersonOut[] = [];
  const byKind = [0, 0, 0];
  let nextCount = 0, revealed = 0, lost = 0;
  for (let p = 0; p < lv.people.length; p++) {
    const P = lv.people[p];
    const o: PersonOut = { status: "far", first: -1, reveal: -1, next: -1, fade: -1, via: -1, visits: [], near: -1, peak: 0 };
    let nd = Infinity;
    const inReach: number[] = [];
    for (let i = 0; i < lv.venues.length; i++) {
      const V = lv.venues[i];
      if (!serves(V, P.kind) || dist(V, P) > lv.reach) continue;
      if (d.cad[i]) {
        inReach.push(i);
        const dd = dist(V, P);
        if (dd < nd) { nd = dd; o.near = i; }
      }
    }
    let n = 0;
    for (let m = 0; m < MONTHS; m++) {
      let at = -1, atFt = false, atT = -1;
      for (let k = 0; k < inReach.length; k++) {
        const i = inReach[k];
        if (!tc.session[i][m]) continue;
        const t = tc.before[i][m];
        if (t > o.peak) o.peak = t;
        if (t < P.need) continue;
        const ft = !!d.ft[i];
        // a person goes where they are followed up, else where trust is highest
        if (at < 0 || (ft && !atFt) || (ft === atFt && t > atT)) { at = i; atFt = ft; atT = t; }
      }
      o.visits.push(at);
      if (o.next >= 0 || o.fade >= 0) continue;
      if (at < 0) {
        if (o.reveal >= 0 && m > o.reveal + WINDOW) o.fade = o.reveal + WINDOW + 1;
        continue;
      }
      n++;
      if (o.first < 0) o.first = m;
      if (n === REVEAL_AFTER) { o.reveal = m; o.via = at; }
      if (o.reveal >= 0) {
        if (m > o.reveal + WINDOW) { o.fade = o.reveal + WINDOW + 1; continue; }
        if (atFt) { o.next = m; o.via = at; }
      }
    }
    if (o.reveal >= 0 && o.next < 0 && o.fade < 0 && o.reveal + WINDOW + 1 < MONTHS) o.fade = o.reveal + WINDOW + 1;
    if (o.next >= 0) o.status = "next";
    else if (o.fade >= 0) o.status = "faded";
    else if (o.reveal >= 0) o.status = "waiting";
    else if (o.first >= 0) o.status = "once";
    else if (inReach.length) o.status = "low";
    else o.status = "far";
    if (o.status === "next") { nextCount++; byKind[P.kind]++; }
    if (o.reveal >= 0) revealed++;
    if (o.status === "faded" || o.status === "waiting") lost++;
    people.push(o);
  }
  const pass = !over && nextCount >= lv.target;
  const marks = [pass, pass && revealed > 0 && lost === 0, pass && byKind[0] >= lv.groupMin && byKind[1] >= lv.groupMin && byKind[2] >= lv.groupMin];
  const r: Result = { cost, over, trust: tc.trust, before: tc.before, session: tc.session, people, nextCount, byKind, revealed, lost, pass, marks, title: "", cause: "" };
  explain(lv, d, r);
  return r;
}

function plural(n: number, one: string, many: string): string {
  return n + " " + (n === 1 ? one : many);
}

/** The named reason: what held this plan back, with a venue and a number from the run. */
function explain(lv: LevelDef, d: Design, r: Result): void {
  if (r.over) {
    r.title = "More hours than the year holds";
    r.cause = "This plan needs " + r.cost + " h of facilitator time and the year has " + lv.hours + " h. Each session takes " + SESSION_H + " h, and follow-through takes " + FOLLOW_H + " h a year at each venue. Meeting less often in fewer places frees hours.";
    return;
  }
  let active = 0;
  for (let i = 0; i < d.cad.length; i++) if (d.cad[i]) active++;
  if (!active) {
    r.title = "No sessions planned yet";
    r.cause = "Tap a venue, then choose how often it meets. People come where trust has been built, and trust starts with showing up.";
    return;
  }
  const cnt: { [k: string]: number } = { faded: 0, waiting: 0, once: 0, low: 0, far: 0 };
  for (let p = 0; p < r.people.length; p++) if (r.people[p].status !== "next") cnt[r.people[p].status]++;
  const parts: string[] = [];
  // the leading reason first
  const order: Status[] = ["far", "low", "once", "faded", "waiting"];
  order.sort((a, b) => cnt[b] - cnt[a]);
  for (let q = 0; q < order.length && parts.length < 2; q++) {
    const s = order[q];
    const n = cnt[s];
    if (!n) continue;
    if (s === "far") {
      let ex = -1;
      for (let p = 0; p < r.people.length; p++) if (r.people[p].status === "far") { ex = p; break; }
      const P = lv.people[ex];
      parts.push(plural(n, "person lives", "people live") + " beyond walking reach of every venue that is meeting and serves them, for example a " + KINDS[P.kind].name + " in the " + compass(lv, P) + " part of the map. A venue closer to them would help.");
    } else if (s === "low" || s === "once") {
      // the venue where the most people fell short, with its peak trust against what they needed
      const per: number[] = [];
      for (let i = 0; i < lv.venues.length; i++) per.push(0);
      for (let p = 0; p < r.people.length; p++) if (r.people[p].status === s && r.people[p].near >= 0) per[r.people[p].near]++;
      let vi = 0;
      for (let i = 1; i < per.length; i++) if (per[i] > per[vi]) vi = i;
      let peak = 0;
      for (let m = 0; m < MONTHS; m++) if (r.session[vi][m]) peak = Math.max(peak, r.before[vi][m]);
      let lo = 1, hi = 0;
      for (let p = 0; p < r.people.length; p++) if (r.people[p].status === s && r.people[p].near === vi) { lo = Math.min(lo, lv.people[p].need); hi = Math.max(hi, lv.people[p].need); }
      const needTxt = lo === hi ? pct(lo) : pct(lo) + " to " + pct(hi);
      const how = CADENCES[d.cad[vi]].label.toLowerCase();
      if (s === "low") parts.push(plural(n, "person never came", "people never came") + ". At " + venueName(lv, vi) + ", which meets " + how + ", trust before a session peaked at " + pct(peak) + ", and the people near it need " + needTxt + ". Trust builds where sessions come steadily.");
      else parts.push(plural(n, "person came once", "people came once") + " and did not come back; a signal shows on the second visit. With sessions " + how + " at " + venueName(lv, vi) + ", trust fell below the " + needTxt + " they need before their next chance.");
    } else {
      let vi = -1;
      for (let p = 0; p < r.people.length; p++) if (r.people[p].status === s) { vi = r.people[p].via; break; }
      if (s === "faded") parts.push(plural(n, "person", "people") + " showed real interest and then drifted: no venue they attended offered follow-through within " + WINDOW + " months" + (vi >= 0 ? ", starting at " + venueName(lv, vi) : "") + ". Every signal needs a next step.");
      else parts.push(plural(n, "person", "people") + " showed interest late in the year with no follow-through yet" + (vi >= 0 ? " at " + venueName(lv, vi) : "") + ". Earlier trust, or follow-through where they come, would connect them.");
    }
  }
  if (r.pass) {
    r.title = plural(r.nextCount, "person found a next step", "people found a next step");
    const g = KINDS[0].group + " " + r.byKind[0] + " · " + KINDS[1].group + " " + r.byKind[1] + " · " + KINDS[2].group + " " + r.byKind[2] + ".";
    r.cause = g + (r.lost ? " " + plural(r.lost, "signal was", "signals were") + " noticed and left without a next step. " + (parts.length ? parts[0] : "") : " Every signal noticed this year was followed through.");
  } else {
    r.title = r.nextCount + " of the " + lv.target + " next steps needed";
    r.cause = parts.join(" ") || "More steady sessions, closer to more people, would reach further.";
  }
}

/** Brute force over every design within the hours: the best count, and the cheapest design that passes. */
export interface Solved { best: number; bestD: Design | null; cheap: Design | null; cheapCost: number; noLost: boolean; groups: boolean; all3: boolean; passing: number; total: number }
export function solve(lv: LevelDef, target?: number): Solved {
  const n = lv.venues.length;
  const tgt = target === undefined ? lv.target : target;
  const out: Solved = { best: 0, bestD: null, cheap: null, cheapCost: Infinity, noLost: false, groups: false, all3: false, passing: 0, total: 0 };
  const cad: number[] = [];
  for (let i = 0; i < n; i++) cad.push(0);
  const N = Math.pow(4, n);
  for (let c = 1; c < N; c++) {
    let x = c;
    const act: number[] = [];
    for (let i = 0; i < n; i++) { cad[i] = x % 4; x = Math.floor(x / 4); if (cad[i]) act.push(i); }
    const F = 1 << act.length;
    for (let f = 0; f < F; f++) {
      const ft: boolean[] = [];
      for (let i = 0; i < n; i++) ft.push(false);
      for (let k = 0; k < act.length; k++) if (f & (1 << k)) ft[act[k]] = true;
      const d: Design = { cad: cad.slice(), ft };
      const cost = costOf(d);
      if (cost > lv.hours) continue;
      out.total++;
      const r = evaluate({ ...lv, target: tgt }, d);
      if (r.nextCount > out.best) { out.best = r.nextCount; out.bestD = d; }
      if (r.pass) {
        out.passing++;
        if (cost < out.cheapCost) { out.cheapCost = cost; out.cheap = d; }
        if (r.marks[1]) out.noLost = true;
        if (r.marks[2]) out.groups = true;
        if (r.marks[1] && r.marks[2]) out.all3 = true;
      }
    }
  }
  return out;
}
