// Headless checks for Relay: textbook values, level 1 designs that must fail and must pass, and the daily
// generator solvable and deterministic for 60 days from today. Bundled with esbuild, run under Node.
import { runChecks, approx } from "../../PlayKit/check";
import type { CheckCase } from "../../PlayKit/check";
import { utcDayNumber } from "../../PlayKit/rng";
import { crosses, evalHop, evaluate, fspl, kTdBmHz, noiseDbm, reachKm, solve, POWERS } from "./model";
import { LEVEL1, LEVEL1_MUST_FAIL, dailyLevel, generateDaily } from "./levels";

const cases: CheckCase[] = [];

// ---- textbook values ----
cases.push({ name: "kT at 290 K = -173.98 dBm/Hz", run: () => approx(kTdBmHz(), -173.98, 0.01, "kT dBm/Hz") });
cases.push({ name: "noise floor, 20 MHz, NF 7 dB = -93.97 dBm", run: () => approx(noiseDbm(), -93.97, 0.02, "noise dBm") });
cases.push({ name: "FSPL 2.4 GHz over 1 km = 100.04 dB", run: () => approx(fspl(1, 2400), 100.04, 0.01, "FSPL dB") });
cases.push({ name: "FSPL 2.4 GHz over 10 km = 120.0 dB", run: () => approx(fspl(10, 2400), 120.04, 0.01, "FSPL dB") });
cases.push({ name: "inverse square: doubling distance adds 6.02 dB", run: () => approx(fspl(2) - fspl(1), 6.0206, 0.001, "delta dB") });
cases.push({ name: "10x power reaches sqrt(10)x as far", run: () => approx(reachKm(30) / reachKm(20), Math.sqrt(10), 1e-9, "ratio") });
cases.push({ name: "reach at 100 mW ~ 2.49 km", run: () => approx(reachKm(POWERS[1].dbm), 2.49, 0.01, "km") });
cases.push({ name: "hop at reach distance has SNR = 10 dB", run: () => {
  const r = reachKm(20) * 1000;
  return approx(evalHop({ x: 0, y: 0 }, { x: r, y: 0 }, 20, []).snr, 10, 1e-6, "SNR dB");
} });
cases.push({ name: "one building costs 12 dB", run: () => {
  const a = { x: 0, y: 0 }, b = { x: 2000, y: 0 };
  const h0 = evalHop(a, b, 20, []), h1 = evalHop(a, b, 20, [{ x0: 900, y0: -100, x1: 1100, y1: 100 }]);
  return approx(h0.snr - h1.snr, 12, 1e-9, "dB");
} });
cases.push({ name: "segment/rectangle crossing", run: () => {
  const r = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const ok = crosses({ x: -5, y: 5 }, { x: 15, y: 5 }, r) && !crosses({ x: -5, y: 15 }, { x: 15, y: 15 }, r) && crosses({ x: -5, y: -5 }, { x: 15, y: 15 }, r) && !crosses({ x: -5, y: 0 }, { x: -1, y: 20 }, r);
  return { ok, detail: "4 cases" };
} });

// ---- level 1 ----
for (let i = 0; i < LEVEL1_MUST_FAIL.length; i++) {
  const f = LEVEL1_MUST_FAIL[i];
  cases.push({ name: "L1 must fail: " + f.name, run: () => {
    const r = evaluate(LEVEL1, f.d);
    return { ok: !r.pass && r.cause.length > 0, detail: r.title + " | " + r.cause };
  } });
}
cases.push({ name: "L1 reference passes with the thrift mark", run: () => {
  const r = evaluate(LEVEL1, LEVEL1.reference);
  return { ok: r.pass && r.marks[1], detail: r.title + " cost " + r.cost + " worst " + r.worst.toFixed(1) + " marks " + r.marks.join(",") };
} });
cases.push({ name: "L1 all three marks are each reachable", run: () => {
  const s = solve(LEVEL1);
  const ok = !!s.cheapest && s.cheapCost <= LEVEL1.budget * 0.8 && s.bestWorst >= LEVEL1.marginMark;
  return { ok, detail: "cheapest " + s.cheapCost + ", best weakest home " + s.bestWorst.toFixed(1) + " dB (mark " + LEVEL1.marginMark + ")" };
} });

// ---- daily ----
cases.push({ name: "daily towns: 60 days generated, solvable, deterministic", run: () => {
  const t0 = utcDayNumber();
  let bad = 0, fallback = 0;
  for (let k = 0; k < 60; k++) {
    const lv = generateDaily(t0 + k);
    if (!lv) { fallback++; continue; }
    const r = evaluate(lv, lv.reference);
    if (!r.pass) bad++;
    const again = dailyLevel(t0 + k);
    if (JSON.stringify(again) !== JSON.stringify(lv)) bad++;
    if (evaluate(lv, { relays: lv.reference.relays.map(() => false), power: 1 }).pass) bad++;
  }
  return { ok: bad === 0 && fallback === 0, detail: "bad " + bad + ", fallback " + fallback };
} });

const fails = runChecks("Relay", cases);
process.exitCode = fails ? 1 : 0;
