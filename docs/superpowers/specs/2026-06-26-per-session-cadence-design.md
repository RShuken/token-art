# Per-Session Cadence — Design Spec

**Date:** 2026-06-26
**Author:** Ryan Shuken + Claude
**Context:** Token Art's Stop hook currently uses a single global `floor(tokens/15000)` counter (`~/.token-art/state/usage.json` = `{emitted, lastTokens}`). Because the counter is global while each session's transcript token count starts at 0, only the highest-water session ever generates art — new sessions inherit the prior high-water mark and stay silent. This spec makes generation **per-session**, adds a **configurable, slightly-randomized cadence**, and adds **milestone events** (session start/end, single-turn burst).

## Goals

- Each Claude Code session generates art from **its own** token usage, independently.
- Cadence is **configurable** via an editable `config.json` and **slightly randomized** so pieces don't land on robotic even marks.
- Support **milestone events**: emit on session start (optional), session end, and big single-turn token bursts.
- Make it visible **what each session is producing** (a per-session readout in the gallery).
- Keep the engine pure and well-tested; the hook stays a thin I/O shell.

## Non-goals (YAGNI)

- Time-based cadence (every X minutes) — not in this iteration.
- Probabilistic-per-turn mode beyond the single `emitProbability` knob on interval crossings.
- Editing `config.json` from the gallery UI (file-edit only for now).
- Cross-machine sync of session state.

## Architecture

A new pure module **`engine/cadence.js`** holds config defaults, config merging, and the emission decision logic. **`watch/hook.js`** becomes a thin shell that: reads the hook event from stdin, loads `config.json` + per-session usage, calls the cadence engine, calls `addPending` for each emission, and saves usage. The hook is registered for **three events** — `Stop`, `SessionStart`, `SessionEnd` — and branches on `hook_event_name`.

### Components

- **`engine/cadence.js`** (new, pure):
  - `DEFAULT_CONFIG` — the canonical defaults.
  - `mergeConfig(raw)` — deep-merge a parsed `config.json` over defaults; tolerant of missing/partial files.
  - `initSession(now)` — fresh per-session state.
  - `decideEmissions(prevSession, stats, event, config, rng) => { emissions, nextSession }` — the core decision. `emissions` is an array of `{ trigger }` (trigger ∈ `"interval" | "burst" | "session-start" | "session-end"`). Pure: all randomness comes from the passed `rng`.
- **`config.json`** (new, shipped with defaults, next to `driver.md`).
- **`watch/hook.js`** (modify): event-branching I/O shell using cadence + per-session usage keyed by `session_id`.
- **`engine/state.js`** (modify): `addPending(dir, stats, driverText, meta = {})` stores `meta.trigger` / `meta.sessionId` on the pending entry; `selectCandidate` copies `trigger` onto the chosen piece record.
- **`hooks/hooks.json`** (modify): register `watch/hook.js` for `Stop`, `SessionStart`, `SessionEnd`.
- **`server.js`** (modify): add `GET /api/usage` returning the per-session map.
- **`gallery/`** (modify): a compact "Sessions" strip (one row per session: short id, token total, pieces, last trigger) and show the emission `trigger` in the alert subtext.
- **`engine/cadence.test.js`** (new): unit tests for the engine.

## Config schema (`config.json`)

```json
{
  "mode": "jittered",
  "thresholdTokens": 15000,
  "jitterPct": 0.4,
  "emitProbability": 0.85,
  "maxPerSession": 10,
  "events": {
    "sessionStart": false,
    "sessionEnd": true,
    "burst": true,
    "burstTokens": 25000
  }
}
```

- `mode`: `"fixed"` (every `thresholdTokens`) or `"jittered"` (next interval = `thresholdTokens · (1 ± jitterPct)`).
- `emitProbability`: chance an interval crossing actually emits; otherwise the crossing is consumed silently and the next threshold is still advanced.
- `maxPerSession`: hard cap on total pieces (all triggers combined) per session.
- `events.burstTokens`: tokens spent in a single turn (`tokens − lastTokens`) that count as a burst.

## Per-session usage schema (`state/usage.json`)

```json
{
  "sessions": {
    "<session_id>": {
      "tokens": 92000,
      "count": 4,
      "nextThreshold": 104250,
      "lastTokens": 92000,
      "startedAt": "2026-06-26T…",
      "started": true,
      "ended": false
    }
  }
}
```

Old format (`{emitted, lastTokens}` with no `sessions` key) is ignored and re-initialized to `{ sessions: {} }`.

## Cadence engine logic (`decideEmissions`)

