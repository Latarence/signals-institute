// Cadence: drawing. A top-down map in the shared technical-drawing language: dot grid every 500 m, square
// venues with a trust bar, dashed walking-reach rings, people as small marks by group, and the three next
// steps along the bottom. During a run the year plays month by month.
import type { PlayBrand } from "../../PlayKit/brand";
import { withAlpha } from "../../PlayKit/brand";
import { dotGrid, label, meter, tag } from "../../PlayKit/draw";
import type { Design, Kind, LevelDef, Result } from "./model";
import { CADENCES, KINDS, MONTHS, VENUE_TYPES, costOf } from "./model";

export const HUD_H = 40;
export const LANE_H = 38;

export interface Cam { s: number; ox: number; oy: number; w: number; h: number; rot: boolean; lw: number }

// On narrow screens the map turns a quarter turn (west at the bottom) so a phone shows it tall and large.
export function fitCam(lv: LevelDef, w: number, h: number): Cam {
  const rot = w < 640;
  const pad = rot ? 10 : 16;
  const mw = rot ? lv.h : lv.w, mh = rot ? lv.w : lv.h;
  const aw = w - 2 * pad, ah = h - HUD_H - LANE_H - 2 * pad;
  const s = Math.min(aw / mw, ah / mh);
  return { s, ox: (w - mw * s) / 2, oy: HUD_H + pad + (ah - mh * s) / 2, w, h, rot, lw: lv.w };
}
export const SX = (c: Cam, x: number, y: number) => c.ox + (c.rot ? y : x) * c.s;
export const SY = (c: Cam, x: number, y: number) => c.oy + (c.rot ? c.lw - x : y) * c.s;

export interface View {
  lv: LevelDef;
  d: Design;
  res: Result | null;
  mode: "build" | "run" | "result";
  month: number; // fractional month during a run (0..12)
  sel: number; // selected venue
  hover: number;
  hint: boolean;
  time: number;
  reduced: boolean;
}

export function kindColor(b: PlayBrand, k: Kind): string {
  return k === 0 ? b.accent : k === 1 ? b.good : b.warn;
}

/** youth: circle · veterans: diamond · community: triangle (shape and colour both carry the group) */
export function glyph(ctx: CanvasRenderingContext2D, k: Kind, x: number, y: number, r: number, fill: string | null, edge: string): void {
  ctx.beginPath();
  if (k === 0) ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (k === 1) { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.2, y); ctx.closePath(); }
  else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.15, y + r * 0.85); ctx.lineTo(x - r * 1.15, y + r * 0.85); ctx.closePath(); }
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function laneBox(c: Cam, k: number): { x: number; y: number; w: number; h: number } {
  const gap = 8, pad = 12;
  const w = (c.w - 2 * pad - 2 * gap) / 3;
  return { x: pad + k * (w + gap), y: c.h - LANE_H + 6, w, h: LANE_H - 12 };
}

