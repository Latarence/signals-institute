// Share: one button + a small menu for sharing a real result (a /play level, a /trivia set).
// Plain DOM, no dependencies, no third-party SDKs, no tracking pixels: networks get plain intent URLs.
// Every link carries utm_source=share&utm_medium=<network>&utm_campaign=<play|trivia> so shares can be
// counted at the edge, in GA and in the platform's own analytics.
// Copy-not-import. Canonical twins (keep identical): ~/ahl/common/frontend/src/components/PlayKit/share.ts
// and ~/ahl/common/frontend/src/components/Trivia/share.ts. Copy next to the code that uses it.

export type ShareNetwork = "x" | "facebook" | "linkedin" | "threads" | "reddit";
export type ShareCampaign = "play" | "trivia";

export interface ShareSpec {
  text: string; // the player's real result, short; no link (the link is added per network)
  url: string; // the exact page, without a query string
  campaign: ShareCampaign;
  title?: string; // page title for the system share sheet
}

export interface ShareColors {
  accent?: string; // focus ring
  bg?: string; // menu background
  panel?: string; // button background
  line?: string; // hairlines
  ink?: string; // text
  button?: string; // primary button background
  buttonInk?: string; // primary button text
}

export interface ShareOptions {
  spec: () => ShareSpec; // read on every click, so it can follow the latest result
  label?: string; // button text (default "Share")
  primary?: boolean; // filled button style
  colors?: ShareColors;
  onShare?: (medium: string) => void; // e.g. a gtag "share" event; never required
}

export interface ShareWidget {
  el: HTMLElement;
  button: HTMLButtonElement;
  close(): void;
  destroy(): void;
}

