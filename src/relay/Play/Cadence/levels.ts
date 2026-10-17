// Cadence levels: one hand-built community, and a daily one generated from the date and checked by brute force.
import { dailyRng, dayLabel } from "../../PlayKit/rng";
import type { Design, Kind, LevelDef, Person, Venue, VenueType } from "./model";
import { costOf, evaluate, solve } from "./model";

// ---------- Level 1 ----------
// Five places that could host. Spreading every-3-month sessions across all five fits the hours and reaches
// two people: trust fades between visits. Steady sessions in fewer places, with follow-through where the
// signals show, is what works (the best plan within 100 h reaches 12 of 20; the target is 10).
export const LEVEL1: LevelDef = {
  id: "l1",
  name: "Harborside",
  story: "Five places in Harborside could host sessions. You have a year and a set number of facilitator hours.",
  w: 6000,
  h: 4000,
  reach: 1200,
  hours: 100,
  target: 10,
  groupMin: 3,
  venues: [
    { x: 1600, y: 1300, type: "library", t0: 0.25 },
    { x: 4400, y: 900, type: "school", t0: 0.3 },
    { x: 4500, y: 3000, type: "center", t0: 0.1 },
    { x: 1500, y: 3100, type: "faith", t0: 0.4 },
    { x: 3000, y: 2000, type: "city", t0: 0.05 },
  ],
  people: [
    { x: 1100, y: 900, kind: 2, need: 0.35 },
    { x: 1900, y: 700, kind: 1, need: 0.5 },
    { x: 2100, y: 1500, kind: 0, need: 0.45 },
    { x: 1300, y: 1700, kind: 2, need: 0.55 },
    { x: 4000, y: 500, kind: 0, need: 0.4 },
    { x: 4900, y: 700, kind: 0, need: 0.55 },
    { x: 4700, y: 1400, kind: 0, need: 0.3 },
    { x: 3900, y: 1300, kind: 0, need: 0.6 },
    { x: 4100, y: 3300, kind: 1, need: 0.45 },
    { x: 5000, y: 2700, kind: 2, need: 0.5 },
    { x: 4800, y: 3500, kind: 1, need: 0.6 },
    { x: 5300, y: 3300, kind: 2, need: 0.35 },
    { x: 1100, y: 3400, kind: 2, need: 0.45 },
    { x: 1900, y: 3500, kind: 1, need: 0.55 },
    { x: 1300, y: 2600, kind: 0, need: 0.5 },
    { x: 2000, y: 2900, kind: 2, need: 0.65 },
    { x: 3000, y: 2700, kind: 1, need: 0.4 },
    { x: 2600, y: 2200, kind: 2, need: 0.5 },
    { x: 3500, y: 1700, kind: 0, need: 0.45 },
    { x: 3300, y: 2400, kind: 1, need: 0.6 },
  ],
  reference: { cad: [2, 2, 0, 0, 3], ft: [true, true, false, false, true] },
};

// designs the checks require to fail on level 1 (the first is what a new player sees on the first run)
export const LEVEL1_MUST_FAIL: { name: string; d: Design }[] = [
  { name: "nothing planned (the starting design)", d: { cad: [0, 0, 0, 0, 0], ft: [false, false, false, false, false] } },
  { name: "every venue every 3 months, all with follow-through (spread thin)", d: { cad: [1, 1, 1, 1, 1], ft: [true, true, true, true, true] } },
  { name: "every venue monthly (over the hours)", d: { cad: [3, 3, 3, 3, 3], ft: [false, false, false, false, false] } },
  { name: "the reference sessions with no follow-through", d: { cad: [2, 2, 0, 0, 3], ft: [false, false, false, false, false] } },
];

// ---------- daily ----------
const PLACES = ["Cedar Point", "Millbrook", "Harbor View", "Lakeshore", "Palm Grove", "Fairhaven", "Riverbend", "Oak Hollow", "Bayside", "Westfield", "Pinecrest", "Northgate", "Sunridge", "Elm Park", "Southport", "Clearwater"];
const OTHER: VenueType[] = ["library", "center", "faith", "city"];
const T0: { [k: string]: [number, number] } = { library: [0.2, 0.3], school: [0.25, 0.35], center: [0.05, 0.2], faith: [0.3, 0.45], city: [0, 0.1] };

