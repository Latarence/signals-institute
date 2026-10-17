# PlayKit

A small canvas game kit for the science games on the product landings (`/play`). TypeScript, no
dependencies, no framework, no assets: graphics are drawn in code and sound is synthesized with WebAudio.
Extracted from the Brace game (structure of the loop, audio, save, section-drawing language).

**Copy-not-import**, like Trivia: copy this folder into a landing at `src/components/PlayKit/` and import
from there. Keep the copies in step by hand; this folder is canonical.

| File | What |
|---|---|
| `rng.ts` | FNV-1a, mulberry32, `utcDayNumber` (same day number as Trivia), `dailyRng(slug)` |
| `loop.ts` | fixed-step loop (deterministic sim steps, render per frame), `prefersReducedMotion` |
| `canvas.ts` | resizing hi-dpi canvas surface (`createSurface`) |
| `input.ts` | pointer events (mouse, pen, touch), keyboard map, undo/redo `History` |
| `audio.ts` | `Synth`: tones, filtered noise bursts, a soft bed, shared presets |
| `save.ts` | versioned localStorage store; works in private windows (all access guarded) |
| `field.ts` | scalar field to pixels with colour-blind-safe maps (viridis, cividis, diverging) |
| `draw.ts` | technical-drawing helpers: dot grid, hatched sections, dimension lines, mono labels |
| `shell.ts` | the shared DOM frame: name, level tabs, How to play section, brief, stage, controls, result card, About the science panel, product link |
| `share.ts` | Share button + menu for a result (system sheet on phones; else Copy link, X, Facebook, LinkedIn, Threads, Reddit intent URLs with `utm_source=share&utm_medium=<network>&utm_campaign=play`). Identical twin of `Trivia/share.ts` |
| `make_og.py` | code-generated 1200x630 Open Graph card for `/play` (`public/og/play.png`); run where Pillow is (xps) |
| `brand.ts` | `PlayBrand` tokens per product |
| `check.ts` | headless check runner (must-fail designs, reference designs, textbook values) |
| `check-public-bundle.sh` | build guard: fails if an internal codename reaches a built bundle |

## Game contract

Each game exports `mountGame(host: HTMLElement, brand: PlayBrand): () => void` (returns a destroy function)
and keeps its physics in a DOM-free module so `tests/` can check it under Node.

## Landing integration (Next.js app router)

```tsx
// src/components/Play/PlayGame.tsx
"use client";
import { useEffect, useRef } from "react";
import { mountGame } from "./<Game>/game";
import { BRAND } from "./brand";
export default function PlayGame() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? mountGame(ref.current, BRAND) : undefined), []);
  return <div ref={ref} />;
}
```

Then `src/app/play/page.tsx` (Banner + `<PlayGame />`), a "Play" footer link next to "Trivia", and a
`play` sitemap entry. After `next build`, run `bash src/components/PlayKit/check-public-bundle.sh`.

## Rules

- **TSI copy (2026-10-17, Principal):** How to play is closed on every page load and opens from a "How to play" button
  beside the game's name (aria-expanded; Esc closes it). Headings: The goal, How to play, What things cost, How you
  earn, The challenge, Quick tip. This copy of the kit serves both TSI games (Relay and Cadence).

- Every game passes `howTo` to `createShell`: the plain-words How to play section, shown first above the board
  and re-opened from the header. Six headings in order (The goal, What you control, What things cost, How you earn,
  What makes it hard, Quick tip), complete sentences, everyday words. If nothing costs or earns anything, say so.
  The science goes in `about` (the About the science panel, also linked from the How to play section).

- Honest model underneath, real units, and an About panel that states what is simplified.
- No paywall on the landing game. Never call it "free". No internal codenames in public copy.
- Corners 4px or less, no pills; colour-blind-safe maps; keyboard play; reduced motion respected.
- Tsconfig in the landings targets ES5 without downlevelIteration: do not `for...of` over Map, Set or
  typed arrays, and do not spread them.

## Share (2026-10-17)

`shell.showCard` adds a **Share** button to every passing result card (main level and today's level).
The text is the real result: game, level (or "today's"), marks got of total, a marks grid and the UTC day,
e.g. "I solved today's Lightpath on Boltzmann with 3 of 3 marks. Can you?" The link is the page itself plus
the share UTM tags. A card can pass `share: false` or `share: { text }`. No SDKs, no pixels; a gtag `share`
event fires only when gtag is already on the page. `/play` pages set their own `openGraph` + `twitter`
(summary_large_image) with `/og/play.png`.
