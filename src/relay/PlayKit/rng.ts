// Seeded randomness and the daily seed. Canonical copy: common/frontend/src/components/PlayKit/
// (copy-not-import: each landing carries its own copy). The day number matches Trivia's utcDayNumber,
// so a site's daily trivia and daily level roll over together at 00:00 UTC.

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function utcDayNumber(d: Date = new Date()): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

/** Deterministic RNG for (game slug, UTC day). Same level for everyone on the same day. */
export function dailyRng(slug: string, day: number = utcDayNumber()): () => number {
  return mulberry32(fnv1a(slug + ":" + day));
}

export function dayLabel(day: number): string {
  const d = new Date(day * 86400000);
  return d.toISOString().slice(0, 10);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
export const range = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r();
