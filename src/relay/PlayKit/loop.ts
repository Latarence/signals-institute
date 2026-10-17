// Fixed-step loop: deterministic simulation steps, rendering every animation frame.
// Pauses while the tab is hidden. Copy-not-import (see README.md).

export interface Loop {
  start(): void;
  stop(): void;
  running(): boolean;
  /** Simulation speed multiplier (slow motion for a failure moment). */
  speed: number;
}

export function createLoop(opts: {
  dt: number; // seconds per simulation step
  step: (dt: number) => void;
  render: (time: number) => void;
  maxSteps?: number; // per frame, keeps a slow device from spiralling
}): Loop {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let on = false;
  const maxSteps = opts.maxSteps || 8;
  const loop: Loop = {
    speed: 1,
    start() {
      if (on) return;
      on = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      on = false;
      cancelAnimationFrame(raf);
    },
    running() {
      return on;
    },
  };
  function frame(now: number) {
    if (!on) return;
    let el = (now - last) / 1000;
    last = now;
    if (el > 0.1) el = 0.1; // tab switch or stall: don't try to catch up
    acc += el * loop.speed;
    let n = 0;
    while (acc >= opts.dt && n < maxSteps) {
      opts.step(opts.dt);
      acc -= opts.dt;
      n++;
    }
    if (n === maxSteps) acc = 0;
    opts.render(now / 1000);
    raf = requestAnimationFrame(frame);
  }
  return loop;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
