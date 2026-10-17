// Towns: one hand-built level, and a daily town generated from the date and checked solvable by brute force.
import { dailyRng, dayLabel } from "../../PlayKit/rng";
import type { Block, Design, LevelDef, Pt } from "./model";
import { POWERS, defaultDesign, evaluate, solve } from "./model";

// ---------- Level 1 ----------
// The near homes are easy. The far side of town sits behind a block of tall buildings, so turning the hub up
// to full power is the obvious move, and it falls short of the far homes. One relay at full power works (and
// earns the signal mark); three relays at 100 mW go around the buildings for less (and earn the thrift mark).

export const LEVEL1: LevelDef = {
  id: "l1",
  name: "Brookside",
  story: "Six homes across Brookside need a steady link to the community hub.",
  w: 6000,
  h: 4000,
  hub: { x: 700, y: 2000 },
  homes: [
    { x: 2100, y: 900 },
    { x: 2300, y: 3200 },
    { x: 3700, y: 2000 },
    { x: 5200, y: 900 },
    { x: 5400, y: 2500 },
    { x: 4300, y: 3500 },
  ],
  sites: [
    { x: 1600, y: 3000 },
    { x: 2900, y: 1000 },
    { x: 3000, y: 3100 },
    { x: 4300, y: 1300 },
    { x: 4500, y: 2700 },
    { x: 1500, y: 1200 },
  ],
  blocks: [
    { x0: 1700, y0: 1500, x1: 2400, y1: 2500 },
    { x0: 4300, y0: 1700, x1: 4900, y1: 2300 },
  ],
  budget: 2000,
  marginMark: 13,
  reference: { relays: [true, true, true, false, false, false], power: 1 },
};

// designs the checks require to fail on level 1 (the first is what a new player sees on the first Test)
export const LEVEL1_MUST_FAIL: { name: string; d: Design }[] = [
  { name: "hub alone at 100 mW (the starting design)", d: defaultDesign(LEVEL1) },
  { name: "hub alone at full power", d: { relays: [false, false, false, false, false, false], power: 2 } },
  { name: "every relay at full power (over budget)", d: { relays: [true, true, true, true, true, true], power: 2 } },
  { name: "two relays at 10 mW", d: { relays: [false, true, true, false, false, false], power: 0 } },
];

// ---------- daily ----------
const TOWNS = ["Cedar Point", "Millbrook", "Harbor View", "Lakeshore", "Palm Grove", "Fairhaven", "Riverbend", "Oak Hollow", "Bayside", "Westfield", "Pinecrest", "Northgate", "Clearwater Flats", "Sunridge", "Elm Park", "Southport"];

function inBlock(p: Pt, bs: Block[], pad: number): boolean {
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    if (p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.y0 - pad && p.y < b.y1 + pad) return true;
  }
  return false;
}
function farFrom(p: Pt, ps: Pt[], d: number): boolean {
  for (let i = 0; i < ps.length; i++) if (Math.hypot(p.x - ps[i].x, p.y - ps[i].y) < d) return false;
  return true;
}

export function generateDaily(day: number): LevelDef | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = dailyRng("relay:" + attempt, day);
    const R = (lo: number, hi: number) => Math.round(lo + (hi - lo) * r());
    const hub = { x: R(500, 900), y: R(1300, 2700) };
    const blocks: Block[] = [];
    const nb = R(2, 4);
    for (let t = 0; t < 40 && blocks.length < nb; t++) {
      const x0 = R(1500, 4800), y0 = R(300, 3000);
      const b = { x0, y0, x1: x0 + R(450, 800), y1: Math.min(3800, y0 + R(500, 1100)) };
      let ok = true;
      for (let i = 0; i < blocks.length; i++) if (!(b.x1 + 300 < blocks[i].x0 || b.x0 > blocks[i].x1 + 300 || b.y1 + 300 < blocks[i].y0 || b.y0 > blocks[i].y1 + 300)) ok = false;
      if (ok) blocks.push(b);
    }
    const homes: Pt[] = [];
    const nh = R(5, 7);
    for (let t = 0; t < 200 && homes.length < nh; t++) {
      const p = { x: R(1900, 5700), y: R(350, 3650) };
      if (!inBlock(p, blocks, 120) && farFrom(p, homes, 700) && farFrom(p, [hub], 1200)) homes.push(p);
    }
    const sites: Pt[] = [];
    const ns = R(6, 8);
    for (let t = 0; t < 300 && sites.length < ns; t++) {
      const p = { x: R(1200, 5300), y: R(350, 3650) };
      if (!inBlock(p, blocks, 120) && farFrom(p, sites, 750) && farFrom(p, homes, 350) && farFrom(p, [hub], 600)) sites.push(p);
    }
    if (homes.length < 5 || sites.length < 6) continue;
    const name = TOWNS[Math.floor(r() * TOWNS.length) % TOWNS.length];
    const lv: LevelDef = {
      id: "d" + day,
      name,
      story: homes.length + " homes across " + name + " need a steady link to the community hub. Today's town, " + dayLabel(day) + ".",
      w: 6000,
      h: 4000,
      hub,
      homes,
      sites,
      blocks,
      budget: Infinity,
      marginMark: 0,
      reference: defaultDesign({ sites } as LevelDef),
    };
    // the starting design and full power alone must both fall short, so a relay is always needed
    if (evaluate(lv, defaultDesign(lv)).pass) continue;
    const full = defaultDesign(lv);
    full.power = POWERS.length - 1;
    if (evaluate(lv, full).pass) continue;
    const s0 = solve(lv);
    if (!s0.cheapest) continue;
    lv.budget = Math.ceil((s0.cheapCost * 1.3) / 100) * 100;
    const s1 = solve(lv);
    lv.marginMark = Math.max(11, Math.min(16, Math.floor(s1.bestWorst)));
    lv.reference = s0.cheapest;
    return lv;
  }
  return null;
}

export function dailyLevel(day: number): LevelDef {
  const lv = generateDaily(day);
  if (lv) return lv;
  // fallback: level 1 under today's id, so the daily tab always has a level
  const f: LevelDef = JSON.parse(JSON.stringify(LEVEL1)) as LevelDef;
  f.id = "d" + day;
  f.name = "Brookside again";
  return f;
}
