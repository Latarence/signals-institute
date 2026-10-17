// Pointer input (mouse, pen and touch through Pointer Events) plus an undo/redo history.

export interface P {
  x: number;
  y: number;
}

export interface PointerHandlers {
  down?: (p: P, e: PointerEvent) => void;
  move?: (p: P, e: PointerEvent, dragging: boolean) => void;
  up?: (p: P, e: PointerEvent) => void;
  leave?: () => void;
}

export function attachPointer(el: HTMLElement, h: PointerHandlers): () => void {
  let dragging = false;
  const at = (e: PointerEvent): P => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: PointerEvent) => {
    if (e.button === 2) return;
    dragging = true;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
    if (h.down) h.down(at(e), e);
  };
  const move = (e: PointerEvent) => {
    if (h.move) h.move(at(e), e, dragging);
  };
  const up = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (h.up) h.up(at(e), e);
  };
  const leave = () => {
    if (!dragging && h.leave) h.leave();
  };
  const ctx = (e: Event) => e.preventDefault();
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", leave);
  el.addEventListener("contextmenu", ctx);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("pointerleave", leave);
    el.removeEventListener("contextmenu", ctx);
  };
}

/** Keyboard shortcuts. Keys are e.key lower-cased, with "mod+" for Ctrl/Cmd (e.g. "mod+z", " ", "1").
 *  Ignored while typing in a form field; Enter/Space on a focused button or link are left to it. */
export function attachKeys(map: Record<string, (e: KeyboardEvent) => void>): () => void {
  const on = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    const k = (e.ctrlKey || e.metaKey ? "mod+" : "") + e.key.toLowerCase();
    // Enter/Space on a focused button or link belong to that control (e.g. Share), not to the game.
    if ((k === "enter" || k === " ") && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
    const f = map[k];
    if (!f) return;
    e.preventDefault();
    f(e);
  };
  window.addEventListener("keydown", on);
  return () => window.removeEventListener("keydown", on);
}

/** Snapshot history for undo/redo. Snapshots are JSON-cloned, so pass plain data. */
export class History<T> {
  private past: string[] = [];
  private future: string[] = [];
  constructor(private limit = 200) {}
  push(state: T): void {
    this.past.push(JSON.stringify(state));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T): T | null {
    const s = this.past.pop();
    if (s === undefined) return null;
    this.future.push(JSON.stringify(current));
    return JSON.parse(s) as T;
  }
  redo(current: T): T | null {
    const s = this.future.pop();
    if (s === undefined) return null;
    this.past.push(JSON.stringify(current));
    return JSON.parse(s) as T;
  }
  clear(): void {
    this.past = [];
    this.future = [];
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
