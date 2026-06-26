# Token Art

Turn your Claude Code token usage + conversation style into procedural generative art,
shown as a live-growing, museum-style gallery and published to GitHub Pages.

**Live collection:** https://rshuken.github.io/token-art/

## Install as a Claude Code plugin

Your community installs it in two commands — the Stop hook auto-registers, no
manual `settings.json` editing:

```
/plugin marketplace add RShuken/token-art
/plugin install token-art@token-art
```

Then, in any session, run **`/token-art`** to open the gallery at
http://localhost:4800. As you work, your real token usage paints new pieces
(every ~15k tokens a "new painting ready" alert appears). State lives in a shared
`~/.token-art/` directory so the hook and the gallery always agree.

> Requires Node.js on the user's machine. The gallery viewer is a local server
> (`/token-art` starts it). Publishing to GitHub Pages is optional and repo-specific.

## Quick start (local checkout)

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

## Cadence (config.json)

How token usage becomes "paintings ready" is configured per project in `config.json`
(next to `driver.md`). It is **per-session** — each Claude Code session generates from
its own usage, independently.

| key | default | meaning |
|-----|---------|---------|
| `mode` | `"jittered"` | `"fixed"` (every N tokens) or `"jittered"` (N ± jitter) |
| `thresholdTokens` | `15000` | base tokens between pieces (env `TOKEN_ART_THRESHOLD` overrides) |
| `jitterPct` | `0.4` | jittered interval is `threshold ± 40%` |
| `emitProbability` | `0.85` | chance a crossing actually emits (else it passes silently) |
| `maxPerSession` | `10` | cap on pieces per session |
| `galleryTarget` | `50` | gallery is "ready" (terminal alert) at this many pieces |
| `events.sessionStart` | `false` | emit a piece when a session begins |
| `events.sessionEnd` | `true` | emit a piece when a session ends |
| `events.burst` | `true` | emit on a big single-turn token burst |
| `events.burstTokens` | `25000` | tokens in one turn that count as a burst |

Each cadence emission **auto-adds one random piece** (no picker). When the personal
gallery first reaches `galleryTarget` pieces, the hook prints a one-time terminal
message: *"🎨 Your Token Art gallery is ready — N pieces. Run /token-art to view it."*
Each piece records its **trigger** (`interval` / `burst` / `session-start` / `session-end`),
and the gallery shows a per-session strip plus a "ready" banner at the target.

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
