// The DOM frame every game shares: header (name, level tabs, How to play, About the science, sound), the
// How to play section (shown first, plain words), the brief, a stage that holds the canvas, a controls row,
// a result card (with a Share button on a pass), an About the science panel with the honest model notes,
// and a standing link into the product. Plain DOM, no framework; styles are scoped under .pk.
import type { PlayBrand } from "./brand";
import { MONO, withAlpha } from "./brand";
import { Synth } from "./audio";
import { createShare, marksGrid, utcDay, type ShareWidget } from "./share";

export interface LevelTab {
  id: string;
  label: string;
  done?: boolean;
}

export interface AboutSection {
  h: string;
  body: string[]; // paragraphs (plain text)
}

/** The player-facing rules, in plain words and complete sentences. Shown first, above the board. */
export interface HowTo {
  goal: string[]; // 1. The goal
  control: string[]; // 2. How to play
  cost: string[]; // 3. What things cost
  earn: string[]; // 4. How you earn
  hard: string[]; // 5. The challenge
  tip: string; // 6. Quick tip
}

// TSI headings (Principal, 2026-10-17): "How to play" in place of "What you control", "The challenge" in place of
// "What makes it hard".
export const HOWTO_HEADINGS = ["The goal", "How to play", "What things cost", "How you earn", "The challenge", "Quick tip"];

export interface ResultCard {
  pass: boolean;
  title: string;
  cause?: string; // the named reason (failure that teaches) or the note on a pass
  marks?: { label: string; got: boolean }[];
  stats?: [string, string][];
  actions?: { label: string; primary?: boolean; onClick: () => void }[];
  /** A pass gets a Share button by default (text built from the game, level, marks and UTC day).
   *  Pass false to hide it, or { text } to use the game's own wording (still no link: it is added). */
  share?: false | { text: string };
}

export interface Shell {
  root: HTMLElement;
  stage: HTMLElement;
  controls: HTMLElement;
  audio: Synth;
  setLevels(tabs: LevelTab[], active: string): void;
  setBrief(title: string, text: string, goals?: string[]): void;
  showCard(card: ResultCard): void;
  hideCard(): void;
  toast(msg: string, ms?: number): void;
  openAbout(): void;
  openHowTo(): void;
  button(label: string, onClick: () => void, opts?: { primary?: boolean; title?: string; parent?: HTMLElement }): HTMLButtonElement;
  slider(o: { label: string; min: number; max: number; step: number; value: number; fmt: (v: number) => string; onInput: (v: number) => void; parent?: HTMLElement }): { set(v: number): void; el: HTMLElement; input: HTMLInputElement };
  segmented(o: { label?: string; options: { id: string; label: string; title?: string }[]; value: string; onChange: (id: string) => void; parent?: HTMLElement }): { set(id: string): void; el: HTMLElement };
  group(parent?: HTMLElement): HTMLElement;
  track(event: string, params?: Record<string, string | number>): void;
  destroy(): void;
}

export interface ShellOptions {
  brand: PlayBrand;
  slug: string; // e.g. "line-of-sight" (analytics + ref param)
  name: string; // public game name
  tagline: string;
  about: AboutSection[];
  howTo?: HowTo;
  onLevel: (id: string) => void;
  productLine?: string; // overrides "Run a real simulation in <product>"
}

