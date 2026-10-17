// Drawing language shared by the games: a technical drawing. Dot grid, hatched sections, hairline
// dimension lines, mono labels, square joints. Small corners only (no rounded pills).
import { MONO } from "./brand";

export function dotGrid(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step: number, color: string, r = 0.8): void {
  ctx.fillStyle = color;
  const sx = Math.ceil(x0 / step) * step;
  const sy = Math.ceil(y0 / step) * step;
  for (let x = sx; x <= x1; x += step) for (let y = sy; y <= y1; y += step) ctx.fillRect(x - r / 2, y - r / 2, r, r);
}

/** Fill a polygon and hatch it with 45-degree lines (a section cut). */
export function hatchPoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], fill: string, hatch: string, spacing = 7, edge?: string): void {
  if (pts.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x); maxX = Math.max(maxX, pts[i].x);
    minY = Math.min(minY, pts[i].y); maxY = Math.max(maxY, pts[i].y);
  }
  ctx.strokeStyle = hatch;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const span = maxY - minY;
  for (let x = minX - span; x < maxX; x += spacing) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + span, minY);
  }
  ctx.stroke();
  ctx.restore();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11, align: CanvasTextAlign = "left", base: CanvasTextBaseline = "middle", weight = 400): void {
  ctx.font = weight + " " + size + "px " + MONO;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(text, x, y);
}

/** Label on a dark plate so it reads over busy drawing. */
export function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink: string, plate: string, size = 11, align: CanvasTextAlign = "center", border?: string): void {
  ctx.font = "500 " + size + "px " + MONO;
  const w = ctx.measureText(text).width + 10;
  const h = size + 8;
  const lx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = plate;
  ctx.fillRect(lx, y - h / 2, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
  }
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, lx + 5, y + 0.5);
}

/** Hairline dimension with end ticks and a centred label. */
export function dimLine(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, text: string, color: string, plate: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  const dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * 4, ny = (dx / L) * 4;
  ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(ax + nx, ay + ny);
  ctx.moveTo(bx - nx, by - ny); ctx.lineTo(bx + nx, by + ny);
  ctx.stroke();
  if (text) tag(ctx, text, (ax + bx) / 2, (ay + by) / 2, color, plate, 10);
}

export function joint(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string, stroke?: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - size / 2 + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
  }
}

/** Horizontal meter bar (0..1) with an optional target tick. */
export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, fill: string, track: string, target?: number, targetColor?: string): void {
  ctx.fillStyle = track;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, v)) * w, h);
  if (target !== undefined) {
    ctx.fillStyle = targetColor || fill;
    ctx.fillRect(x + Math.max(0, Math.min(1, target)) * w - 1, y - 3, 2, h + 6);
  }
}
