# Token Art

Turn your Claude Code token usage + conversation style into procedural generative art,
shown as a live-growing, museum-style gallery and published to GitHub Pages.

**Live collection:** https://rshuken.github.io/token-art/

## Quick start

```bash
node build-collection.js 140   # pre-generate the permanent collection
node server.js                 # live demo at http://localhost:4800
```

## Demo flow

1. Open http://localhost:4800 — ~140-piece museum gallery + counter.
2. Click **Simulate session** (or let the real hook fire) → right-side "New painting ready" alert.
3. Click the alert → pick 1 of 5 candidates → it animates into the gallery.
4. Click **Driver** → steer style/palette/size, or "Set to random".
5. Click **Post** → exports `dist/` and deploys to GitHub Pages (RShuken/token-art).

## Real usage hook

`node watch/install.js` prints the Stop-hook snippet for `.claude/settings.json`.
The hook tallies real token usage from the session transcript; every
`TOKEN_ART_THRESHOLD` (default 15k) tokens it queues a new "piece ready" event.

## Publish

`node scripts/deploy.js 140` builds, exports, and deploys the collection to
https://rshuken.github.io/token-art/ .

## Architecture

- `engine/` — pure, deterministic art engine (rng, catalog, palettes, traits, titles,
  simulate, state) + browser renderers (styles, render).
- `gallery/` — front-end (static gallery + lightbox; live alert / picker / driver / post).
- `watch/` — Claude Code Stop hook (token + conversation-style analyzer).
- `scripts/` — static export + GitHub Pages deploy.
- `server.js` — local demo server.

Every piece is a tiny reproducible record: `{seed, style, palette, format, stats, title}`.
13 styles (Flow Field, Bauhaus, Mondrian, Circle Packing, Truchet, Watercolor, Orbital,
Strokes, Voronoi Shards, Grid Pulse, Sediment, Constellation, Rivers) × 10 palettes ×
4 formats, all driven by a seed derived from how you talked to the AI.

## Tests

```bash
node --test     # 59 tests, zero runtime dependencies
```
