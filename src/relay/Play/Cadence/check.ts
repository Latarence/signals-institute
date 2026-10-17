// Headless checks for Cadence: model values, level 1 designs that must fail and must pass, every mark
// reachable, and the daily generator solvable and deterministic for 30 days. Bundled with esbuild, run under Node.
import { runChecks, approx } from "../../PlayKit/check";
import type { CheckCase } from "../../PlayKit/check";
import { utcDayNumber } from "../../PlayKit/rng";
import { costOf, evaluate, solve, steadyBefore, trustCurves } from "./model";
import { LEVEL1, LEVEL1_MUST_FAIL, dailyLevel, generateDaily } from "./levels";

const cases: CheckCase[] = [];

cases.push({ name: "monthly sessions settle at full trust", run: () => approx(steadyBefore(1), 1, 1e-9, "trust") });
cases.push({ name: "every 2 months settles near 58% before a session", run: () => approx(steadyBefore(2), 0.5833, 0.001, "trust") });
cases.push({ name: "every 3 months settles near 38% before a session", run: () => approx(steadyBefore(3), 0.3836, 0.001, "trust") });
cases.push({ name: "the run's trust curve approaches the fixed point (every 2 months, month 11)", run: () => {
  const lv = { ...LEVEL1, venues: [{ x: 0, y: 0, type: "library" as const, t0: 0.25 }], people: [] };
  const t = trustCurves(lv, { cad: [2], ft: [false] });
  return approx(t.before[0][10], steadyBefore(2), 0.02, "trust before month 11");
} });
cases.push({ name: "hours: monthly 36, every 2 months 18, every 3 months 12, follow-through 8", run: () => {
  const a = costOf({ cad: [3], ft: [false] }), b = costOf({ cad: [2], ft: [false] }), c = costOf({ cad: [1], ft: [true] }), z = costOf({ cad: [0], ft: [true] });
  return { ok: a === 36 && b === 18 && c === 20 && z === 0, detail: a + " " + b + " " + c + " " + z };
} });

for (let i = 0; i < LEVEL1_MUST_FAIL.length; i++) {
  const f = LEVEL1_MUST_FAIL[i];
  cases.push({ name: "L1 must fail: " + f.name, run: () => {
    const r = evaluate(LEVEL1, f.d);
    return { ok: !r.pass && r.cause.length > 0, detail: r.title + " | " + r.cause };
  } });
}
cases.push({ name: "L1 spread thin reaches 3 people or fewer", run: () => {
  const r = evaluate(LEVEL1, LEVEL1_MUST_FAIL[1].d);
  return { ok: r.nextCount <= 3 && r.cost <= LEVEL1.hours, detail: r.nextCount + " next steps, " + r.cost + " h" };
} });
cases.push({ name: "L1 reference passes", run: () => {
  const r = evaluate(LEVEL1, LEVEL1.reference);
  return { ok: r.pass, detail: r.title + " | " + r.cost + " h | " + r.cause };
} });
cases.push({ name: "L1 every mark is reachable in one plan, and passing is rare", run: () => {
  const s = solve(LEVEL1);
  return { ok: s.all3 && s.passing > 0 && s.passing / s.total < 0.05, detail: "best " + s.best + ", passing " + s.passing + " of " + s.total + " plans within the hours, cheapest pass " + s.cheapCost + " h" };
} });

cases.push({ name: "daily: 30 days generated, reference passes, thin fails, deterministic", run: () => {
  const t0 = utcDayNumber();
  let bad = 0, fallback = 0;
  for (let k = 0; k < 30; k++) {
    const lv = generateDaily(t0 + k);
    if (!lv) { fallback++; continue; }
    if (!evaluate(lv, lv.reference).pass) bad++;
    if (evaluate(lv, { cad: [1, 1, 1, 1, 1], ft: [true, true, true, true, true] }).pass) bad++;
    const again = generateDaily(t0 + k);
    if (JSON.stringify(again) !== JSON.stringify(lv)) bad++;
  }
  const today = dailyLevel(t0);
  return { ok: bad === 0 && fallback === 0 && today.id === "d" + t0, detail: "bad " + bad + ", fallback " + fallback };
} });

const fails = runChecks("Cadence", cases);
process.exitCode = fails ? 1 : 0;
