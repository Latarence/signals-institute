// Daily trivia selection. Canonical copy: ~/ahl/common/frontend/src/components/Trivia/daily.ts
// (copy-not-import: each landing carries its own copy). Mirrored exactly by
// ~/latarence/scripts/trivia_of_the_day.py so the social "trivia of the day"
// is question 1 of the same set the site serves. Change both together.

export type TriviaQuestion = {
  id: string;
  topic: string;
  q: string;
  options: string[]; // exactly 4
  answer: number; // index into options
  explain: string;
  source: string;
  learnMore?: string; // path on this site, e.g. "/features"
};

export type TriviaBrand = {
  accent: string; // text, borders, highlights
  button: string; // primary button background
  buttonInk: string; // primary button text
};

export type TriviaBank = {
  slug: string;
  name: string;
  domain: string;
  topics: string;
  brand: TriviaBrand;
  questions: TriviaQuestion[];
};

export type DailyQuestion = TriviaQuestion & { shown: string[]; shownAnswer: number };

export const PER_DAY = 5;

// FNV-1a, 32-bit, over ASCII strings.
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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Days since 1970-01-01 in UTC: everyone gets the same set, rolling over at 00:00 UTC.
export function utcDayNumber(d: Date = new Date()): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

// Days before SCHEDULE_EPOCH keep the original per-cycle deal (legacyOrderAndPos), so
// past dates stay exactly as they were. That deal reshuffled at a fixed day boundary,
// so questions from the last days of one cycle could come back within days.
// 2026-10-16 itself is the same under both deals, so moving the epoch from 20742 to
// 20743 changed no date that had already been served.
export const SCHEDULE_EPOCH = 20743; // 2026-10-17 UTC

function legacyOrderAndPos(ids: string[], slug: string, day: number): { order: string[]; pos: number } {
  const daysPerCycle = Math.max(1, Math.floor(ids.length / PER_DAY));
  const cycle = Math.floor(day / daysPerCycle);
  return { order: shuffle(ids, mulberry32(fnv1a(`${slug}:${cycle}`))), pos: day % daysPerCycle };
}

function legacyIds(ids: string[], slug: string, day: number): string[] {
  const { order, pos } = legacyOrderAndPos(ids, slug, day);
  return order.slice(pos * PER_DAY, pos * PER_DAY + PER_DAY);
}

// From SCHEDULE_EPOCH on, the bank is dealt as one fixed sequence, repeated end to end. Every
// question therefore comes back exactly one bank (n questions) later, which is at least
// floor(n / PER_DAY) days. The sequence puts the questions least recently shown under the
// legacy deal (looking back floor(n / PER_DAY) days before the epoch) first and the most
// recent last, so the switch-over keeps the same minimum gap: a question shown r-th most
// recently before the epoch is at least floor(r / PER_DAY) + 1 days old, and it is placed
// n - 1 - r slots into the sequence. Ties are broken by a fixed seeded shuffle.
// Adding or dropping questions changes n and so the schedule from that day forward.
function streamOrder(ids: string[], slug: string): string[] {
  const lookback = Math.max(1, Math.floor(ids.length / PER_DAY));
  const last = new Map<string, number>();
  for (let d = SCHEDULE_EPOCH - lookback; d < SCHEDULE_EPOCH; d++) {
    for (const id of legacyIds(ids, slug, d)) last.set(id, d);
  }
  const base = shuffle(ids, mulberry32(fnv1a(`${slug}:stream`)));
  const rank = new Map(base.map((id, i) => [id, i]));
  return base.slice().sort(
    (a, b) => (last.get(a) ?? -1) - (last.get(b) ?? -1) || (rank.get(a) as number) - (rank.get(b) as number),
  );
}

export function dailyIds(bank: TriviaBank, day: number): string[] {
  const ids = bank.questions.map((q) => q.id).sort();
  if (day < SCHEDULE_EPOCH) return legacyIds(ids, bank.slug, day);
  const n = ids.length;
  const order = streamOrder(ids, bank.slug);
  const first = (day - SCHEDULE_EPOCH) * PER_DAY;
  const out: string[] = [];
  for (let g = first; g < first + Math.min(PER_DAY, n); g++) out.push(order[g % n]);
  return out;
}

export function dailySet(bank: TriviaBank, day: number): DailyQuestion[] {
  const byId = new Map(bank.questions.map((q) => [q.id, q]));
  return dailyIds(bank, day).map((id) => {
    const q = byId.get(id) as TriviaQuestion;
    const perm = shuffle([0, 1, 2, 3], mulberry32(fnv1a(`${id}:${day}`)));
    return { ...q, shown: perm.map((i) => q.options[i]), shownAnswer: perm.indexOf(q.answer) };
  });
}