export function draw(ctx: CanvasRenderingContext2D, c: Cam, v: View, b: PlayBrand): void {
  const lv = v.lv;
  const narrow = c.w < 640;
  const res = v.mode === "build" ? null : v.res;
  const mi = res ? Math.min(MONTHS - 1, Math.floor(v.month)) : -1;
  const done = v.mode === "result";
  const mf = v.month - Math.floor(v.month); // progress within the month (0..1)
  ctx.fillStyle = b.bg;
  ctx.fillRect(0, 0, c.w, c.h);

  // map frame and grid
  const ax = SX(c, 0, 0), ay = SY(c, 0, 0), bx = SX(c, lv.w, lv.h), by = SY(c, lv.w, lv.h);
  const x0 = Math.min(ax, bx), y0 = Math.min(ay, by), x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
  ctx.fillStyle = withAlpha(b.panel, 0.6);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = b.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  dotGrid(ctx, x0, y0, x1, y1, 500 * c.s, withAlpha(b.muted, 0.35), 1.2);

  // walking reach of each venue that meets (and the selected one, faintly, while planning)
  const rr = lv.reach * c.s;
  ctx.save();
  ctx.setLineDash([4, 5]);
  for (let i = 0; i < lv.venues.length; i++) {
    const on = v.d.cad[i] > 0;
    if (!on && !(v.mode === "build" && i === v.sel)) continue;
    const V = lv.venues[i];
    const t = res ? res.trust[i][Math.max(0, mi)] : V.t0;
    ctx.strokeStyle = on ? withAlpha(b.accent, 0.35 + (i === v.sel && v.mode === "build" ? 0.25 : 0)) : withAlpha(b.muted, 0.35);
    ctx.fillStyle = on ? withAlpha(b.accent, 0.02 + 0.06 * t) : "rgba(0,0,0,0)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(SX(c, V.x, V.y), SY(c, V.x, V.y), rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // visits this month: a hairline from each person to the venue they came to
  if (res && !done && mi >= 0) {
    const a = v.reduced ? 0.5 : 0.65 * (1 - mf * 0.6);
    for (let p = 0; p < lv.people.length; p++) {
      const vi = res.people[p].visits[mi];
      if (vi < 0) continue;
      const P = lv.people[p], V = lv.venues[vi];
      ctx.strokeStyle = withAlpha(kindColor(b, P.kind), a);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(SX(c, P.x, P.y), SY(c, P.x, P.y));
      ctx.lineTo(SX(c, V.x, V.y), SY(c, V.x, V.y));
      ctx.stroke();
    }
  }
  ctx.restore();

  // pathways: each person who found a next step, drawn to that next step at the bottom
  if (res) {
    for (let p = 0; p < lv.people.length; p++) {
      const o = res.people[p];
      if (o.next < 0 || o.next > mi) continue;
      const P = lv.people[p];
      const lb = laneBox(c, P.kind);
      const f = done || o.next < mi || v.reduced ? 1 : Math.min(1, mf * 1.6);
      const px = SX(c, P.x, P.y), py = SY(c, P.x, P.y);
      const tx = lb.x + lb.w / 2, ty = lb.y;
      ctx.strokeStyle = withAlpha(kindColor(b, P.kind), 0.4);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (tx - px) * f, py + (ty - py) * f);
      ctx.stroke();
    }
  }

  // people
  const pr = Math.max(4, Math.min(6.5, 120 * c.s));
  for (let p = 0; p < lv.people.length; p++) {
    const P = lv.people[p];
    const x = SX(c, P.x, P.y), y = SY(c, P.x, P.y);
    const col = kindColor(b, P.kind);
    if (!res) {
      glyph(ctx, P.kind, x, y, pr, b.bg, withAlpha(col, 0.85));
      continue;
    }
    const o = res.people[p];
    if (o.fade >= 0 && o.fade <= mi) {
      glyph(ctx, P.kind, x, y, pr, withAlpha(b.muted, 0.35), withAlpha(b.muted, 0.8));
      ctx.strokeStyle = b.bad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - pr, y - pr); ctx.lineTo(x + pr, y + pr);
      ctx.moveTo(x + pr, y - pr); ctx.lineTo(x - pr, y + pr);
      ctx.stroke();
    } else if (o.reveal >= 0 && o.reveal <= mi) {
      glyph(ctx, P.kind, x, y, pr + (o.next >= 0 && o.next <= mi ? 1 : 0), col, o.next >= 0 && o.next <= mi ? b.ink : col);
    } else if (o.first >= 0 && o.first <= mi) {
      glyph(ctx, P.kind, x, y, pr, b.bg, col);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y + (P.kind === 2 ? pr * 0.2 : 0), pr * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else {
      glyph(ctx, P.kind, x, y, pr, b.bg, withAlpha(col, done ? 0.45 : 0.7));
    }
    // after the year: what each person still waiting needed
    if (done && (o.status === "low" || o.status === "once" || o.status === "far")) {
      tag(ctx, o.status === "far" ? "far" : Math.round(P.need * 100) + "%", x, y + pr + 10, b.muted, b.bg, narrow ? 8 : 9);
    }
  }

  // venues
  const sz = Math.max(14, Math.min(20, 330 * c.s));
  for (let i = 0; i < lv.venues.length; i++) {
    const V = lv.venues[i];
    const x = SX(c, V.x, V.y), y = SY(c, V.x, V.y);
    const on = v.d.cad[i] > 0;
    const t = res ? res.trust[i][Math.max(0, mi)] : V.t0;
    // a session this month: a ring that opens out
    if (res && !done && on && res.session[i][mi] && !v.reduced) {
      ctx.strokeStyle = withAlpha(b.accent, 0.6 * (1 - mf));
      ctx.lineWidth = 1.5;
      const g = sz / 2 + 4 + mf * 18;
      ctx.strokeRect(x - g, y - g, 2 * g, 2 * g);
    }
    if (i === v.sel && v.mode === "build") {
      ctx.strokeStyle = b.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - sz / 2 - 5.5, y - sz / 2 - 5.5, sz + 11, sz + 11);
    } else if (v.hint && v.mode === "build") {
      const pulse = v.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(v.time * 3 + i);
      ctx.strokeStyle = withAlpha(b.accent, 0.2 + 0.35 * pulse);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - sz / 2 - 5.5, y - sz / 2 - 5.5, sz + 11, sz + 11);
    } else if (v.hover === i && v.mode === "build") {
      ctx.strokeStyle = withAlpha(b.accent, 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - sz / 2 - 5.5, y - sz / 2 - 5.5, sz + 11, sz + 11);
    }
    ctx.fillStyle = on ? b.panel2 : b.bg;
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    ctx.save();
    if (!on) ctx.setLineDash([3, 3]);
    ctx.strokeStyle = on ? b.accent : withAlpha(b.ink, 0.6);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - sz / 2 + 0.5, y - sz / 2 + 0.5, sz - 1, sz - 1);
    ctx.restore();
    // trust fills the square from the bottom
    if (t > 0.005) {
      const hgt = (sz - 4) * Math.min(1, t);
      ctx.fillStyle = withAlpha(b.accent, on ? 0.85 : 0.35);
      ctx.fillRect(x - sz / 2 + 2, y + sz / 2 - 2 - hgt, sz - 4, hgt);
    }
    // follow-through: a small green arrow on the right edge
    if (on && v.d.ft[i]) {
      ctx.fillStyle = b.good;
      ctx.beginPath();
      ctx.moveTo(x + sz / 2 + 3, y - 5);
      ctx.lineTo(x + sz / 2 + 10, y);
      ctx.lineTo(x + sz / 2 + 3, y + 5);
      ctx.closePath();
      ctx.fill();
    }
    const name = narrow && i !== v.sel ? VENUE_TYPES[V.type].code : VENUE_TYPES[V.type].name;
    tag(ctx, name, x, y - sz / 2 - 11, i === v.sel && v.mode === "build" ? b.accent : b.ink, b.bg, narrow ? 9 : 10);
    const sub = (on ? CADENCES[v.d.cad[i]].short : "off") + " · " + Math.round(t * 100) + "%";
    tag(ctx, sub, x, y + sz / 2 + 11, on ? b.ink : b.muted, b.bg, narrow ? 8 : 9);
  }

  // scale bar: 1 km
  const sbx = x0 + 10, sby = y1 - 10, sbw = 1000 * c.s;
  ctx.strokeStyle = b.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sbx, sby - 4); ctx.lineTo(sbx, sby); ctx.lineTo(sbx + sbw, sby); ctx.lineTo(sbx + sbw, sby - 4);
  ctx.stroke();
  label(ctx, "1 km", sbx + sbw + 6, sby - 2, b.muted, 10);

  // the three next steps
  ctx.fillStyle = b.panel;
  ctx.fillRect(0, c.h - LANE_H, c.w, LANE_H);
  ctx.fillStyle = b.line;
  ctx.fillRect(0, c.h - LANE_H, c.w, 1);
  for (let k = 0; k < 3; k++) {
    const lb = laneBox(c, k);
    let n = 0;
    if (res) for (let p = 0; p < lv.people.length; p++) if (lv.people[p].kind === k && res.people[p].next >= 0 && res.people[p].next <= mi) n++;
    const col = kindColor(b, k as Kind);
    ctx.strokeStyle = withAlpha(col, 0.7);
    ctx.lineWidth = 1;
    ctx.strokeRect(lb.x + 0.5, lb.y + 0.5, lb.w - 1, lb.h - 1);
    glyph(ctx, k as Kind, lb.x + 12, lb.y + lb.h / 2, 4, col, col);
    const txt = (narrow ? KINDS[k].group : KINDS[k].step) + "  " + n;
    label(ctx, txt, lb.x + 22, lb.y + lb.h / 2, b.ink, narrow ? 10 : 11);
  }

  // HUD
  ctx.fillStyle = b.panel;
  ctx.fillRect(0, 0, c.w, HUD_H);
  ctx.fillStyle = b.line;
  ctx.fillRect(0, HUD_H - 1, c.w, 1);
  const cost = costOf(v.d);
  const over = cost > lv.hours;
  let nextNow = 0;
  if (res) for (let p = 0; p < lv.people.length; p++) if (res.people[p].next >= 0 && res.people[p].next <= mi) nextNow++;
  let left: string;
  if (res) left = (done ? "Year done" : "Month " + (mi + 1) + " of 12") + " · next steps " + nextNow + " / " + lv.target;
  else {
    let act = 0;
    for (let i = 0; i < v.d.cad.length; i++) if (v.d.cad[i]) act++;
    left = narrow ? act + " of " + lv.venues.length + " venues · need " + lv.target : act + " of " + lv.venues.length + " venues meeting · " + lv.people.length + " people · " + lv.target + " next steps needed";
  }
  label(ctx, left, 12, HUD_H / 2, b.ink, narrow ? 10 : 11);
  const mw = narrow ? 56 : 140;
  label(ctx, cost + " / " + lv.hours + " h", c.w - 12 - mw - 8, HUD_H / 2, over ? b.bad : b.ink, narrow ? 10 : 11, "right");
  meter(ctx, c.w - 12 - mw, HUD_H / 2 - 4, mw, 8, cost / lv.hours, over ? b.bad : b.accent, b.panel2);
}
