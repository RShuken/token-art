# Token Art — Design Spec

**Date:** 2026-06-24
**Author:** Ryan Shuken + Claude
**Context:** A demo for the weekly "Let's Vibe" event (tonight). Must be fast to spin up, visually striking, fun to present live, easy to explain.

## Concept

A Claude Code plugin that turns your **token usage and how you talk to the AI** into **generative art**. As you work, the plugin watches your sessions, infers a palette / style / format from your usage character, and at token thresholds declares that **"a new painting is ready."** You pick from several candidate variations; your choice joins a growing **art gallery**. The more tokens you spend, the more art you create. When ready, you **Post** to publish the gallery live to GitHub Pages.

All art is **procedural** (code-generated from a numeric seed). No AI image models, no API keys, fully offline and reproducible. The seed and stylistic biases are derived from real (or simulated) usage stats.

## Two deliverables, one engine

Both render from the same `engine/`, so live additions look native to the permanent collection.

### A. Permanent collection (pre-built before the demo)
- A build script generates **~140 pieces** from random seeds + **simulated token sessions**. Each piece carries fabricated-but-plausible stats (token count, prompt count, session character) that drive its style/palette/format.
- Presented as a **real gallery experience**:
  - Collection title wall / intro header.
  - **Masonry layout** mixing Small, Portrait, Wide, and Large-format hero pieces.
  - Each piece has an **auto-generated title** and a **museum plaque**, e.g. *"Untitled #47 — born from 48,210 tokens · 31 prompts · code-heavy session · palette: Ember Terminal."*
  - **Click → lightbox** showing the full piece plus its story.
- **Published to GitHub Pages** (public repo under account `RShuken`) so it is live at a shareable URL before presenting.

### B. Live demo app (localhost)
- Real Claude Code **Stop hook** watches sessions; a **"Simulate session"** button is the guaranteed fallback.
- Token threshold crossed → **right-side "New painting ready" alert** slides in.
- Click → **5 candidate variations** rendered live → pick one → it **animates into the gallery**.
- **Driver file** (`driver.md`) nudges creative direction; editable mid-demo; resettable to `random`.
- **Post** re-exports the gallery and re-deploys to the same GitHub Pages site, so the room watches the collection grow live.

## Architecture

Self-contained **Node.js + vanilla HTML/Canvas** app in `Token Art/`. No build step, no heavy dependencies, no database — state is JSON files.

### Components
- **`engine/styles.js`** — the procedural style library (expanded well beyond the 9 prototyped: e.g. Flow Field, Bauhaus, Mondrian, Circle Packing, Truchet, Watercolor, Orbital, Strokes, Voronoi Shards, plus additions). Each style is `(ctx, W, H, rng, palette) => void`.
- **`engine/palettes.js`** — named palettes (Ember Terminal, Deep Sea, Risograph, Sage Studio, Mono Ink, Neon Synth, Clay & Sky, plus more).
- **`engine/traits.js`** — turns usage stats → `{ seed, styleWeights, paletteBias, format }`. Applies `driver.md` biases.
- **`engine/render.js`** — deterministic render from `{ seed, style, palette, format }`. Shared by browser (Canvas) and pre-build.
- **`engine/titles.js`** — generates a title and museum-plaque text from a piece's stats.
- **`watch/hook.js`** — Claude Code Stop hook. Reads `transcript_path`, sums `message.usage` token counts since last checkpoint, extracts style signals (avg message length, code-block density, tool-call count, question/exclamation ratio, warmth). Every *N* tokens, appends a "piece ready" event to the pending queue.
- **`server.js`** — tiny local HTTP server. Serves `gallery/`, watches the queue, exposes endpoints: poll pending, submit selection, get gallery, post/export+deploy, simulate session, read/write driver.
- **`gallery/`** — front end (HTML + Canvas): live gallery grid (masonry), right-side alert, candidate-picker modal, lightbox, driver editor, progress counter (`N/120`), Post button.
- **`build-collection.js`** — generates the ~140-piece permanent collection from random simulated sessions, writes `gallery.json`, exports the static site, and deploys to GitHub Pages.

### State (JSON files under `state/`)
- `stats.json` — running token + style-signal accumulators for the live session.
- `pending.json` — ready pieces awaiting selection (each: base seed, traits, candidate seed variants).
- `gallery.json` — selected/collection pieces. Each record: `{ id, seed, style, palette, format, title, stats, createdAt }`. Tiny + reproducible.
- `driver.md` — creative-direction file (committed default, user-editable).

### Data flow (live)
```
You talk to Claude
  → Stop hook reads transcript → updates stats.json
  → token threshold crossed → appends to pending.json
gallery app polls server
  → "New painting ready" alert
  → open candidates (5 variations from seed variants, rendered live)
  → pick one → server moves it to gallery.json → animates into grid
```

Because every piece is just a small seed record, the gallery re-renders instantly and stays reproducible forever.

## Style inference (kept legible)
Simple, explainable heuristics so the result can be narrated on stage:
- Heavy code / tool use → geometric styles (Bauhaus, Mondrian, Truchet).
- Long prose → flow / watercolor.
- Large token bursts → large-format size.
- Many `!` / warm words → warm palettes.

Each gallery piece stores *why* it looks the way it does (its stats), surfaced on the plaque. `driver.md` nudges these weights without fully overriding randomness.

## Publishing
- **Local export:** Post writes a self-contained `dist/` folder (embeds `gallery.json` + render JS) that works by opening `index.html` anywhere. Always succeeds.
- **GitHub Pages:** Post also pushes `dist/` to a public repo under `RShuken` (created via `gh`), served at a shareable URL. Best-effort; local export is the safety net. The permanent collection is deployed here ahead of the demo.

## Demo flow (tonight)
1. Show the **live GitHub Pages gallery** — ~140 pieces, museum-style.
2. Switch to localhost demo app — counter, driver shown.
3. Talk to Claude (or **Simulate session**) → tokens climb → **"New painting ready"** alert.
4. Click → 5 candidates → pick → animates into gallery.
5. Edit `driver.md` ("warm, bold, geometric") → next pieces visibly shift.
6. Repeat / fast-fill → counter climbs (more tokens = more art).
7. **Post** → re-export + re-deploy → collection grows live on the shared URL.

## Scope & risk
- **Core (must work):** engine + many styles, masonry gallery, candidate-pick flow, simulate-session fallback, local export, pre-built collection on GitHub Pages. All offline, zero API keys.
- **Real hook:** built, with the simulate button as guaranteed fallback so a hook hiccup never stalls the demo.
- **GitHub Pages:** real deploy for the permanent collection ahead of time; live re-deploy on Post is best-effort with local export as fallback.
- **Stack:** Node.js + vanilla HTML/Canvas. No build step, no heavy deps.

## Out of scope (YAGNI)
- AI image-model rendering.
- User accounts, auth, multi-user.
- Persistent database / cloud backend.
- Mobile-specific layout polish beyond responsive masonry.
