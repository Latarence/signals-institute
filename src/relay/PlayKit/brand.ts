// Per-product look. Each landing passes its own brand (same tokens as its Trivia bank, plus a few
// surface colours from its tailwind config). The game draws with these and nothing else.

export interface PlayBrand {
  product: string; // public product name, e.g. "Chrona"
  accent: string; // highlights, live data
  button: string; // primary button background
  buttonInk: string; // primary button text
  bg: string; // page/board background
  panel: string; // raised surfaces
  panel2: string; // controls, inputs
  line: string; // hairlines and grid
  ink: string; // main text
  muted: string; // secondary text
  good: string;
  bad: string;
  warn: string;
  productHref: string; // where "Run a real simulation in <product>" goes
  triviaHref: string; // back to the site's daily trivia
}

export const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const SANS = 'inherit';

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1, 7), 16);
  const pb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "rgb(" + ch(16) + "," + ch(8) + "," + ch(0) + ")";
}
