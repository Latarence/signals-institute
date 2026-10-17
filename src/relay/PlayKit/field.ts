// Scalar field to pixels with colour-blind-safe maps (viridis, cividis, and a diverging map for signed
// fields). Draws through a small offscreen canvas, then scales up with smoothing.

export type Lut = Uint8ClampedArray; // 256 * 3

function buildLut(stops: number[][]): Lut {
  const lut = new Uint8ClampedArray(256 * 3);
  const n = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * n;
    const k = Math.min(n - 1, Math.floor(t));
    const f = t - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  return lut;
}

// Sampled from the matplotlib maps (9 stops each); close enough for display, same perceptual ordering.
export const VIRIDIS = buildLut([
  [68, 1, 84], [71, 44, 122], [59, 81, 139], [44, 113, 142], [33, 144, 141],
  [39, 173, 129], [92, 200, 99], [170, 220, 50], [253, 231, 37],
]);
export const CIVIDIS = buildLut([
  [0, 34, 78], [18, 53, 112], [59, 73, 108], [87, 92, 109], [112, 113, 115],
  [138, 134, 120], [167, 157, 117], [198, 181, 107], [253, 234, 69],
]);
/** Blue-white-orange diverging map for signed fields (e.g. an E-field snapshot). */
export const DIVERGE = buildLut([
  [33, 102, 172], [67, 147, 195], [146, 197, 222], [209, 229, 240], [247, 247, 247],
  [253, 219, 199], [244, 165, 130], [214, 96, 77], [178, 24, 43],
]);

/** Tint a lut toward a brand colour at the high end (keeps the low end dark). */
export function rampLut(bg: string, mid: string, hi: string): Lut {
  const h = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  return buildLut([h(bg), h(mid), h(hi)]);
}

export class FieldView {
  private off: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private img: ImageData;
  constructor(public nx: number, public ny: number) {
    this.off = document.createElement("canvas");
    this.off.width = nx;
    this.off.height = ny;
    this.octx = this.off.getContext("2d") as CanvasRenderingContext2D;
    this.img = this.octx.createImageData(nx, ny);
  }
  /** values: row-major nx*ny. Maps [lo, hi] onto the lut; alpha 255. */
  paint(values: ArrayLike<number>, lut: Lut, lo: number, hi: number): void {
    const d = this.img.data;
    const k = 255 / (hi - lo || 1);
    for (let i = 0, n = this.nx * this.ny; i < n; i++) {
      let v = ((values[i] - lo) * k) | 0;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      const j = i * 4;
      d[j] = lut[v * 3];
      d[j + 1] = lut[v * 3 + 1];
      d[j + 2] = lut[v * 3 + 2];
      d[j + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, smooth = true): void {
    ctx.imageSmoothingEnabled = smooth;
    ctx.drawImage(this.off, x, y, w, h);
  }
}
