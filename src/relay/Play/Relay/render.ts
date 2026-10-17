// Relay: drawing. A top-down town map in the shared technical-drawing language: dot grid every 500 m, hatched
// tall buildings, square stations, small houses, dashed reach rings, and the signal travelling hop by hop.
import type { PlayBrand } from "../../PlayKit/brand";
import { withAlpha } from "../../PlayKit/brand";
import { dotGrid, hatchPoly, joint, label, meter, tag } from "../../PlayKit/draw";
import type { Design, LevelDef, Result } from "./model";
import { POWERS, costOf, fmtMoney, reachKm } from "./model";

export const HUD_H = 40;

// On narrow screens the map turns a quarter turn (west at the bottom) so a phone shows it tall and large.
export interface Cam { s: number; ox: number; oy: number; w: number; h: number; rot: boolean; lw: number }

export function fitCam(lv: LevelDef, w: number, h: number): Cam {
  const rot = w < 640;
  const pad = rot ? 8 : 14;
  const mw = rot ? lv.h : lv.w, mh = rot ? lv.w : lv.h;
  const aw = w - 2 * pad, ah = h - HUD_H - 2 * pad;
  const s = Math.min(aw / mw, ah / mh);
  return { s, ox: (w - mw * s) / 2, oy: HUD_H + pad + (ah - mh * s) / 2, w, h, rot, lw: lv.w };
}
export const SX = (c: Cam, x: number, y: number) => c.ox + (c.rot ? y : x) * c.s;
export const SY = (c: Cam, x: number, y: number) => c.oy + (c.rot ? c.lw - x : y) * c.s;

export interface Anim { t: number; depth: number[]; homeDepth: number[]; hopDur: number; end: number }

export interface View {
  lv: LevelDef;
  d: Design;
  res: Result | null; // set during and after a Test
  anim: Anim | null;
  mode: "build" | "test" | "result";
  hover: number; // site index under the pointer, or -1
  hint: boolean;
  time: number;
  reduced: boolean;
}

function house(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, fill: string, edge: string): void {
  ctx.beginPath();
  ctx.moveTo(x - sz, y + sz * 0.8);
  ctx.lineTo(x - sz, y - sz * 0.1);
  ctx.lineTo(x, y - sz);
  ctx.lineTo(x + sz, y - sz * 0.1);
  ctx.lineTo(x + sz, y + sz * 0.8);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function dashedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, color: string): void {
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - sz / 2 + 0.5, y - sz / 2 + 0.5, sz - 1, sz - 1);
  ctx.restore();
}