Input: `prevSession` (or undefined → `initSession`), `stats` (cumulative session stats from `analyzeTranscript`), `event` (`"Stop" | "SessionStart" | "SessionEnd"`), `config`, `rng` (seeded `mulberry32`). Returns `{ emissions, nextSession }`.

- On first sight of a session, initialize state and set `nextThreshold = nextInterval(config, rng)`.
- **`event === "SessionStart"`:** if `config.events.sessionStart` and `!session.started` → push `{trigger:"session-start"}` (respecting cap). Set `started = true`.
- **`event === "Stop"`:**
  - Update `session.tokens = stats.tokens`.
  - **Interval loop:** while `tokens ≥ nextThreshold` and `count < maxPerSession`: roll `rng() < emitProbability` → if true push `{trigger:"interval"}` and increment count; either way set `nextThreshold = tokens + nextInterval(config, rng)`.
  - **Burst:** if `config.events.burst` and `(tokens − lastTokens) ≥ burstTokens` and `count < maxPerSession` → push `{trigger:"burst"}`.
  - Set `lastTokens = tokens`.
- **`event === "SessionEnd"`:** if `config.events.sessionEnd` and `!session.ended` and `count < maxPerSession` → push `{trigger:"session-end"}`. Set `ended = true`.
- `nextInterval(config, rng)`: let `base = config.thresholdTokens`. `fixed` mode → `base`; `jittered` → `round(base · (1 + (rng()*2 − 1) · jitterPct))`, clamped to a minimum of `1` (and effectively `≥ base · (1 − jitterPct)`), always a positive integer.

All emissions are capped so the total per session never exceeds `maxPerSession`.

## Hook shell (`watch/hook.js`)

1. Read stdin JSON: `{ hook_event_name, session_id, transcript_path, ... }`.
2. `stats = analyzeTranscript(readTranscript(transcript_path))` (SessionEnd may still read the final transcript; SessionStart yields ~0 tokens, which is fine).
3. Load `config.json` (from `APP_ROOT`) via `mergeConfig`; load `usage.json` (from `STATE_DIR`).
4. `sid = session_id || "default"`; `rng = mulberry32(hashToSeed(sid + ':' + stats.tokens + ':' + event))`.
5. `{ emissions, nextSession } = decideEmissions(usage.sessions[sid], stats, event, config, rng)`.
6. For each emission: `addPending(STATE_DIR, stats, driverText, { trigger: e.trigger, sessionId: sid })`.
7. `usage.sessions[sid] = nextSession`; write `usage.json`.
8. Exit 0.

`THRESHOLD`/legacy `TOKEN_ART_THRESHOLD` env still overrides `config.thresholdTokens` when set (back-compat).

## Gallery / server

- `GET /api/usage` → `{ sessions: { … } }` from `STATE_DIR/usage.json`.
- Gallery: a compact "Sessions" strip under the title wall — for each session row: short id, `tokens`, `count` pieces, last `trigger`. Polled alongside the existing gallery poll.
- Alert subtext shows the trigger of the front pending entry (e.g. "Session ended · 5 options").

## Error handling

- Missing/malformed `config.json` → fall back to `DEFAULT_CONFIG` (never throw).
- Missing/old `usage.json` → `{ sessions: {} }`.
- Missing `session_id` → key under `"default"`.
- Hook never throws to the point of failing the Claude Code turn; on any internal error it exits 0 (best-effort, like today).

## Testing

`engine/cadence.test.js` (pure, `node:test`):
- `mergeConfig` fills defaults from `{}` and a partial object; tolerates `null`.
- `fixed` mode emits exactly at each `thresholdTokens` boundary.
- `jittered` interval stays within `± jitterPct` bounds and is a positive integer.
- `emitProbability` with a seeded rng: a forced-low rng never emits on crossings (but still advances threshold); a forced-high rng emits each crossing.
- `maxPerSession` cap is never exceeded across many Stop events.
- `burst` emits once when `tokens − lastTokens ≥ burstTokens`, not otherwise.
- `session-start` / `session-end` emit at most once each and only when enabled.
- **Per-session isolation:** interleaving two `session_id`s, each tracks its own thresholds/counts.

Existing `analyzeTranscript` tests stay. Full suite must remain green.

## Rollout

- Build on branch, push to `main`. Community runs `/plugin marketplace update` + `/reload-plugins` to pick up the new `SessionStart`/`SessionEnd` hooks and code.
- Local demo behavior unchanged unless `config.json` is present (shipped defaults match prior 15k cadence, now per-session + jittered).
