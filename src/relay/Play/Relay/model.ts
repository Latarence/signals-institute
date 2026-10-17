// Relay: the radio model. Pure functions, no DOM, so check.ts can run it under Node.
// Received power (dBm) = transmit power + both antenna gains - free-space path loss - a fixed loss per tall
// building crossed. Noise = thermal noise (kT at 290 K) over the channel bandwidth plus the receiver noise
// figure. A hop holds when its signal-to-noise ratio is at least NEED_DB. Relays decode and resend at full
// power (decode and forward), so each hop is judged on its own and a route is as strong as its weakest hop.

export interface Pt { x: number; y: number } // metres
export interface Block { x0: number; y0: number; x1: number; y1: number } // metres, x0<x1, y0<y1

export interface Power { label: string; dbm: number; cost: number }

export const FREQ_MHZ = 2400;
export const BW_HZ = 20e6;
export const NF_DB = 7;
export const GAIN_DBI = 2; // each end, a simple omni antenna
export const BUILDING_DB = 12; // per tall building crossed (a round figure; real buildings vary widely)
export const NEED_DB = 10; // SNR a hop needs to carry the signal
export const RELAY_COST = 400; // site: small mast, solar panel, battery
export const POWERS: Power[] = [
  { label: "10 mW", dbm: 10, cost: 50 },
  { label: "100 mW", dbm: 20, cost: 100 },
  { label: "1 W", dbm: 30, cost: 700 },
];

const K_BOLTZMANN = 1.380649e-23; // J/K
const T0 = 290; // K

/** Thermal noise power density kT at 290 K, in dBm per hertz (about -174). */
export function kTdBmHz(): number {
  return 10 * Math.log10((K_BOLTZMANN * T0) / 1e-3);
}

/** Noise floor of a receiver: kT + 10 log10(bandwidth) + noise figure, in dBm. */
export function noiseDbm(bwHz: number = BW_HZ, nf: number = NF_DB): number {
  return kTdBmHz() + 10 * Math.log10(bwHz) + nf;
}

/** Free-space path loss in dB: 20 log10(d km) + 20 log10(f MHz) + 32.44 (the inverse-square law in decibels). */
export function fspl(dKm: number, fMHz: number = FREQ_MHZ): number {
  return 20 * Math.log10(Math.max(dKm, 0.001)) + 20 * Math.log10(fMHz) + 32.44;
}

/** Distance in km at which a hop with no buildings in the way just reaches NEED_DB. */
export function reachKm(pDbm: number): number {
  const maxLoss = pDbm + 2 * GAIN_DBI - noiseDbm() - NEED_DB;
  return Math.pow(10, (maxLoss - 20 * Math.log10(FREQ_MHZ) - 32.44) / 20);
}

/** Does the segment a-b pass through the rectangle? (Liang-Barsky clip.) */
export function crosses(a: Pt, b: Pt, r: Block): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return t1 - t0 > 1e-6;
}

export interface Hop { dKm: number; fspl: number; walls: number; prDbm: number; snr: number }

export function evalHop(a: Pt, b: Pt, pDbm: number, blocks: Block[]): Hop {
  const dKm = Math.hypot(b.x - a.x, b.y - a.y) / 1000;
  let walls = 0;
  for (let i = 0; i < blocks.length; i++) if (crosses(a, b, blocks[i])) walls++;
  const L = fspl(dKm);
  const prDbm = pDbm + 2 * GAIN_DBI - L - walls * BUILDING_DB;
  return { dKm, fspl: L, walls, prDbm, snr: prDbm - noiseDbm() };
}

export interface LevelDef {
  id: string;
  name: string;
  story: string;
  w: number; // metres
  h: number;
  hub: Pt;
  homes: Pt[];
  sites: Pt[];
  blocks: Block[];
  budget: number;
  marginMark: number; // dB the weakest home needs for the third mark
  reference: Design;
}

export interface Design { relays: boolean[]; power: number }

export interface NodeRes { x: number; y: number; on: boolean; best: number; parent: number; site: number }
export interface Link { from: number; to: number; home: number; hop: Hop } // to = node index, or -1 when home >= 0
export interface HomeRes { linked: boolean; snr: number; via: number; hop: Hop | null; route: number[] } // route = node indices hub..via
export interface Result {
  pass: boolean;
  title: string;
  cause: string;
  cost: number;
  over: boolean;
  marks: boolean[];
  nodes: NodeRes[]; // 0 = hub, then placed relays
  links: Link[]; // tree links between nodes, then each home's link
  homes: HomeRes[];
  worst: number; // weakest home SNR (end to end bottleneck)
  linkedCount: number;
}

export function defaultDesign(lv: LevelDef): Design {
  const r: boolean[] = [];
  for (let i = 0; i < lv.sites.length; i++) r.push(false);
  return { relays: r, power: 1 };
}

export function costOf(d: Design): number {
  let n = 1;
  for (let i = 0; i < d.relays.length; i++) if (d.relays[i]) n++;
  return (n - 1) * RELAY_COST + n * POWERS[d.power].cost;
}

