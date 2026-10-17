// A crisp, resizing canvas. Draw in CSS pixels; the device pixel ratio is handled here.

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number; // CSS px
  h: number;
  dpr: number;
  /** Re-apply the dpr transform; call at the start of each frame. */
  begin(): void;
  destroy(): void;
}

export function createSurface(
  host: HTMLElement,
  opts: { aspect: number; minH?: number; maxH?: number; onResize?: (w: number, h: number) => void },
): Surface {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.touchAction = "none";
  canvas.style.userSelect = "none";
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const s: Surface = {
    canvas,
    ctx,
    w: 0,
    h: 0,
    dpr: 1,
    begin() {
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    },
    destroy() {
      ro.disconnect();
      canvas.remove();
    },
  };
  function fit() {
    const w = Math.max(240, host.clientWidth);
    // phones get a taller board than the aspect alone would give
    const narrow = w < 640;
    let h = Math.round(w / (narrow ? Math.min(opts.aspect, 1.05) : opts.aspect));
    if (opts.minH) h = Math.max(h, opts.minH);
    const maxH = opts.maxH || Math.round(window.innerHeight * 0.72);
    h = Math.min(h, Math.max(opts.minH || 0, maxH));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    s.w = w;
    s.h = h;
    s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    if (opts.onResize) opts.onResize(w, h);
  }
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  return s;
}
