# Auto-Add + Gallery-Ready Alert — Design Spec

**Date:** 2026-06-26
**Author:** Ryan Shuken + Claude
**Context:** Today, when the cadence fires an emission, the hook queues a "pending" entry of 5 candidates and the user must open a picker in the gallery to choose one. Token Art should instead **auto-add a single random piece** per emission (no selection), and replace the per-piece "new painting ready" alert with a single **"your gallery is ready"** terminal alert when the personal gallery fills up.

## Goals

- Remove the candidate-selection flow. Each cadence emission auto-generates **one random piece** and appends it directly to the gallery.
- When the personal gallery first reaches a configurable target (`galleryTarget`, default **50**), the plugin's hook surfaces a **terminal message to the user** ("gallery is ready — run /token-art"), exactly once.
- The personal gallery (`~/.token-art`) **starts empty** and fills from real usage, so reaching the target is meaningful. The deployed GitHub Pages showcase (built by `build-collection.js`) is unchanged.

## Non-goals (YAGNI)

- Keeping the candidate picker / pending queue (retired).
- macOS desktop notifications or a web push (terminal `systemMessage` only).
- Changing the deployed showcase's pre-built 140-piece collection.

## Architecture

The cadence engine and per-session state are unchanged. The change is in **what an emission does** (auto-add instead of queue-candidates) and a new **gallery-ready check** in the hook that emits a one-time `systemMessage`.

### Terminal alert mechanism (verified against Claude Code hooks docs)

A `command` hook prints `{"systemMessage":"..."}` to stdout and exits 0; Claude Code shows that line to the **user** (not the model). Works for Stop/SessionStart/SessionEnd. The hook currently prints nothing to stdout, so adding a single `console.log(JSON.stringify({systemMessage}))` is safe. Exit code stays 0 (non-blocking).

## Components

### `engine/state.js`
- **Add** `addPiece(dir, stats, driverText, meta = {}) => piece`:
  - Parse driver; derive ONE trait record via `deriveTraits(stats, driver, meta.salt ?? 1)` (varied salt → random style/palette/format).
  - Assign `id = max(existing ids)+1`, copy `meta.trigger` onto the piece when present, set `title`/`plaque` via `makeTitle`/`makePlaque`.
  - Append to `gallery.json` (`loadGallery`/`saveGallery`) and return the piece.
- **Remove** `addPending`, `selectCandidate`, `listPending` and the `pending.json` helpers (`loadPending`/`savePending`). Remove their tests.
- `loadGallery`/`saveGallery` unchanged. `addPiece` accepts `meta.target` and sets `gallery.target = meta.target` when provided, so the personal gallery's UI counter reads `N / target`. The hook and `/api/simulate` pass `meta.target = config.galleryTarget` (both load config; `server.js` imports `loadConfig` from `watch/hook.js`, whose `main()` is guarded so importing is side-effect-free). The showcase builder (`build-collection.js`) keeps writing `target: 150` itself.

### `engine/cadence.js` + `config.json`
- Add `galleryTarget: 50` to `DEFAULT_CONFIG` and `mergeConfig` (top-level, sibling of `maxPerSession`).
- `config.json` gains `"galleryTarget": 50`.

### `watch/hook.js`
- For each emission, call `addPiece(STATE, stats, driver, { trigger: e.trigger, salt: <varied> })` instead of `addPending`. Use a per-emission salt derived from the existing rng (e.g. `Math.floor(rng()*1e9)`) so pieces vary.
- After adding pieces, run the **gallery-ready check**:
  - `count = loadGallery(STATE).pieces.length`.
  - If `count >= config.galleryTarget` and `usage.galleryAnnounced` is not yet true: print `console.log(JSON.stringify({ systemMessage: \`🎨 Your Token Art gallery is ready — ${count} pieces. Run /token-art to view it.\` }))` and set `usage.galleryAnnounced = true`.
  - `galleryAnnounced` is stored at the top level of `usage.json` (sibling of `sessions`), so it is a once-ever flag for that data dir.
- Still exits 0; still wrapped in `.catch(() => process.exit(0))`. Only the gallery-ready branch writes to stdout; all other paths print nothing.

### `server.js`
- Remove the `/api/pending` and `/api/select` routes.
- Repoint `POST /api/simulate`: build a simulated `stats` (as today) and call `addPiece(STATE, stats, driverText(), { trigger: 'interval', salt: <random> })`; return the new piece.
- Keep `/api/gallery`, `/api/usage`, `/api/driver` (GET/POST), `/gallery.json`, `/api/post`, and static serving.

### `gallery/`
- **Remove** the candidate picker modal markup/styles/JS, the per-piece "new painting ready" alert, and the `poll → /api/pending → showAlert/openPicker/choose` logic.
- **Keep** masonry, lightbox, Sessions strip, Driver editor, Simulate button (now auto-adds and refreshes), Post button.
- **Add** a gallery-ready banner: when `gallery.pieces.length >= gallery.target`, show a celebratory banner ("🎨 Gallery ready — N pieces") under the title wall. Counter reads `N / target`.
- A lightweight poll still calls `/api/gallery` (and `/api/usage` for the Sessions strip) every ~1.5s so the gallery and banner update live as pieces are added; no pending poll.

### `commands/token-art.md`
- Remove the auto-seed step (no `build-collection.js`). Just start the server pointed at `~/.token-art` and tell the user the gallery is at http://localhost:4800 — empty at first, filling as they work, with the terminal alert when it reaches the target.

### `build-collection.js` / deploy
- Unchanged. Still builds the 140-piece showcase for GitHub Pages. (It writes `target` into the showcase gallery.json as before, but that file is separate from the personal `~/.token-art` gallery.)

## Data flow (live)

```
You talk to Claude → Stop/SessionEnd hook
  → decideEmissions → N emissions
  → for each: addPiece(...) appends a random piece to ~/.token-art/state/gallery.json
  → gallery-ready check: if count >= galleryTarget and not announced
       → print {"systemMessage":"… gallery is ready … run /token-art"} ; usage.galleryAnnounced = true
gallery web app (if open) polls /api/gallery → masonry grows; banner shows at target
```

## Error handling

- Hook never fails the turn: any internal error → exit 0. Only the ready branch writes stdout, and only a single well-formed JSON object.
- Missing/old `usage.json` → `{ sessions: {} }` (galleryAnnounced absent → treated as false).
- `addPiece` on an empty/missing gallery → starts a fresh `{ pieces: [], target }`.

## Testing

- `engine/state.test.js`: `addPiece` appends exactly one piece with id/title/plaque; `meta.trigger` is carried; distinct salts produce distinct pieces. Remove the old `addPending`/`selectCandidate` tests.
- `engine/cadence.test.js`: `DEFAULT_CONFIG.galleryTarget === 50`; `mergeConfig` overlays it.
- `watch/hook.test.js`: a hook run that pushes the gallery to `>= galleryTarget` prints a `systemMessage` containing "ready" and sets `galleryAnnounced`; a subsequent run does NOT print again (once-only). (Drive via the exported helpers or an end-to-end smoke that captures stdout.)
- Full suite stays green.

## Rollout

- Build on branch, push to `main`. Community runs `/plugin marketplace update` + `/reload-plugins`. Existing `~/.token-art` galleries that were pre-seeded with 140 will already be "ready" (count ≥ 50) — acceptable; the once-only flag means they get one announcement on the next hook fire. (Users wanting the fresh "fill from empty" experience can delete `~/.token-art/state/gallery.json`.)