export const SHARE_NETWORKS: { id: ShareNetwork; label: string }[] = [
  { id: "x", label: "X" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads", label: "Threads" },
  { id: "reddit", label: "Reddit" },
];

/** YYYY-MM-DD of the UTC day (the day the daily level / trivia set belongs to). */
export function utcDay(d?: Date): string {
  return (d || new Date()).toISOString().slice(0, 10);
}

/** Marks as a grid with no spoilers, e.g. [true, true, false] -> "🟩🟩⬜". */
export function marksGrid(got: boolean[]): string {
  let s = "";
  for (let i = 0; i < got.length; i++) s += got[i] ? "\uD83D\uDFE9" : "\u2B1C";
  return s;
}

/** The page URL with the share UTM parameters (any existing query and hash are dropped). */
export function withUtm(url: string, medium: string, campaign: ShareCampaign): string {
  const base = url.split("#")[0].split("?")[0];
  return base + "?utm_source=share&utm_medium=" + encodeURIComponent(medium) + "&utm_campaign=" + campaign;
}

/** Text + link, as pasted or posted. */
export function shareMessage(spec: ShareSpec, medium: string): string {
  return spec.text + "\n" + withUtm(spec.url, medium, spec.campaign);
}

/** Plain intent URL for one network (opens the network's own composer; nothing is posted for the player). */
export function intentUrl(net: ShareNetwork, spec: ShareSpec): string {
  const link = withUtm(spec.url, net, spec.campaign);
  const e = encodeURIComponent;
  switch (net) {
    case "x":
      return "https://x.com/intent/tweet?text=" + e(spec.text) + "&url=" + e(link);
    case "facebook":
      return "https://www.facebook.com/sharer/sharer.php?u=" + e(link);
    case "linkedin":
      return "https://www.linkedin.com/sharing/share-offsite/?url=" + e(link);
    case "threads":
      return "https://www.threads.net/intent/post?text=" + e(spec.text + "\n" + link);
    case "reddit":
      return "https://www.reddit.com/submit?url=" + e(link) + "&title=" + e(spec.text.split("\n")[0]);
  }
  return link;
}

/** The system share sheet, on touch devices that have one (phones, tablets). Desktop gets the menu. */
export function canNativeShare(): boolean {
  try {
    const n = navigator as Navigator & { share?: unknown };
    return typeof n.share === "function" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/** Copy to the clipboard; falls back to a hidden textarea where the async API is missing. */
export function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => legacyCopy(text),
      );
    }
  } catch {
    /* fall through */
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const CSS =
  ".shr{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:inherit;gap:6px;max-width:100%;min-width:0}" +
  ".shr.shr-open{flex-basis:100%}" +
  ".shr .shr-btn,.shr .shr-item{font:inherit;font-size:13px;line-height:1.2;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;" +
  "min-height:36px;padding:7px 12px;border:1px solid var(--shr-line);border-radius:3px;background:var(--shr-panel);color:var(--shr-ink);text-decoration:none;white-space:nowrap}" +
  ".shr .shr-btn.shr-primary{background:var(--shr-button);color:var(--shr-button-ink);border-color:var(--shr-button);font-weight:600}" +
  ".shr .shr-btn:hover,.shr .shr-item:hover{border-color:var(--shr-accent)}" +
  ".shr .shr-btn:focus-visible,.shr .shr-item:focus-visible{outline:2px solid var(--shr-accent);outline-offset:2px}" +
  ".shr .shr-menu{display:flex;flex-wrap:wrap;gap:6px;width:100%;padding:8px;border:1px solid var(--shr-line);border-radius:4px;background:var(--shr-bg)}" +
  ".shr .shr-menu[hidden]{display:none}" +
  ".shr .shr-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}";

function injectCss(): void {
  if (document.getElementById("shr-css")) return;
  const st = document.createElement("style");
  st.id = "shr-css";
  st.textContent = CSS;
  document.head.appendChild(st);
}

let uid = 0;

/** Build a Share button (and its menu). Append `el` wherever the result is shown. */
export function createShare(o: ShareOptions): ShareWidget {
  injectCss();
  const c = o.colors || {};
  const id = "shr-menu-" + ++uid;
  const label = o.label || "Share";
  const el = document.createElement("div");
  el.className = "shr";
  const vars: [string, string | undefined, string][] = [
    ["--shr-accent", c.accent, "currentColor"],
    ["--shr-bg", c.bg, "transparent"],
    ["--shr-panel", c.panel, "transparent"],
    ["--shr-line", c.line, "rgba(127,127,127,.45)"],
    ["--shr-ink", c.ink, "inherit"],
    ["--shr-button", c.button || c.accent, "currentColor"],
    ["--shr-button-ink", c.buttonInk, "inherit"],
  ];
  for (let i = 0; i < vars.length; i++) el.style.setProperty(vars[i][0], vars[i][1] || vars[i][2]);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "shr-btn" + (o.primary ? " shr-primary" : "");
  button.textContent = label;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id);
  el.appendChild(button);

  const menu = document.createElement("div");
  menu.className = "shr-menu";
  menu.id = id;
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Share your result");
  menu.hidden = true;
  el.appendChild(menu);

  const live = document.createElement("span");
  live.className = "shr-sr";
  live.setAttribute("aria-live", "polite");
  el.appendChild(live);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "shr-item";
  copyBtn.textContent = "Copy link";
  menu.appendChild(copyBtn);
  const links: { net: ShareNetwork; a: HTMLAnchorElement }[] = [];
  for (let i = 0; i < SHARE_NETWORKS.length; i++) {
    const n = SHARE_NETWORKS[i];
    const a = document.createElement("a");
    a.className = "shr-item";
    a.textContent = n.label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", "Share on " + n.label + " (opens a new tab)");
    a.href = "#";
    a.addEventListener("click", () => {
      a.href = intentUrl(n.id, o.spec());
      report(n.id);
    });
    links.push({ net: n.id, a });
    menu.appendChild(a);
  }

  let open = false;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  function report(medium: string): void {
    try {
      if (o.onShare) o.onShare(medium);
    } catch {
      /* analytics is optional */
    }
  }
  function refreshLinks(): void {
    const spec = o.spec();
    for (let i = 0; i < links.length; i++) links[i].a.href = intentUrl(links[i].net, spec);
  }
  function setOpen(v: boolean, focusFirst?: boolean): void {
    open = v;
    menu.hidden = !v;
    el.classList.toggle("shr-open", v);
    button.setAttribute("aria-expanded", String(v));
    if (v) {
      refreshLinks();
      document.addEventListener("pointerdown", onDocDown, true);
      if (focusFirst) copyBtn.focus();
    } else {
      document.removeEventListener("pointerdown", onDocDown, true);
    }
  }
  function onDocDown(e: Event): void {
    if (open && !el.contains(e.target as Node)) setOpen(false);
  }

  button.addEventListener("click", () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (canNativeShare()) {
      const spec = o.spec();
      const n = navigator as Navigator & { share: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
      n.share({ title: spec.title, text: spec.text, url: withUtm(spec.url, "native", spec.campaign) }).then(
        () => report("native"),
        (err: { name?: string }) => {
          if (!err || err.name !== "AbortError") setOpen(true, true);
        },
      );
      return;
    }
    setOpen(true, true);
  });

  copyBtn.addEventListener("click", () => {
    copyText(shareMessage(o.spec(), "copy")).then((ok) => {
      copyBtn.textContent = ok ? "Copied" : "Copy failed";
      live.textContent = ok ? "Result and link copied" : "Copy failed";
      if (ok) report("copy");
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.textContent = "Copy link";
        live.textContent = "";
      }, 2000);
    });
  });

  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      button.focus();
    }
  });

  return {
    el,
    button,
    close() {
      setOpen(false);
    },
    destroy() {
      setOpen(false);
      if (copyTimer) clearTimeout(copyTimer);
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