function segment(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, f: number, color: string, wd: number, dash: boolean): void {
  if (f <= 0) return;
  ctx.save();
  if (dash) ctx.setLineDash([5, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = wd;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + (bx - ax) * Math.min(1, f), ay + (by - ay) * Math.min(1, f));
  ctx.stroke();
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, c: Cam, v: View, b: PlayBrand): void {
  const lv = v.lv;
  const narrow = c.w < 640;
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
  const step = 500 * c.s;
  dotGrid(ctx, x0, y0, x1, y1, step, withAlpha(b.muted, 0.35), 1.2);

  // reach rings (free space, no buildings) around every station
  const p = POWERS[v.d.power].dbm;
  const rr = reachKm(p) * 1000 * c.s;
  const stations: { x: number; y: number }[] = [{ x: lv.hub.x, y: lv.hub.y }];
  for (let i = 0; i < lv.sites.length; i++) if (v.d.relays[i]) stations.push(lv.sites[i]);
  if (v.mode === "build") {
    ctx.save();
    ctx.setLineDash([4, 5]);
    for (let i = 0; i < stations.length; i++) {
      ctx.strokeStyle = withAlpha(b.accent, i === 0 ? 0.45 : 0.3);
      ctx.fillStyle = withAlpha(b.accent, 0.035);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(SX(c, stations[i].x, stations[i].y), SY(c, stations[i].x, stations[i].y), rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // tall buildings
  for (let i = 0; i < lv.blocks.length; i++) {
    const k = lv.blocks[i];
    const pts = [
      { x: SX(c, k.x0, k.y0), y: SY(c, k.x0, k.y0) },
      { x: SX(c, k.x1, k.y0), y: SY(c, k.x1, k.y0) },
      { x: SX(c, k.x1, k.y1), y: SY(c, k.x1, k.y1) },
      { x: SX(c, k.x0, k.y1), y: SY(c, k.x0, k.y1) },
    ];
    hatchPoly(ctx, pts, b.panel2, withAlpha(b.muted, 0.4), 6, withAlpha(b.muted, 0.8));
  }
  ctx.restore();

  // links during and after a Test
  const res = v.res;
  if (res && v.anim && v.mode !== "build") {
    const a = v.anim;
    for (let i = 0; i < res.links.length; i++) {
      const L = res.links[i];
      const from = res.nodes[L.from];
      const dep = L.home >= 0 ? a.homeDepth[L.home] : a.depth[L.to];
      const f = v.reduced ? 1 : (a.t - dep * a.hopDur) / a.hopDur;
      if (L.home >= 0) {
        const h = lv.homes[L.home];
        const ok = res.homes[L.home].linked;
        segment(ctx, SX(c, from.x, from.y), SY(c, from.x, from.y), SX(c, h.x, h.y), SY(c, h.x, h.y), f, ok ? b.accent : b.bad, ok ? 1.8 : 1.5, !ok);
      } else {
        const to = res.nodes[L.to];
        segment(ctx, SX(c, from.x, from.y), SY(c, from.x, from.y), SX(c, to.x, to.y), SY(c, to.x, to.y), f, b.accent, 2.4, false);
      }
    }
  }

  // relay sites and relays
  const sz = Math.max(12, Math.min(18, 300 * c.s));
  for (let i = 0; i < lv.sites.length; i++) {
    const sx = SX(c, lv.sites[i].x, lv.sites[i].y), sy = SY(c, lv.sites[i].x, lv.sites[i].y);
    if (v.d.relays[i]) {
      let fill = b.accent;
      if (res && v.mode !== "build") {
        let on = false;
        for (let j = 1; j < res.nodes.length; j++) if (res.nodes[j].site === i) on = res.nodes[j].on;
        fill = on ? b.accent : b.bad;
      }
      joint(ctx, sx, sy, sz, fill, b.bg);
      ctx.strokeStyle = b.bg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy + sz * 0.3);
      ctx.lineTo(sx, sy - sz * 0.3);
      ctx.moveTo(sx - sz * 0.22, sy - sz * 0.05);
      ctx.lineTo(sx, sy - sz * 0.3);
      ctx.lineTo(sx + sz * 0.22, sy - sz * 0.05);
      ctx.stroke();
    } else {
      const hl = v.hover === i;
      dashedSquare(ctx, sx, sy, sz, hl ? b.accent : withAlpha(b.ink, 0.55));
      if (v.hint && v.mode === "build") {
        const pulse = v.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(v.time * 3 + i);
        ctx.strokeStyle = withAlpha(b.accent, 0.25 + 0.35 * pulse);
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - sz / 2 - 4.5, sy - sz / 2 - 4.5, sz + 9, sz + 9);
      }
    }
  }

  // hub
  const hx = SX(c, lv.hub.x, lv.hub.y), hy = SY(c, lv.hub.x, lv.hub.y);
  joint(ctx, hx, hy, sz + 6, b.button, b.bg);
  tag(ctx, "HUB", hx, hy - sz - 6, b.buttonInk, b.button, 10);

  // homes
  const hs = Math.max(7, Math.min(11, 190 * c.s));
  for (let k = 0; k < lv.homes.length; k++) {
    const h = lv.homes[k];
    const x = SX(c, h.x, h.y), y = SY(c, h.x, h.y);
    let fill = b.panel2, edge = b.ink;
    let lit = false;
    if (res && v.anim && v.mode !== "build") {
      const reached = v.reduced || v.anim.t >= (v.anim.homeDepth[k] + 1) * v.anim.hopDur;
      if (reached) {
        lit = true;
        const ok = res.homes[k].linked;
        fill = ok ? b.good : b.bad;
        edge = ok ? b.good : b.bad;
      }
    }
    house(ctx, x, y, hs, fill, edge);
    if (lit && res) {
      const s = res.homes[k].snr;
      const txt = (s >= 0 ? "+" : "") + Math.round(s) + " dB";
      tag(ctx, txt, x, y + hs + 11, res.homes[k].linked ? b.good : b.bad, b.bg, narrow ? 9 : 10);
    }
  }

  // scale bar: 1 km
  const sbx = x0 + 10, sby = y1 - 12, sbw = 1000 * c.s;
  ctx.strokeStyle = b.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sbx, sby - 4); ctx.lineTo(sbx, sby); ctx.lineTo(sbx + sbw, sby); ctx.lineTo(sbx + sbw, sby - 4);
  ctx.stroke();
  label(ctx, "1 km", sbx + sbw + 6, sby - 2, b.muted, 10);

  // HUD
  ctx.fillStyle = b.panel;
  ctx.fillRect(0, 0, c.w, HUD_H);
  ctx.fillStyle = b.line;
  ctx.fillRect(0, HUD_H - 1, c.w, 1);
  const cost = costOf(v.d);
  const over = cost > lv.budget;
  let nr = 0;
  for (let i = 0; i < v.d.relays.length; i++) if (v.d.relays[i]) nr++;
  const left = narrow ? nr + " relay" + (nr === 1 ? "" : "s") + " · " + POWERS[v.d.power].label : "relays " + nr + " · power " + POWERS[v.d.power].label + " · reach " + reachKm(p).toFixed(1) + " km in the open";
  label(ctx, left, 12, HUD_H / 2, b.ink, narrow ? 10 : 11);
  const mw = narrow ? 70 : 140;
  const txt = fmtMoney(cost) + " / " + fmtMoney(lv.budget);
  label(ctx, txt, c.w - 12 - mw - 8, HUD_H / 2, over ? b.bad : b.ink, narrow ? 10 : 11, "right");
  meter(ctx, c.w - 12 - mw, HUD_H / 2 - 4, mw, 8, cost / lv.budget, over ? b.bad : b.accent, b.panel2, 0.8, b.muted);
}