export function fmtMoney(v: number): string {
  return "$" + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function evaluate(lv: LevelDef, d: Design): Result {
  const p = POWERS[d.power].dbm;
  const nodes: NodeRes[] = [{ x: lv.hub.x, y: lv.hub.y, on: true, best: Infinity, parent: -1, site: -1 }];
  for (let i = 0; i < lv.sites.length; i++) if (d.relays[i]) nodes.push({ x: lv.sites[i].x, y: lv.sites[i].y, on: false, best: -Infinity, parent: -1, site: i });
  const n = nodes.length;
  // pairwise hops between stations
  const H: Hop[][] = [];
  for (let i = 0; i < n; i++) {
    H.push([]);
    for (let j = 0; j < n; j++) H[i].push(i === j ? evalHop(nodes[i], nodes[i], p, []) : evalHop(nodes[i], nodes[j], p, lv.blocks));
  }
  // widest path from the hub (maximise the weakest hop), relaxed until stable
  for (let it = 0; it < n; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (nodes[i].best < NEED_DB) continue;
      for (let j = 1; j < n; j++) {
        if (j === i) continue;
        const s = Math.min(nodes[i].best, H[i][j].snr);
        if (s > nodes[j].best + 1e-9) { nodes[j].best = s; nodes[j].parent = i; changed = true; }
      }
    }
    if (!changed) break;
  }
  for (let j = 1; j < n; j++) nodes[j].on = nodes[j].best >= NEED_DB;
  const links: Link[] = [];
  for (let j = 1; j < n; j++) if (nodes[j].on) links.push({ from: nodes[j].parent, to: j, home: -1, hop: H[nodes[j].parent][j] });

  const homes: HomeRes[] = [];
  let worst = Infinity, linkedCount = 0;
  for (let k = 0; k < lv.homes.length; k++) {
    let bestS = -Infinity, via = -1, hop: Hop | null = null;
    for (let j = 0; j < n; j++) {
      if (!nodes[j].on) continue;
      const hp = evalHop(nodes[j], lv.homes[k], p, lv.blocks);
      const s = Math.min(nodes[j].best, hp.snr);
      if (s > bestS) { bestS = s; via = j; hop = hp; }
    }
    const route: number[] = [];
    for (let j = via; j >= 0; j = nodes[j].parent) route.unshift(j);
    const linked = bestS >= NEED_DB;
    if (linked) linkedCount++;
    worst = Math.min(worst, bestS);
    homes.push({ linked, snr: bestS, via, hop, route });
    if (via >= 0) links.push({ from: via, to: -1, home: k, hop: hop as Hop });
  }
  const cost = costOf(d);
  const over = cost > lv.budget;
  const all = linkedCount === lv.homes.length;
  const pass = all && !over;
  const marks = [pass, pass && cost <= lv.budget * 0.8, pass && worst >= lv.marginMark];

  let title = "", cause = "";
  if (!all) {
    // explain the darkest home
    let k = -1;
    for (let i = 0; i < homes.length; i++) if (!homes[i].linked && (k < 0 || homes[i].snr < homes[k].snr)) k = i;
    const hr = homes[k];
    const dark = lv.homes.length - linkedCount;
    title = dark === 1 ? "One home is still dark" : dark + " homes are still dark";
    const hp = hr.hop as Hop;
    const who = hr.via === 0 ? "the hub" : "the nearest working station";
    const wallTxt = hp.walls === 0 ? "with nothing in the way" : hp.walls === 1 ? "and one tall building in the way (12 dB)" : "and " + hp.walls + " tall buildings in the way (" + hp.walls * BUILDING_DB + " dB)";
    const snrTxt = hp.snr >= 0 ? Math.round(hp.snr) + " dB above the noise" : Math.round(-hp.snr) + " dB below the noise";
    cause = "The weakest home (" + Math.round(hr.snr) + " dB on the map) is " + hp.dKm.toFixed(1) + " km from " + who + ", " + wallTxt + ". Its signal arrives " + snrTxt + ", and it needs " + NEED_DB + " dB.";
    // a relay that never got the signal is the more useful thing to name
    for (let j = 1; j < n; j++) if (!nodes[j].on) { cause += " One of your relays is out of reach of the network, so it has nothing to pass on."; break; }
  } else if (over) {
    title = "Every home is connected, over budget";
    cause = "The network costs " + fmtMoney(cost) + " against a budget of " + fmtMoney(lv.budget) + ". Try fewer relays, or a lower power where the distances allow it.";
  } else {
    title = "Every home is connected";
    cause = "The weakest home is " + worst.toFixed(1) + " dB above the noise. Each relay heard the signal clearly and sent it on at full strength.";
  }
  return { pass, title, cause, cost, over, marks, nodes, links, homes, worst: worst === Infinity ? 0 : worst, linkedCount };
}

/** Brute force over every relay subset and power: the cheapest passing design and the best weakest-home SNR
 *  any design within budget reaches. Levels have at most 8 sites (3 x 256 designs). */
export function solve(lv: LevelDef): { cheapest: Design | null; cheapCost: number; bestWorst: number; bestWorstDesign: Design | null } {
  const ns = lv.sites.length;
  let cheapest: Design | null = null, cheapCost = Infinity, bestWorst = -Infinity;
  let bestWorstDesign: Design | null = null;
  const probe: LevelDef = { id: lv.id, name: lv.name, story: lv.story, w: lv.w, h: lv.h, hub: lv.hub, homes: lv.homes, sites: lv.sites, blocks: lv.blocks, budget: Infinity, marginMark: 0, reference: lv.reference };
  for (let pw = 0; pw < POWERS.length; pw++) {
    for (let m = 0; m < 1 << ns; m++) {
      const r: boolean[] = [];
      for (let i = 0; i < ns; i++) r.push(((m >> i) & 1) === 1);
      const d: Design = { relays: r, power: pw };
      const c = costOf(d);
      const res = evaluate(probe, d);
      if (!res.pass) continue;
      if (c < cheapCost) { cheapCost = c; cheapest = d; }
      if (c <= lv.budget && res.worst > bestWorst) { bestWorst = res.worst; bestWorstDesign = d; }
    }
  }
  return { cheapest, cheapCost, bestWorst, bestWorstDesign };
}