const CSS = (b: PlayBrand) => `
.pk{--a:${b.accent};--btn:${b.button};--bink:${b.buttonInk};--bg:${b.bg};--p:${b.panel};--p2:${b.panel2};--ln:${b.line};--ink:${b.ink};--mu:${b.muted};--good:${b.good};--bad:${b.bad};--warn:${b.warn};
 color:var(--ink);background:var(--bg);border:1px solid var(--ln);border-radius:4px;position:relative;font-size:14px;line-height:1.45;text-align:left;-webkit-tap-highlight-color:transparent}
.pk *{box-sizing:border-box}
.pk button{font:inherit;color:inherit;cursor:pointer}
.pk .pk-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:12px 14px;border-bottom:1px solid var(--ln)}
.pk .pk-name{font-weight:700;font-size:16px;letter-spacing:.01em}
.pk .pk-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.pk .pk-howbtn{border-color:var(--a);color:var(--a)}
.pk .pk-howbtn[aria-expanded=true]{background:${withAlpha(b.accent, 0.1)}}
.pk .pk-tag{color:var(--mu);font-size:12px;font-family:${MONO}}
.pk .pk-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.pk .pk-tab,.pk .pk-btn,.pk .pk-seg button{border:1px solid var(--ln);background:var(--p2);border-radius:3px;padding:7px 12px;font-size:13px;min-height:36px}
.pk .pk-tab[aria-pressed=true],.pk .pk-seg button[aria-pressed=true]{border-color:var(--a);color:var(--a);background:${withAlpha(b.accent, 0.1)}}
.pk .pk-tab .pk-done{color:var(--good);margin-left:6px}
.pk .pk-btn:hover,.pk .pk-tab:hover,.pk .pk-seg button:hover{border-color:${withAlpha(b.accent, 0.6)}}
.pk .pk-btn.pk-primary{background:var(--btn);color:var(--bink);border-color:var(--btn);font-weight:600}
.pk .pk-btn:disabled{opacity:.45;cursor:default}
.pk .pk-icon{min-width:36px;padding:7px 10px}
.pk .pk-brief{padding:10px 14px;border-bottom:1px solid var(--ln);display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline}
.pk .pk-brief b{font-weight:600}
.pk .pk-brief .pk-text{color:var(--mu);flex:1 1 320px}
.pk .pk-goal{font-family:${MONO};font-size:12px;border:1px solid var(--ln);border-radius:3px;padding:2px 7px;color:var(--ink)}
.pk .pk-stage{position:relative;background:var(--bg);overflow:hidden}
.pk .pk-controls{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:10px 14px;border-top:1px solid var(--ln);background:var(--p)}
.pk .pk-group{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pk .pk-grow{flex:1 1 auto}
.pk .pk-sl{display:flex;flex-direction:column;gap:2px;min-width:150px;flex:1 1 150px;max-width:260px}
.pk .pk-sl span{font-size:12px;color:var(--mu);display:flex;justify-content:space-between;gap:8px}
.pk .pk-sl span em{font-style:normal;font-family:${MONO};color:var(--ink)}
.pk input[type=range]{width:100%;accent-color:var(--a);height:28px}
.pk .pk-seg{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.pk .pk-seg>i{font-style:normal;font-size:12px;color:var(--mu);margin-right:4px}
.pk .pk-foot{display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--ln);font-size:13px}
.pk .pk-foot a{color:var(--a);text-decoration:none}
.pk .pk-foot a:hover{text-decoration:underline}
.pk .pk-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:var(--p);border:1px solid var(--ln);border-radius:3px;padding:6px 12px;font-size:13px;pointer-events:none;opacity:0;transition:opacity .2s;max-width:90%;text-align:center}
.pk .pk-toast.on{opacity:1}
.pk .pk-card{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,calc(100% - 20px));background:var(--p);border:1px solid var(--ln);border-radius:4px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
.pk .pk-card.pass{border-color:${withAlpha(b.good, 0.7)}}
.pk .pk-card.fail{border-color:${withAlpha(b.bad, 0.7)}}
.pk .pk-card h3{margin:0 0 4px;font-size:17px}
.pk .pk-card.pass h3{color:var(--good)}
.pk .pk-card.fail h3{color:var(--bad)}
.pk .pk-card p{margin:0 0 10px;color:var(--ink)}
.pk .pk-marks{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
.pk .pk-mark{font-size:12px;border:1px solid var(--ln);border-radius:3px;padding:3px 8px;color:var(--mu)}
.pk .pk-mark.got{border-color:var(--a);color:var(--a)}
.pk .pk-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px 12px;margin:0 0 12px;font-family:${MONO};font-size:12px}
.pk .pk-stats div{display:flex;justify-content:space-between;gap:6px;border-bottom:1px dotted var(--ln);padding:2px 0}
.pk .pk-stats span{color:var(--mu)}
.pk .pk-actions{display:flex;gap:8px;flex-wrap:wrap}
.pk .pk-modal{position:absolute;inset:0;background:${withAlpha(b.bg, 0.92)};display:none;z-index:5;overflow:auto;padding:18px}
.pk .pk-modal.on{display:block}
.pk .pk-modal .pk-sheet{max-width:720px;margin:0 auto;background:var(--p);border:1px solid var(--ln);border-radius:4px;padding:18px 20px}
.pk .pk-modal h3{margin:0 0 10px;font-size:18px}
.pk .pk-modal h4{margin:16px 0 6px;font-size:14px;color:var(--a)}
.pk .pk-modal p{margin:0 0 8px;color:var(--ink)}
.pk kbd{font-family:${MONO};font-size:11px;border:1px solid var(--ln);border-radius:3px;padding:0 4px}
.pk .pk-how{border-bottom:1px solid var(--ln);background:var(--p);padding:14px}
.pk .pk-how[hidden]{display:none}
.pk .pk-how-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;margin:0 0 10px}
.pk .pk-how-top h2{margin:0;font-size:17px;font-weight:700}
.pk .pk-how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}
.pk .pk-how-sec{border:1px solid var(--ln);border-radius:4px;background:var(--bg);padding:10px 12px;min-width:0}
.pk .pk-how-sec h3{margin:0 0 6px;font-size:14px;font-weight:700;color:var(--a)}
.pk .pk-how-sec p{margin:0 0 6px;font-size:14px;line-height:1.5;color:var(--ink)}
.pk .pk-how-sec ul{margin:0;padding:0 0 0 18px}
.pk .pk-how-sec li{margin:0 0 6px;font-size:14px;line-height:1.5;color:var(--ink)}
.pk .pk-how-sec p:last-child,.pk .pk-how-sec li:last-child{margin-bottom:0}
.pk .pk-how-foot{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
@media (max-width:640px){.pk .pk-how{padding:12px 10px}.pk .pk-how-grid{grid-template-columns:1fr}.pk .pk-stage{display:flex;flex-direction:column}.pk .pk-card{order:2;position:relative;left:auto;bottom:auto;transform:none;width:auto;margin:0;border-left:0;border-right:0;border-bottom:0;border-radius:0;box-shadow:none}.pk .pk-tabs{margin-left:0;width:100%}.pk .pk-head{padding:10px}.pk .pk-controls{padding:10px}.pk .pk-sl{max-width:none}}
@media (prefers-reduced-motion:reduce){.pk .pk-toast{transition:none}}
`;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Every game has a main level then today's level; the daily tab says "Today" or carries a day id. */
function isDailyTab(list: LevelTab[], i: number): boolean {
  return /today|daily/i.test(list[i].id + " " + list[i].label) || (list.length > 1 && i === list.length - 1);
}

