// Headless checks: each level ships designs that must fail and a reference design that must pass, so every
// level is provably solvable, plus physics unit checks against textbook values. Run under Node (bundle the
// test file with esbuild first). No DOM here.

export interface CheckCase {
  name: string;
  run: () => { ok: boolean; detail: string };
}

export function approx(got: number, want: number, tol: number, what: string): { ok: boolean; detail: string } {
  const ok = Math.abs(got - want) <= tol;
  return { ok, detail: what + ": got " + got.toFixed(4) + ", want " + want + " ± " + tol };
}

export function runChecks(title: string, cases: CheckCase[]): number {
  let fails = 0;
  // eslint-disable-next-line no-console
  console.log("== " + title);
  for (let i = 0; i < cases.length; i++) {
    let r: { ok: boolean; detail: string };
    try {
      r = cases[i].run();
    } catch (e) {
      r = { ok: false, detail: "threw " + String(e) };
    }
    if (!r.ok) fails++;
    // eslint-disable-next-line no-console
    console.log((r.ok ? "PASS " : "FAIL ") + cases[i].name + " | " + r.detail);
  }
  // eslint-disable-next-line no-console
  console.log(fails ? fails + " FAILED" : "ALL PASS (" + cases.length + ")");
  return fails;
}