export function generateDaily(day: number): LevelDef | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = dailyRng("cadence:" + attempt, day);
    const R = (lo: number, hi: number) => lo + (hi - lo) * r();
    const RI = (lo: number, hi: number) => Math.round(R(lo, hi));
    const W = 6000, H = 4000;
    const venues: Venue[] = [];
    const types: VenueType[] = ["school"];
    while (types.length < 5) types.push(OTHER[Math.floor(r() * OTHER.length) % OTHER.length]);
    for (let k = 0; k < types.length; k++) {
      for (let t = 0; t < 80; t++) {
        const p = { x: RI(800, W - 800), y: RI(600, H - 600) };
        let ok = true;
        for (let j = 0; j < venues.length; j++) if (Math.hypot(p.x - venues[j].x, p.y - venues[j].y) < 1700) ok = false;
        if (ok || t === 79) {
          const tr = T0[types[k]];
          venues.push({ x: p.x, y: p.y, type: types[k], t0: Math.round(R(tr[0], tr[1]) * 100) / 100 });
          break;
        }
      }
    }
    // people cluster around the venues (where a community already gathers), a few between them
    const people: Person[] = [];
    const np = RI(18, 22);
    for (let t = 0; t < 400 && people.length < np; t++) {
      const v = venues[Math.floor(r() * venues.length) % venues.length];
      const between = r() < 0.2;
      const cx = between ? R(900, W - 900) : v.x, cy = between ? R(700, H - 700) : v.y;
      const ang = R(0, Math.PI * 2), rad = between ? 0 : R(250, 1050);
      const p = { x: Math.round(cx + Math.cos(ang) * rad), y: Math.round(cy + Math.sin(ang) * rad) };
      if (p.x < 250 || p.x > W - 250 || p.y < 250 || p.y > H - 250) continue;
      let ok = true;
      for (let j = 0; j < people.length; j++) if (Math.hypot(p.x - people[j].x, p.y - people[j].y) < 320) ok = false;
      for (let j = 0; j < venues.length; j++) if (Math.hypot(p.x - venues[j].x, p.y - venues[j].y) < 260) ok = false;
      if (!ok) continue;
      let kind: Kind = r() < 0.36 ? 0 : r() < 0.5 ? 1 : 2;
      if (v.type === "school" && !between && r() < 0.6) kind = 0;
      people.push({ x: p.x, y: p.y, kind, need: Math.round(R(0.3, 0.66) * 20) / 20 });
    }
    if (people.length < 18) continue;
    const kinds = [0, 0, 0];
    for (let j = 0; j < people.length; j++) kinds[people[j].kind]++;
    if (kinds[0] < 4 || kinds[1] < 4 || kinds[2] < 4) continue;
    const hours = 10 * RI(9, 11);
    const base: LevelDef = {
      id: "d" + day,
      name: PLACES[(day + attempt) % PLACES.length],
      story: "",
      w: W,
      h: H,
      reach: 1200,
      hours,
      target: 1,
      groupMin: 2,
      venues,
      people,
      reference: { cad: [0, 0, 0, 0, 0], ft: [false, false, false, false, false] },
    };
    const s0 = solve(base, 1);
    if (s0.best < 9 || !s0.bestD) continue;
    const target = Math.max(8, Math.ceil(s0.best * 0.85));
    base.target = target;
    const s = solve(base);
    if (!s.cheap || !s.all3) continue;
    // spreading thin must fail
    const thin: Design = { cad: [1, 1, 1, 1, 1], ft: [true, true, true, true, true] };
    if (costOf(thin) <= hours && evaluate(base, thin).pass) continue;
    base.reference = s.bestD as Design;
    base.story = "Five places in " + base.name + " could host sessions. Today's community, the same for everyone, " + dayLabel(day) + ".";
    return base;
  }
  return null;
}

let cache: { day: number; lv: LevelDef } | null = null;
export function dailyLevel(day: number): LevelDef {
  if (cache && cache.day === day) return cache.lv;
  const g = generateDaily(day);
  const lv: LevelDef = g || { ...LEVEL1, id: "d" + day, name: "Harborside, again", story: "Today's community is Harborside, the same for everyone, " + dayLabel(day) + "." };
  cache = { day, lv };
  return lv;
}