export function createShell(host: HTMLElement, o: ShellOptions): Shell {
  const b = o.brand;
  const root = h("div", "pk");
  root.setAttribute("data-game", o.slug);
  const style = h("style");
  style.textContent = CSS(b);
  root.appendChild(style);
  const audio = new Synth();

  // header
  const head = h("div", "pk-head");
  const nameBox = h("div");
  const titleRow = h("div", "pk-title");
  titleRow.appendChild(h("div", "pk-name", o.name));
  nameBox.appendChild(titleRow);
  nameBox.appendChild(h("div", "pk-tag", o.tagline));
  head.appendChild(nameBox);
  const tabs = h("div", "pk-tabs");
  head.appendChild(tabs);
  const tools = h("div", "pk-group");
  head.appendChild(tools);
  root.appendChild(head);

  // How to play: closed on every page load (Principal, 2026-10-17), opened and closed by the "How to play"
  // button beside the game's name; Esc closes it. It sits above the board when open.
  let how: HTMLElement | null = null;
  if (o.howTo) {
    const ht = o.howTo;
    how = h("section", "pk-how");
    how.id = "pk-how-" + o.slug;
    how.setAttribute("aria-label", "How to play " + o.name);
    const top = h("div", "pk-how-top");
    top.appendChild(h("h2", "", "How to play " + o.name));
    const hide = h("button", "pk-btn", "Hide");
    hide.addEventListener("click", () => setHow(false));
    top.appendChild(hide);
    how.appendChild(top);
    const grid = h("div", "pk-how-grid");
    const parts: string[][] = [ht.goal, ht.control, ht.cost, ht.earn, ht.hard, [ht.tip]];
    for (let i = 0; i < parts.length; i++) {
      const sec = h("div", "pk-how-sec");
      sec.appendChild(h("h3", "", i + 1 + ". " + HOWTO_HEADINGS[i]));
      const lines = parts[i];
      if (lines.length > 1) {
        const ul = h("ul");
        for (let j = 0; j < lines.length; j++) ul.appendChild(h("li", "", lines[j]));
        sec.appendChild(ul);
      } else if (lines.length) sec.appendChild(h("p", "", lines[0]));
      grid.appendChild(sec);
    }
    how.appendChild(grid);
    const hf = h("div", "pk-how-foot");
    const go = h("button", "pk-btn pk-primary", "Start playing");
    go.addEventListener("click", () => {
      setHow(false);
      try {
        stage.scrollIntoView({ block: "nearest" });
      } catch {
        /* older browsers */
      }
    });
    hf.appendChild(go);
    const more = h("button", "pk-btn", "Read more: about the science");
    more.addEventListener("click", () => openAboutPanel());
    hf.appendChild(more);
    how.appendChild(hf);
    root.appendChild(how);
    how.hidden = true;
  }
  function setHow(open: boolean) {
    if (!how) return;
    how.hidden = !open;
    if (howBtn) howBtn.setAttribute("aria-expanded", String(open));
  }
  let howBtn: HTMLButtonElement | null = null;

  const brief = h("div", "pk-brief");
  root.appendChild(brief);
  const stage = h("div", "pk-stage");
  root.appendChild(stage);
  const toastEl = h("div", "pk-toast");
  stage.appendChild(toastEl);
  const card = h("div", "pk-card");
  card.style.display = "none";
  stage.appendChild(card);
  const controls = h("div", "pk-controls");
  root.appendChild(controls);

  const foot = h("div", "pk-foot");
  const ref = "?ref=play-" + o.slug;
  const prod = h("a", "", (o.productLine || "Run a real simulation in " + b.product) + " →") as HTMLAnchorElement;
  prod.href = b.productHref + (b.productHref.indexOf("?") >= 0 ? "&" : "?") + ref.slice(1);
  prod.addEventListener("click", () => track("play_to_product"));
  const triv = h("a", "", "Today's " + b.product + " trivia") as HTMLAnchorElement;
  triv.href = b.triviaHref;
  foot.appendChild(prod);
  foot.appendChild(triv);
  root.appendChild(foot);

  const modal = h("div", "pk-modal");
  const sheet = h("div", "pk-sheet");
  sheet.appendChild(h("h3", "", "About the science behind " + o.name));
  for (let i = 0; i < o.about.length; i++) {
    sheet.appendChild(h("h4", "", o.about[i].h));
    for (let j = 0; j < o.about[i].body.length; j++) sheet.appendChild(h("p", "", o.about[i].body[j]));
  }
  const closeBtn = h("button", "pk-btn pk-primary", "Back to the game");
  closeBtn.addEventListener("click", () => modal.classList.remove("on"));
  sheet.appendChild(closeBtn);
  modal.appendChild(sheet);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("on");
  });
  root.appendChild(modal);
  function openAboutPanel() {
    modal.classList.add("on");
    track("play_about");
  }

  host.appendChild(root);

  // unlock audio on the first gesture anywhere in the game
  const unlock = () => audio.unlock();
  root.addEventListener("pointerdown", unlock);
  root.addEventListener("keydown", unlock);

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let activeTab: { label: string; daily: boolean } = { label: "", daily: false };
  let shareW: ShareWidget | null = null;

  /** The words a pass shares: the real result, short, no spoilers (marks become a grid). */
  function shareText(c: ResultCard): string {
    const where = activeTab.daily
      ? "today's " + o.name
      : o.name + (activeTab.label ? " (" + activeTab.label.replace(/^\s*\d+\s*·\s*/, "") + ")" : "");
    const marks = c.marks || [];
    let got = 0;
    for (let i = 0; i < marks.length; i++) if (marks[i].got) got++;
    const grid: boolean[] = [];
    for (let i = 0; i < marks.length; i++) grid.push(marks[i].got);
    return (
      "I solved " + where + " on " + b.product +
      (marks.length ? " with " + got + " of " + marks.length + " marks" : "") +
      ". Can you?\n" + (marks.length ? marksGrid(grid) + " " : "") + utcDay() + " UTC"
    );
  }

  function track(event: string, params?: Record<string, string | number>) {
    try {
      const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
      if (g) g("event", event, Object.assign({ game: o.slug }, params || {}));
    } catch {
      /* analytics is optional */
    }
  }

  const shell: Shell = {
    root,
    stage,
    controls,
    audio,
    setLevels(list, active) {
      tabs.innerHTML = "";
      for (let i = 0; i < list.length; i++) if (list[i].id === active) activeTab = { label: list[i].label, daily: isDailyTab(list, i) };
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const btn = h("button", "pk-tab", t.label);
        btn.setAttribute("aria-pressed", String(t.id === active));
        if (t.done) {
          const d = h("span", "pk-done", "✓");
          d.setAttribute("aria-label", "completed");
          btn.appendChild(d);
        }
        btn.addEventListener("click", () => {
          audio.ui();
          o.onLevel(t.id);
        });
        tabs.appendChild(btn);
      }
    },
    setBrief(title, text, goals) {
      brief.innerHTML = "";
      brief.appendChild(h("b", "", title));
      brief.appendChild(h("span", "pk-text", text));
      if (goals) for (let i = 0; i < goals.length; i++) brief.appendChild(h("span", "pk-goal", goals[i]));
    },
    showCard(c) {
      card.innerHTML = "";
      card.className = "pk-card " + (c.pass ? "pass" : "fail");
      card.appendChild(h("h3", "", c.title));
      if (c.cause) card.appendChild(h("p", "", c.cause));
      if (c.marks && c.marks.length) {
        const m = h("div", "pk-marks");
        for (let i = 0; i < c.marks.length; i++) {
          const k = c.marks[i];
          m.appendChild(h("span", "pk-mark" + (k.got ? " got" : ""), (k.got ? "■ " : "□ ") + k.label));
        }
        card.appendChild(m);
      }
      if (c.stats && c.stats.length) {
        const s = h("div", "pk-stats");
        for (let i = 0; i < c.stats.length; i++) {
          const row = h("div");
          row.appendChild(h("span", "", c.stats[i][0]));
          row.appendChild(h("b", "", c.stats[i][1]));
          s.appendChild(row);
        }
        card.appendChild(s);
      }
      const acts = h("div", "pk-actions");
      const list = c.actions || [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const btn = h("button", "pk-btn" + (a.primary ? " pk-primary" : ""), a.label);
        btn.addEventListener("click", () => {
          audio.ui();
          a.onClick();
        });
        acts.appendChild(btn);
      }
      if (shareW) {
        shareW.destroy();
        shareW = null;
      }
      if (c.pass && c.share !== false) {
        const own = c.share ? c.share.text : "";
        const text = own || shareText(c);
        shareW = createShare({
          label: "Share",
          colors: { accent: b.accent, bg: b.bg, panel: b.panel2, line: b.line, ink: b.ink, button: b.button, buttonInk: b.buttonInk },
          spec: () => ({ text, url: location.origin + location.pathname, campaign: "play", title: o.name + " - " + b.product }),
          onShare: (method) => track("share", { method, content_type: "play", level: activeTab.daily ? "daily" : "main" }),
        });
        acts.appendChild(shareW.el);
      }
      card.appendChild(acts);
      card.style.display = "block";
    },
    hideCard() {
      if (shareW) shareW.close();
      card.style.display = "none";
    },
    toast(msg, ms = 1800) {
      toastEl.textContent = msg;
      toastEl.classList.add("on");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("on"), ms);
    },
    openAbout() {
      openAboutPanel();
    },
    openHowTo() {
      setHow(true);
      track("play_howto");
      if (how)
        try {
          how.scrollIntoView({ block: "nearest" });
        } catch {
          /* older browsers */
        }
    },
    button(label, onClick, opts) {
      const btn = h("button", "pk-btn" + (opts && opts.primary ? " pk-primary" : ""), label);
      if (opts && opts.title) btn.title = opts.title;
      btn.addEventListener("click", () => {
        audio.unlock();
        onClick();
      });
      ((opts && opts.parent) || controls).appendChild(btn);
      return btn;
    },
    slider(so) {
      const wrap = h("label", "pk-sl");
      const top = h("span");
      top.appendChild(document.createTextNode(so.label));
      const val = h("em", "", so.fmt(so.value));
      top.appendChild(val);
      const input = h("input") as HTMLInputElement;
      input.type = "range";
      input.min = String(so.min);
      input.max = String(so.max);
      input.step = String(so.step);
      input.value = String(so.value);
      input.setAttribute("aria-label", so.label);
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        val.textContent = so.fmt(v);
        so.onInput(v);
      });
      wrap.appendChild(top);
      wrap.appendChild(input);
      (so.parent || controls).appendChild(wrap);
      return {
        el: wrap,
        input,
        set(v: number) {
          input.value = String(v);
          val.textContent = so.fmt(v);
        },
      };
    },
    segmented(so) {
      const wrap = h("div", "pk-seg");
      if (so.label) wrap.appendChild(h("i", "", so.label));
      const btns: HTMLButtonElement[] = [];
      for (let i = 0; i < so.options.length; i++) {
        const op = so.options[i];
        const btn = h("button", "", op.label);
        if (op.title) btn.title = op.title;
        btn.setAttribute("aria-pressed", String(op.id === so.value));
        btn.addEventListener("click", () => {
          audio.ui();
          for (let j = 0; j < btns.length; j++) btns[j].setAttribute("aria-pressed", String(j === i));
          so.onChange(op.id);
        });
        btns.push(btn);
        wrap.appendChild(btn);
      }
      (so.parent || controls).appendChild(wrap);
      return {
        el: wrap,
        set(id: string) {
          for (let j = 0; j < btns.length; j++) btns[j].setAttribute("aria-pressed", String(so.options[j].id === id));
        },
      };
    },
    group(parent) {
      const g = h("div", "pk-group");
      (parent || controls).appendChild(g);
      return g;
    },
    track,
    destroy() {
      if (toastTimer) clearTimeout(toastTimer);
      if (shareW) shareW.destroy();
      audio.setMuted(true);
      document.removeEventListener("keydown", onEsc);
      root.remove();
    },
  };

  // header tools; How to play sits beside the game's name
  if (how) {
    howBtn = h("button", "pk-btn pk-howbtn", "How to play");
    howBtn.setAttribute("aria-expanded", "false");
    howBtn.setAttribute("aria-controls", how.id);
    howBtn.addEventListener("click", () => {
      if (how && !how.hidden) setHow(false);
      else shell.openHowTo();
    });
    titleRow.appendChild(howBtn);
  }
  // Esc closes the About panel first, then How to play
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (modal.classList.contains("on")) modal.classList.remove("on");
    else if (how && !how.hidden) {
      setHow(false);
      if (howBtn) howBtn.focus();
    }
  };
  document.addEventListener("keydown", onEsc);
  const about = h("button", "pk-btn", "About the science");
  about.addEventListener("click", () => shell.openAbout());
  tools.appendChild(about);
  const snd = h("button", "pk-btn pk-icon", "Sound on");
  snd.setAttribute("aria-pressed", "true");
  snd.addEventListener("click", () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    snd.textContent = audio.muted ? "Sound off" : "Sound on";
    snd.setAttribute("aria-pressed", String(!audio.muted));
  });
  tools.appendChild(snd);
  (shell as Shell & { soundButton?: HTMLElement }).soundButton = snd;

  track("play_start");
  return shell;
}
