// Daily trivia for a static site (plain DOM). Adapted from the canonical React TriviaGame.tsx
// (copy-not-import): same bank schema, same daily.ts selection, same share.ts. Five questions a day, chosen
// by UTC day number; progress and streak live in this browser's localStorage only. No accounts, no backend.
import { dailySet, utcDayNumber, PER_DAY } from "./daily";
import type { DailyQuestion, TriviaBank } from "./daily";
import { createShare, marksGrid, utcDay } from "./share";
import type { ShareWidget } from "./share";

export interface TriviaTheme {
  bg: string; // card background
  line: string; // hairlines
  ink: string; // main text
  muted: string; // secondary text
  good: string;
  bad: string;
  font?: string;
  heading?: string;
  accent?: string; // overrides bank.brand (e.g. a CSS var that follows the site's light/dark theme)
  button?: string;
  buttonInk?: string;
}

type DayRecord = { picks: number[] };
type Saved = { streak: number; best: number; lastDay: number; days: { [k: string]: DayRecord } };

const LETTERS = ["A", "B", "C", "D"];

function fresh(): Saved {
  return { streak: 0, best: 0, lastDay: -1, days: {} };
}
function load(key: string): Saved {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fresh();
    const v = JSON.parse(raw);
    const s = fresh();
    if (v && typeof v === "object") {
      if (typeof v.streak === "number") s.streak = v.streak;
      if (typeof v.best === "number") s.best = v.best;
      if (typeof v.lastDay === "number") s.lastDay = v.lastDay;
      if (v.days && typeof v.days === "object") s.days = v.days;
    }
    return s;
  } catch (e) {
    return fresh();
  }
}
function store(key: string, v: Saved): void {
  try {
    const keep = Object.keys(v.days).map(Number).sort((a, b) => b - a).slice(0, 14);
    const days: { [k: string]: DayRecord } = {};
    keep.forEach((d) => (days[d] = v.days[d]));
    window.localStorage.setItem(key, JSON.stringify({ streak: v.streak, best: v.best, lastDay: v.lastDay, days }));
  } catch (e) {
    /* storage unavailable: the game still works for this visit */
  }
}
function untilNextSet(now: Date): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const mins = Math.max(0, Math.round((next - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? h + "h " + m + "m" : m + "m";
}
function track(event: string, params: { [k: string]: string | number }): void {
  try {
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (g) g("event", event, params);
  } catch (e) {
    /* analytics is optional */
  }
}

function css(bank: TriviaBank, t: TriviaTheme): string {
  const b = { accent: t.accent || bank.brand.accent, button: t.button || bank.brand.button, buttonInk: t.buttonInk || bank.brand.buttonInk };
  return (
    ".tv{--a:" + b.accent + ";--btn:" + b.button + ";--bink:" + b.buttonInk + ";--bg:" + t.bg + ";--ln:" + t.line + ";--ink:" + t.ink + ";--mu:" + t.muted + ";--good:" + t.good + ";--bad:" + t.bad + ";" +
    "max-width:760px;margin:0 auto;color:var(--ink);font-family:" + (t.font || "inherit") + ";text-align:left}" +
    ".tv *{box-sizing:border-box}" +
    ".tv-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}" +
    ".tv-dots{display:flex;gap:6px}.tv-dot{display:block;width:12px;height:12px;border-radius:2px;border:1px solid var(--ln)}" +
    ".tv-streak{margin:0;color:var(--mu);font-size:15px}.tv-streak b{color:var(--a);font-weight:600}" +
    ".tv-card{border:1px solid var(--ln);border-radius:4px;background:var(--bg);padding:24px}" +
    "@media(min-width:720px){.tv-card{padding:32px}}" +
    ".tv-kick{margin:0 0 14px;color:var(--a);font-size:13px;letter-spacing:.08em;text-transform:uppercase}" +
    ".tv-q{margin:0 0 22px;font-size:22px;line-height:1.3;font-weight:600;color:var(--ink);font-family:" + (t.heading || "inherit") + "}" +
    ".tv-opts{display:grid;gap:12px}" +
    ".tv-opt{display:flex;gap:12px;align-items:flex-start;text-align:left;width:100%;border:1px solid var(--ln);border-radius:4px;background:transparent;color:var(--ink);padding:12px 16px;font:inherit;font-size:16px;line-height:1.4;cursor:pointer}" +
    ".tv-opt:hover:not(:disabled){background:rgba(127,127,127,.1)}.tv-opt:disabled{cursor:default}" +
    ".tv-opt:focus-visible,.tv-go:focus-visible{outline:2px solid var(--a);outline-offset:2px}" +
    ".tv-opt span:first-child{flex:none;font-weight:600;color:var(--a)}" +
    ".tv-after{margin-top:24px}.tv-after p{margin:0 0 14px;font-size:16px;line-height:1.5}" +
    ".tv-src{color:var(--mu);font-size:13px!important;overflow-wrap:anywhere}" +
    ".tv-row{display:flex;flex-wrap:wrap;align-items:center;gap:16px}" +
    ".tv-go{border:1px solid var(--btn);background:var(--btn);color:var(--bink);border-radius:4px;padding:12px 24px;font:inherit;font-size:16px;font-weight:600;cursor:pointer}" +
    ".tv-sum{text-align:center;margin-bottom:24px}.tv-sum .tv-big{font-size:44px;font-weight:700;margin:6px 0 12px;color:var(--ink)}" +
    ".tv-sum p{color:var(--mu);margin:0 0 18px;font-size:15px}" +
    ".tv-list{list-style:none;margin:0;padding:0;display:grid;gap:12px}.tv-list li{border:1px solid var(--ln);border-radius:4px;background:var(--bg);padding:20px}" +
    ".tv-list p{margin:0 0 10px;font-size:15px;line-height:1.5}.tv-list p:last-child{margin:0;color:var(--mu)}" +
    ".tv-ok{color:var(--good)}.tv-no{color:var(--bad)}.tv-ans{color:var(--ink)}" +
    ".tv a{color:var(--a)}"
  );
}

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountTrivia(host: HTMLElement, bank: TriviaBank, theme: TriviaTheme): () => void {
  const key = "trivia:" + bank.slug;
  const style = document.createElement("style");
  style.textContent = css(bank, theme);
  document.head.appendChild(style);
  const root = el("div", "tv");
  host.appendChild(root);

  const day = utcDayNumber();
  const set: DailyQuestion[] = dailySet(bank, day);
  let saved = load(key);
  let picks: number[] = saved.days[day] && saved.days[day].picks ? saved.days[day].picks.slice(0, PER_DAY) : [];
  let idx = Math.min(picks.length, PER_DAY - 1);
  let summary = picks.length >= PER_DAY;
  let shareW: ShareWidget | null = null;

  function score(): number {
    let s = 0;
    for (let i = 0; i < picks.length; i++) if (set[i] && picks[i] === set[i].shownAnswer) s++;
    return s;
  }

  function header(): HTMLElement {
    const top = el("div", "tv-top");
    const dots = el("div", "tv-dots");
    dots.setAttribute("aria-label", "Progress");
    for (let i = 0; i < set.length; i++) {
      const d = el("span", "tv-dot");
      const p = picks[i];
      if (p !== undefined) d.style.background = p === set[i].shownAnswer ? theme.good : theme.bad;
      if (i === idx && !summary) d.style.borderColor = theme.accent || bank.brand.accent;
      dots.appendChild(d);
    }
    top.appendChild(dots);
    const live = saved.lastDay >= day - 1 ? saved.streak : 0;
    const st = el("p", "tv-streak");
    st.appendChild(document.createTextNode("Streak "));
    st.appendChild(el("b", "", String(live)));
    st.appendChild(document.createTextNode(" · Best " + saved.best));
    top.appendChild(st);
    return top;
  }

  function choose(opt: number): void {
    if (picks.length !== idx || picks.length >= PER_DAY) return;
    picks = picks.concat([opt]);
    const days: { [k: string]: DayRecord } = {};
    Object.keys(saved.days).forEach((k) => (days[k] = saved.days[k]));
    days[day] = { picks };
    const s: Saved = { streak: saved.streak, best: saved.best, lastDay: saved.lastDay, days };
    if (picks.length === PER_DAY && s.lastDay !== day) {
      s.streak = s.lastDay === day - 1 ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.lastDay = day;
    }
    saved = s;
    store(key, s);
    track("trivia_answer", { q: idx + 1, correct: opt === set[idx].shownAnswer ? 1 : 0 });
    render(true);
  }

  function render(focusAfter?: boolean): void {
    if (shareW) {
      shareW.destroy();
      shareW = null;
    }
    root.innerHTML = "";
    root.appendChild(header());
    if (summary && picks.length >= PER_DAY) {
      const card = el("div", "tv-card tv-sum");
      card.appendChild(el("p", "", "Today's score"));
      card.appendChild(el("div", "tv-big", score() + "/" + PER_DAY));
      card.appendChild(el("p", "", "A new set of " + PER_DAY + " arrives in " + untilNextSet(new Date()) + " (00:00 UTC). Same questions for everyone."));
      const grid: boolean[] = [];
      for (let i = 0; i < set.length; i++) grid.push(picks[i] === set[i].shownAnswer);
      shareW = createShare({
        spec: () => ({
          // score and a right/missed grid only: never the questions or answers
          text: "I got " + score() + " of " + PER_DAY + " on today's trivia from " + bank.name + " (" + utcDay() + " UTC). Can you beat it?\n" + marksGrid(grid),
          url: "https://" + bank.domain + "/trivia",
          campaign: "trivia",
          title: "Daily Trivia · " + bank.name,
        }),
        label: "Share your result",
        primary: true,
        colors: { accent: theme.accent || bank.brand.accent, button: theme.button || bank.brand.button, buttonInk: theme.buttonInk || bank.brand.buttonInk, bg: theme.bg, panel: "transparent", line: theme.line, ink: theme.ink },
        onShare: (method) => track("share", { method, content_type: "trivia" }),
      });
      const wrap = el("div", "tv-row");
      wrap.style.justifyContent = "center";
      wrap.appendChild(shareW.el);
      card.appendChild(wrap);
      root.appendChild(card);
      const list = el("ol", "tv-list");
      for (let i = 0; i < set.length; i++) {
        const q = set[i];
        const right = picks[i] === q.shownAnswer;
        const li = el("li");
        const p1 = el("p");
        p1.appendChild(el("span", right ? "tv-ok" : "tv-no", right ? "Correct" : "Missed"));
        p1.appendChild(document.createTextNode(" · " + q.q));
        li.appendChild(p1);
        const p2 = el("p");
        p2.appendChild(document.createTextNode("Answer: "));
        p2.appendChild(el("span", "tv-ans", q.shown[q.shownAnswer]));
        p2.appendChild(document.createTextNode(". " + q.explain));
        li.appendChild(p2);
        if (q.learnMore) {
          const a = el("a", "", "Learn more") as HTMLAnchorElement;
          a.href = q.learnMore;
          li.appendChild(a);
        }
        list.appendChild(li);
      }
      root.appendChild(list);
      return;
    }
    const q = set[idx];
    const answered = picks.length > idx;
    const pick = picks[idx];
    const card = el("div", "tv-card");
    card.appendChild(el("p", "tv-kick", "Question " + (idx + 1) + " of " + PER_DAY + " · " + q.topic));
    card.appendChild(el("h2", "tv-q", q.q));
    const opts = el("div", "tv-opts");
    let firstBtn: HTMLButtonElement | null = null;
    for (let i = 0; i < q.shown.length; i++) {
      const b = el("button", "tv-opt") as HTMLButtonElement;
      b.type = "button";
      b.appendChild(el("span", "", LETTERS[i]));
      b.appendChild(el("span", "", q.shown[i]));
      if (answered) {
        b.disabled = true;
        if (i === q.shownAnswer) b.style.borderColor = theme.good;
        else if (i === pick) b.style.borderColor = theme.bad;
      } else {
        const k = i;
        b.addEventListener("click", () => choose(k));
        if (!firstBtn) firstBtn = b;
      }
      opts.appendChild(b);
    }
    card.appendChild(opts);
    if (answered) {
      const after = el("div", "tv-after");
      const p = el("p");
      p.appendChild(el("span", pick === q.shownAnswer ? "tv-ok" : "tv-no", pick === q.shownAnswer ? "Correct." : "Missed."));
      p.appendChild(document.createTextNode(" " + q.explain));
      after.appendChild(p);
      after.appendChild(el("p", "tv-src", "Source: " + q.source));
      const row = el("div", "tv-row");
      const go = el("button", "tv-go", idx + 1 < PER_DAY ? "Next question" : "See your score") as HTMLButtonElement;
      go.type = "button";
      go.addEventListener("click", () => {
        if (idx + 1 < PER_DAY) idx++;
        else summary = true;
        render();
        root.scrollIntoView({ block: "nearest" });
      });
      row.appendChild(go);
      if (q.learnMore) {
        const a = el("a", "", "Learn more") as HTMLAnchorElement;
        a.href = q.learnMore;
        row.appendChild(a);
      }
      after.appendChild(row);
      card.appendChild(after);
      root.appendChild(card);
      if (focusAfter) go.focus({ preventScroll: true } as FocusOptions);
      return;
    }
    root.appendChild(card);
  }

  render();
  track("trivia_start", { bank: bank.slug });
  return () => {
    if (shareW) shareW.destroy();
    root.remove();
    style.remove();
  };
}
