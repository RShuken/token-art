# Per-Session Cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Token Art generate art per Claude Code session with a configurable, slightly-randomized cadence and milestone events (session start/end, single-turn burst), and surface what each session produced.

**Architecture:** A new pure module `engine/cadence.js` owns config defaults, config merging, and the per-session emission decision (`decideEmissions`). `watch/hook.js` becomes a thin I/O shell registered for `Stop`/`SessionStart`/`SessionEnd` that keys state by `session_id`. `engine/state.js` gains an optional `meta` on `addPending` to carry the emission `trigger`. The server exposes `/api/usage` and the gallery shows a per-session strip + the trigger in the alert.

**Tech Stack:** Node.js (ESM, `"type":"module"`), `node:test` + `node:assert` (no deps), `node:http`, vanilla HTML/CSS/Canvas.

## Global Constraints

- Node ESM throughout (`import`/`export`); zero runtime npm dependencies; no build step.
- Tests use only `node:test` / `node:assert`. Server uses only `node:http`/`node:fs`/`node:path`.
- `engine/cadence.js` is PURE: `decideEmissions` takes an `rng` and never calls `Math.random()`/`Date.now()`. Timestamps are passed in.
- The hook must never fail the Claude Code turn: on any internal error it exits 0 (best-effort).
- Config defaults (verbatim): `mode:"jittered"`, `thresholdTokens:15000`, `jitterPct:0.4`, `emitProbability:0.85`, `maxPerSession:10`, `events:{ sessionStart:false, sessionEnd:true, burst:true, burstTokens:25000 }`.
- `trigger` values: `"interval" | "burst" | "session-start" | "session-end"`.
- Per-session usage schema: `{ sessions: { "<id>": { tokens, count, nextThreshold, lastTokens, startedAt, started, ended } } }`. Old format (no `sessions` key) → re-init to `{ sessions: {} }`.
- `TOKEN_ART_THRESHOLD` env, when set, overrides `config.thresholdTokens` (back-compat).
- Run commands from the project root: `/Users/shuken/AI/ai-demo-projects/Token Art`.

---

### Task 1: Config defaults + merge (`engine/cadence.js` part 1)

**Files:**
- Create: `engine/cadence.js`
- Test: `engine/cadence.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_CONFIG` — the canonical defaults object.
  - `mergeConfig(raw) => config` — deep-merges a parsed object (or `null`/`undefined`/partial) over defaults; never mutates `DEFAULT_CONFIG`.

- [ ] **Step 1: Write the failing test** `engine/cadence.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, mergeConfig } from './cadence.js';

test('DEFAULT_CONFIG has the documented shape', () => {
  assert.equal(DEFAULT_CONFIG.mode, 'jittered');
  assert.equal(DEFAULT_CONFIG.thresholdTokens, 15000);
  assert.equal(DEFAULT_CONFIG.jitterPct, 0.4);
  assert.equal(DEFAULT_CONFIG.emitProbability, 0.85);
  assert.equal(DEFAULT_CONFIG.maxPerSession, 10);
  assert.deepEqual(DEFAULT_CONFIG.events, { sessionStart: false, sessionEnd: true, burst: true, burstTokens: 25000 });
});

test('mergeConfig fills defaults from empty / null / undefined', () => {
  for (const v of [{}, null, undefined]) {
    assert.deepEqual(mergeConfig(v), DEFAULT_CONFIG);
  }
});

test('mergeConfig overlays partial values incl. nested events', () => {
  const c = mergeConfig({ thresholdTokens: 5000, events: { burst: false } });
  assert.equal(c.thresholdTokens, 5000);
  assert.equal(c.mode, 'jittered');               // default preserved
  assert.equal(c.events.burst, false);            // overridden
  assert.equal(c.events.sessionEnd, true);        // default preserved
  assert.equal(c.events.burstTokens, 25000);      // default preserved
});

test('mergeConfig does not mutate DEFAULT_CONFIG', () => {
  mergeConfig({ events: { burst: false } });
  assert.equal(DEFAULT_CONFIG.events.burst, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test engine/cadence.test.js`
Expected: FAIL — cannot find module `./cadence.js`.

- [ ] **Step 3: Implement** `engine/cadence.js`

```js
export const DEFAULT_CONFIG = {
  mode: 'jittered',
  thresholdTokens: 15000,
  jitterPct: 0.4,
  emitProbability: 0.85,
  maxPerSession: 10,
  events: { sessionStart: false, sessionEnd: true, burst: true, burstTokens: 25000 }
};

export function mergeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const e = r.events && typeof r.events === 'object' ? r.events : {};
  return {
    mode: r.mode ?? DEFAULT_CONFIG.mode,
    thresholdTokens: r.thresholdTokens ?? DEFAULT_CONFIG.thresholdTokens,
    jitterPct: r.jitterPct ?? DEFAULT_CONFIG.jitterPct,
    emitProbability: r.emitProbability ?? DEFAULT_CONFIG.emitProbability,
    maxPerSession: r.maxPerSession ?? DEFAULT_CONFIG.maxPerSession,
    events: {
      sessionStart: e.sessionStart ?? DEFAULT_CONFIG.events.sessionStart,
      sessionEnd: e.sessionEnd ?? DEFAULT_CONFIG.events.sessionEnd,
      burst: e.burst ?? DEFAULT_CONFIG.events.burst,
      burstTokens: e.burstTokens ?? DEFAULT_CONFIG.events.burstTokens
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test engine/cadence.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/cadence.js engine/cadence.test.js
git commit -m "feat: cadence config defaults + merge"
```

---

### Task 2: Session init + interval helper (`engine/cadence.js` part 2)

**Files:**
- Modify: `engine/cadence.js`
- Test: `engine/cadence.test.js` (append)

**Interfaces:**
- Consumes: `DEFAULT_CONFIG` (Task 1).
- Produces:
  - `initSession(startedAt) => session` — fresh per-session state: `{ tokens:0, count:0, nextThreshold:0, lastTokens:0, startedAt, started:false, ended:false }`.
  - `nextInterval(config, rng) => number` — positive integer interval. `fixed` → `thresholdTokens`; `jittered` → `round(thresholdTokens * (1 + (rng()*2-1)*jitterPct))`, clamped to `>= 1`.

- [ ] **Step 1: Write the failing test** (append to `engine/cadence.test.js`)

```js
import { initSession, nextInterval } from './cadence.js';
import { mulberry32 } from './rng.js';

test('initSession returns a fresh zeroed session', () => {
  const s = initSession('2026-01-01T00:00:00Z');
  assert.deepEqual(s, { tokens: 0, count: 0, nextThreshold: 0, lastTokens: 0, startedAt: '2026-01-01T00:00:00Z', started: false, ended: false });
});

test('nextInterval fixed mode returns thresholdTokens exactly', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 15000 });
  for (let i = 0; i < 20; i++) assert.equal(nextInterval(c, mulberry32(i)), 15000);
});

test('nextInterval jittered stays within bounds and is a positive integer', () => {
  const c = mergeConfig({ mode: 'jittered', thresholdTokens: 15000, jitterPct: 0.4 });
  for (let i = 0; i < 200; i++) {
    const v = nextInterval(c, mulberry32(i));
    assert.ok(Number.isInteger(v), `not integer: ${v}`);
    assert.ok(v >= 15000 * 0.6 - 1 && v <= 15000 * 1.4 + 1, `out of bounds: ${v}`);
    assert.ok(v >= 1);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test engine/cadence.test.js`
Expected: FAIL — `initSession`/`nextInterval` not exported.

- [ ] **Step 3: Implement** (append to `engine/cadence.js`)

```js
export function initSession(startedAt) {
  return { tokens: 0, count: 0, nextThreshold: 0, lastTokens: 0, startedAt, started: false, ended: false };
}

export function nextInterval(config, rng) {
  const base = config.thresholdTokens;
  if (config.mode === 'fixed') return Math.max(1, Math.round(base));
  const factor = 1 + (rng() * 2 - 1) * config.jitterPct;
  return Math.max(1, Math.round(base * factor));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test engine/cadence.test.js`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add engine/cadence.js engine/cadence.test.js
git commit -m "feat: cadence session init + jittered interval"
```

---

### Task 3: The emission decision (`engine/cadence.js` part 3)

**Files:**
- Modify: `engine/cadence.js`
- Test: `engine/cadence.test.js` (append)

**Interfaces:**
- Consumes: `initSession`, `nextInterval`, `mergeConfig` (Tasks 1-2).
- Produces:
  - `decideEmissions(prevSession, stats, event, config, rng) => { emissions, nextSession }`
    - `prevSession`: a session object or `undefined`/`null` (→ `initSession(stats.now)`).
    - `stats`: `{ tokens, now, ...rest }` — cumulative session stats; `now` is an ISO string passed by the caller (used only for `startedAt` on first init).
    - `event`: `"Stop" | "SessionStart" | "SessionEnd"`.
    - `emissions`: array of `{ trigger }` with `trigger ∈ "interval"|"burst"|"session-start"|"session-end"`.
    - `nextSession`: updated session object (never mutates `prevSession`).
    - Total `count` after the call never exceeds `config.maxPerSession`.

- [ ] **Step 1: Write the failing test** (append to `engine/cadence.test.js`)

```js
import { decideEmissions } from './cadence.js';

const NOW = '2026-01-01T00:00:00Z';
// rng stubs: deterministic generators
const always = (v) => () => v;            // constant rng
const seq = (arr) => { let i = 0; return () => arr[i++ % arr.length]; };

test('fixed mode emits once per threshold crossing (prob=1)', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 15000, emitProbability: 1, events: { burst: false, sessionEnd: false } });
  let s; let total = 0;
  // simulate Stop events at growing token totals
  for (const tokens of [10000, 16000, 31000, 46000]) {
    const r = decideEmissions(s, { tokens, now: NOW }, 'Stop', c, always(0)); // rng 0 < 1 => emit
    s = r.nextSession; total += r.emissions.length;
  }
  // crossings at 15k,30k,45k => 3 interval emits
  assert.equal(total, 3);
  assert.ok(s.count === 3);
});

test('emitProbability gates interval emission but still advances threshold', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 15000, emitProbability: 0.85, events: { burst: false, sessionEnd: false } });
  // rng always 0.99 => 0.99 < 0.85 false => never emits
  let s; let total = 0;
  for (const tokens of [16000, 31000, 46000]) {
    const r = decideEmissions(s, { tokens, now: NOW }, 'Stop', c, always(0.99));
    s = r.nextSession; total += r.emissions.length;
  }
  assert.equal(total, 0);
  // threshold advanced past 45000 so it didn't re-emit forever
  assert.ok(s.nextThreshold > 46000);
});

test('maxPerSession caps total emissions', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 1000, emitProbability: 1, maxPerSession: 3, events: { burst: false, sessionEnd: false } });
  const r = decideEmissions(undefined, { tokens: 100000, now: NOW }, 'Stop', c, always(0));
  assert.equal(r.emissions.length, 3);
  assert.equal(r.nextSession.count, 3);
});

test('burst emits when single-turn delta >= burstTokens', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 1e9, emitProbability: 1, events: { burst: true, burstTokens: 25000, sessionEnd: false } });
  // first Stop sets lastTokens=10000 (no burst from 0? delta 10000 < 25000)
  let r = decideEmissions(undefined, { tokens: 10000, now: NOW }, 'Stop', c, always(0));
  assert.equal(r.emissions.filter(e => e.trigger === 'burst').length, 0);
  // next Stop jumps +30000 => burst
  r = decideEmissions(r.nextSession, { tokens: 40000, now: NOW }, 'Stop', c, always(0));
  assert.equal(r.emissions.filter(e => e.trigger === 'burst').length, 1);
});

test('session-start emits at most once and only when enabled', () => {
  const on = mergeConfig({ events: { sessionStart: true } });
  let r = decideEmissions(undefined, { tokens: 0, now: NOW }, 'SessionStart', on, always(0));
  assert.equal(r.emissions.length, 1);
  assert.equal(r.emissions[0].trigger, 'session-start');
  // second SessionStart on same session => no emit
  r = decideEmissions(r.nextSession, { tokens: 0, now: NOW }, 'SessionStart', on, always(0));
  assert.equal(r.emissions.length, 0);
  // disabled => no emit
  const off = mergeConfig({ events: { sessionStart: false } });
  const r2 = decideEmissions(undefined, { tokens: 0, now: NOW }, 'SessionStart', off, always(0));
  assert.equal(r2.emissions.length, 0);
});

test('session-end emits once when enabled', () => {
  const c = mergeConfig({ events: { sessionEnd: true } });
  let r = decideEmissions(undefined, { tokens: 5000, now: NOW }, 'SessionEnd', c, always(0));
  assert.equal(r.emissions.length, 1);
  assert.equal(r.emissions[0].trigger, 'session-end');
  r = decideEmissions(r.nextSession, { tokens: 5000, now: NOW }, 'SessionEnd', c, always(0));
  assert.equal(r.emissions.length, 0);
});

test('per-session isolation: two ids tracked independently by the caller', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 15000, emitProbability: 1, events: { burst: false, sessionEnd: false } });
  let a, b;
  const ra = decideEmissions(a, { tokens: 16000, now: NOW }, 'Stop', c, always(0)); a = ra.nextSession;
  const rb = decideEmissions(b, { tokens: 1000, now: NOW }, 'Stop', c, always(0)); b = rb.nextSession;
  assert.equal(a.count, 1);
  assert.equal(b.count, 0);
});

test('does not mutate prevSession', () => {
  const c = mergeConfig({ mode: 'fixed', thresholdTokens: 1000, emitProbability: 1, events: { burst: false, sessionEnd: false } });
  const r1 = decideEmissions(undefined, { tokens: 5000, now: NOW }, 'Stop', c, always(0));
  const snapshot = JSON.stringify(r1.nextSession);
  decideEmissions(r1.nextSession, { tokens: 9000, now: NOW }, 'Stop', c, always(0));
  assert.equal(JSON.stringify(r1.nextSession), snapshot);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test engine/cadence.test.js`
Expected: FAIL — `decideEmissions` not exported.

- [ ] **Step 3: Implement** (append to `engine/cadence.js`)

```js
export function decideEmissions(prevSession, stats, event, config, rng) {
  const s = prevSession
    ? { ...prevSession, events: undefined }   // shallow clone, drop stray keys
    : initSession(stats.now);
  // normalize clone (initSession already clean; clone again to avoid mutation)
  const session = {
    tokens: s.tokens, count: s.count, nextThreshold: s.nextThreshold,
    lastTokens: s.lastTokens, startedAt: s.startedAt, started: s.started, ended: s.ended
  };
  const emissions = [];
  const cap = config.maxPerSession;
  const canEmit = () => session.count < cap;

  if (event === 'SessionStart') {
    if (config.events.sessionStart && !session.started && canEmit()) {
      emissions.push({ trigger: 'session-start' }); session.count++;
    }
    session.started = true;
    return { emissions, nextSession: session };
  }

  if (event === 'SessionEnd') {
    if (config.events.sessionEnd && !session.ended && canEmit()) {
      emissions.push({ trigger: 'session-end' }); session.count++;
    }
    session.ended = true;
    return { emissions, nextSession: session };
  }

  // event === 'Stop'
  session.tokens = stats.tokens;
  if (session.nextThreshold <= 0) session.nextThreshold = nextInterval(config, rng);
  while (session.tokens >= session.nextThreshold && canEmit()) {
    if (rng() < config.emitProbability) { emissions.push({ trigger: 'interval' }); session.count++; }
    session.nextThreshold = session.tokens + nextInterval(config, rng);
  }
  if (config.events.burst && canEmit() && (session.tokens - session.lastTokens) >= config.events.burstTokens) {
    emissions.push({ trigger: 'burst' }); session.count++;
  }
  session.lastTokens = session.tokens;
  return { emissions, nextSession: session };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test engine/cadence.test.js`
Expected: PASS (15 tests total).

- [ ] **Step 5: Run the whole suite (no regressions)**

Run: `node --test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add engine/cadence.js engine/cadence.test.js
git commit -m "feat: per-session emission decision engine"
```

---

### Task 4: `addPending` carries an emission `meta` (`engine/state.js`)

**Files:**
- Modify: `engine/state.js`
- Test: `engine/state.test.js` (append)

**Interfaces:**
- Consumes: existing `addPending`, `selectCandidate`, `makeCandidates`, `parseDriver`, `makeTitle`, `makePlaque`.
- Produces:
  - `addPending(dir, stats, driverText, meta = {})` — stores `meta.trigger` and `meta.sessionId` on the pending entry (`entry.trigger`, `entry.sessionId`).
  - `selectCandidate(dir, pendingId, idx)` — copies the entry's `trigger` onto the chosen piece record (`piece.trigger`), when present.

- [ ] **Step 1: Write the failing test** (append to `engine/state.test.js`)

```js
test('addPending stores trigger/sessionId meta; selectCandidate carries trigger', () => {
  const d = freshDir();
  const entry = addPending(d, stats, 'random', { trigger: 'session-end', sessionId: 'sess-123' });
  assert.equal(entry.trigger, 'session-end');
  assert.equal(entry.sessionId, 'sess-123');
  const piece = selectCandidate(d, entry.pendingId, 0);
  assert.equal(piece.trigger, 'session-end');
});

test('addPending without meta still works and omits trigger', () => {
  const d = freshDir();
  const entry = addPending(d, stats, 'random');
  assert.equal(entry.trigger, undefined);
  const piece = selectCandidate(d, entry.pendingId, 0);
  assert.equal(piece.trigger, undefined);
});
```

(Reuse the existing `freshDir()` and `stats` helpers already at the top of `engine/state.test.js`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test engine/state.test.js`
Expected: FAIL — `entry.trigger` is `undefined` (meta not yet stored).

- [ ] **Step 3: Implement** — edit `engine/state.js`

Change the `addPending` signature and body:

```js
export function addPending(dir, stats, driverText, meta = {}) {
  const driver = parseDriver(driverText || 'random');
  const candidates = makeCandidates(stats, driver, 5);
  const list = loadPending(dir);
  const pendingId = `p${stats.tokens}_${list.length}_${Math.floor(stats.prompts)}`;
  const entry = { pendingId, candidates };
  if (meta && meta.trigger) entry.trigger = meta.trigger;
  if (meta && meta.sessionId) entry.sessionId = meta.sessionId;
  list.push(entry); savePending(dir, list);
  return entry;
}
```

In `selectCandidate`, after building `piece` and before `makeTitle`, carry the trigger:

```js
  const piece = { id, ...chosen };
  if (entry.trigger) piece.trigger = entry.trigger;
  piece.title = makeTitle(piece, id);
  piece.plaque = makePlaque(piece);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test engine/state.test.js`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add engine/state.js engine/state.test.js
git commit -m "feat: addPending/selectCandidate carry emission trigger meta"
```

---

### Task 5: Rewrite the hook shell + per-session usage (`watch/hook.js`)

**Files:**
- Modify: `watch/hook.js`
- Create: `config.json`
- Test: `watch/hook.test.js` (append)

**Interfaces:**
- Consumes: `analyzeTranscript` (existing), `decideEmissions`/`mergeConfig` (cadence), `addPending` (state), `mulberry32`/`hashToSeed` (rng), `APP_ROOT`/`STATE_DIR` (paths).
- Produces:
  - `loadUsage(dir) => { sessions }` — reads `usage.json`, returns `{ sessions: {} }` if missing or old-format (no `sessions` key).
  - `loadConfig(appRoot) => config` — reads `config.json` via `mergeConfig`; defaults on missing/malformed. Applies `TOKEN_ART_THRESHOLD` env override when set.
  - (`analyzeTranscript` unchanged.)
  - Side-effect `main()` still gated by the existing self-invocation guard.

- [ ] **Step 1: Write the failing test** (append to `watch/hook.test.js`)

```js
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadUsage, loadConfig } from './hook.js';

test('loadUsage returns empty sessions for missing or old-format files', () => {
  const d = mkdtempSync(join(tmpdir(), 'ta-usage-'));
  assert.deepEqual(loadUsage(d), { sessions: {} });
  writeFileSync(join(d, 'usage.json'), JSON.stringify({ emitted: 6, lastTokens: 90000 }));
  assert.deepEqual(loadUsage(d), { sessions: {} });               // old format ignored
  writeFileSync(join(d, 'usage.json'), JSON.stringify({ sessions: { a: { tokens: 1 } } }));
  assert.deepEqual(loadUsage(d).sessions.a, { tokens: 1 });
});

test('loadConfig returns defaults when config.json is absent', () => {
  const d = mkdtempSync(join(tmpdir(), 'ta-cfg-'));
  const c = loadConfig(d);
  assert.equal(c.thresholdTokens, 15000);
  assert.equal(c.mode, 'jittered');
});

test('loadConfig applies TOKEN_ART_THRESHOLD override', () => {
  const d = mkdtempSync(join(tmpdir(), 'ta-cfg2-'));
  const prev = process.env.TOKEN_ART_THRESHOLD;
  process.env.TOKEN_ART_THRESHOLD = '5000';
  try { assert.equal(loadConfig(d).thresholdTokens, 5000); }
  finally { if (prev === undefined) delete process.env.TOKEN_ART_THRESHOLD; else process.env.TOKEN_ART_THRESHOLD = prev; }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test watch/hook.test.js`
Expected: FAIL — `loadUsage`/`loadConfig` not exported.

- [ ] **Step 3: Create** `config.json`

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

- [ ] **Step 4: Rewrite** `watch/hook.js`

Replace the file's body below the existing `analyzeTranscript`/`readTranscript`/`textOf` functions and imports. Keep `analyzeTranscript`, `textOf`, `readTranscript` exactly as they are. Replace the imports block and the `main()`/exports region with:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPending } from '../engine/state.js';
import { APP_ROOT, STATE_DIR } from '../engine/paths.js';
import { mergeConfig, decideEmissions } from '../engine/cadence.js';
import { mulberry32, hashToSeed } from '../engine/rng.js';

const ROOT = APP_ROOT;
const STATE = STATE_DIR;
```

(Delete the old `const THRESHOLD = …` line — threshold now comes from config.)

Keep `textOf`, `analyzeTranscript`, `readTranscript` unchanged. Then add the new exported helpers and `main()`:

```js
export function loadConfig(appRoot) {
  let raw = null;
  const p = join(appRoot, 'config.json');
  if (existsSync(p)) { try { raw = JSON.parse(readFileSync(p, 'utf8')); } catch { raw = null; } }
  const config = mergeConfig(raw);
  const envT = process.env.TOKEN_ART_THRESHOLD;
  if (envT && Number(envT) > 0) config.thresholdTokens = Number(envT);
  return config;
}

export function loadUsage(dir) {
  const p = join(dir, 'usage.json');
  if (!existsSync(p)) return { sessions: {} };
  try {
    const u = JSON.parse(readFileSync(p, 'utf8'));
    if (u && typeof u === 'object' && u.sessions && typeof u.sessions === 'object') return u;
  } catch {}
  return { sessions: {} };
}

async function main() {
  let raw = ''; for await (const c of process.stdin) raw += c;
  let hook = {}; try { hook = JSON.parse(raw); } catch {}
  const event = hook.hook_event_name || 'Stop';
  const sid = hook.session_id || 'default';
  const stats = analyzeTranscript(readTranscript(hook.transcript_path));
  stats.now = new Date().toISOString();

  const config = loadConfig(ROOT);
  mkdirSync(STATE, { recursive: true });
  const usage = loadUsage(STATE);
  const rng = mulberry32(hashToSeed(sid + ':' + stats.tokens + ':' + event));
  const { emissions, nextSession } = decideEmissions(usage.sessions[sid], stats, event, config, rng);

  if (emissions.length) {
    const driver = existsSync(join(ROOT, 'driver.md')) ? readFileSync(join(ROOT, 'driver.md'), 'utf8') : 'random';
    for (const e of emissions) addPending(STATE, stats, driver, { trigger: e.trigger, sessionId: sid });
  }
  usage.sessions[sid] = nextSession;
  writeFileSync(join(STATE, 'usage.json'), JSON.stringify(usage, null, 2));
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => process.exit(0));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test watch/hook.test.js`
Expected: PASS (existing `analyzeTranscript` tests + 3 new).

- [ ] **Step 6: End-to-end smoke (per-session + jitter)**

Run:
```bash
rm -rf /tmp/ta-cadence && export TOKEN_ART_HOME=/tmp/ta-cadence && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art"
printf '{"type":"assistant","message":{"role":"assistant","usage":{"input_tokens":40000,"output_tokens":0}}}\n' > /tmp/ta-c.jsonl
echo '{"hook_event_name":"Stop","session_id":"sessA","transcript_path":"/tmp/ta-c.jsonl"}' | node "watch/hook.js"
echo '{"hook_event_name":"Stop","session_id":"sessB","transcript_path":"/tmp/ta-c.jsonl"}' | node "watch/hook.js"
node -e "const u=require('/tmp/ta-cadence/state/usage.json'); console.log('sessions:', Object.keys(u.sessions)); console.log('A count:', u.sessions.sessA.count, '| B count:', u.sessions.sessB.count)"
unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT
```
Expected: two sessions present, each with `count >= 1` (40k tokens crosses ~2 jittered thresholds + possible burst) — proving **per-session isolation** (sessB generates independently, not blocked by sessA).

- [ ] **Step 7: Commit**

```bash
git add watch/hook.js watch/hook.test.js config.json
git commit -m "feat: per-session, config-driven, event-aware cadence hook"
```

---

### Task 6: Register the three hook events (`hooks/hooks.json`)

**Files:**
- Modify: `hooks/hooks.json`

**Interfaces:** none (config file consumed by Claude Code).

- [ ] **Step 1: Rewrite** `hooks/hooks.json`

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "TOKEN_ART_HOME=\"$HOME/.token-art\" node \"${CLAUDE_PLUGIN_ROOT}/watch/hook.js\"", "timeout": 20 } ] }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "TOKEN_ART_HOME=\"$HOME/.token-art\" node \"${CLAUDE_PLUGIN_ROOT}/watch/hook.js\"", "timeout": 20 } ] }
    ],
    "SessionEnd": [
      { "hooks": [ { "type": "command", "command": "TOKEN_ART_HOME=\"$HOME/.token-art\" node \"${CLAUDE_PLUGIN_ROOT}/watch/hook.js\"", "timeout": 20 } ] }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('valid')"`
Expected: `valid`.

- [ ] **Step 3: Verify each event routes through the hook**

Run:
```bash
rm -rf /tmp/ta-evt && export TOKEN_ART_HOME=/tmp/ta-evt && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art"
printf '{"type":"assistant","message":{"role":"assistant","usage":{"input_tokens":1000,"output_tokens":0}}}\n' > /tmp/ta-e.jsonl
echo '{"hook_event_name":"SessionEnd","session_id":"sX","transcript_path":"/tmp/ta-e.jsonl"}' | node "watch/hook.js"
node -e "const u=require('/tmp/ta-evt/state/usage.json'); console.log('ended:', u.sessions.sX.ended, '| pieces:', u.sessions.sX.count)"
unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT
```
Expected: `ended: true` and `pieces: 1` (SessionEnd default-enabled emits one).

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: register Stop/SessionStart/SessionEnd hooks"
```

---

### Task 7: `/api/usage` + Sessions strip + trigger in alert (server + gallery)

**Files:**
- Modify: `server.js`
- Modify: `gallery/index.html`
- Modify: `gallery/style.css`
- Modify: `gallery/live.js`

**Interfaces:**
- Consumes: existing state files; `loadUsage` shape `{ sessions }`.
- Produces: `GET /api/usage` → the parsed `usage.json` (or `{ sessions: {} }`); a `#sessions` strip in the gallery; alert subtext includes the front pending entry's `trigger`.

This task is verified by running the server and viewing in a browser (no unit test).

- [ ] **Step 1: Add the `/api/usage` route to** `server.js`

In the GET-routes block near the other `if (p === '/api/...')` lines, add:

```js
    if (p === '/api/usage') {
      const up = join(STATE, 'usage.json');
      let u = { sessions: {} };
      if (existsSync(up)) { try { u = JSON.parse(readFileSync(up, 'utf8')); } catch {} }
      return send(res, 200, u);
    }
```

- [ ] **Step 2: Add the Sessions strip markup to** `gallery/index.html`

Immediately after the `.titlewall` closing `</div>` (before `<div class="masonry" …>`), insert:

```html
<div class="sessions" id="sessions"></div>
```

- [ ] **Step 3: Append styles to** `gallery/style.css`

```css
.sessions { display:flex; gap:10px; flex-wrap:wrap; padding:0 32px 18px; }
.sess { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px 12px; font-size:12px; color:var(--muted); }
.sess b { color:var(--ink); font-weight:700; }
.sess .trig { color:var(--gold); }
```

- [ ] **Step 4: Render the strip + trigger in** `gallery/live.js`

Add a sessions renderer and call it from the poll loop. Insert near the top (after the `$` helper):

```js
async function refreshSessions() {
  try {
    const u = await api('/api/usage');
    const el = $('sessions'); if (!el) return;
    const rows = Object.entries(u.sessions || {});
    el.innerHTML = rows.map(([id, s]) => {
      const tokens = (s.tokens || 0).toLocaleString();
      return `<div class="sess"><b>${id.slice(0, 8)}</b> · ${tokens} tokens · <b>${s.count || 0}</b> pieces</div>`;
    }).join('');
  } catch {}
}
```

In `showAlert(entry)`, include the trigger when present — replace the existing `$('alertSub').textContent = …` line with:

```js
  const trig = entry.trigger ? entry.trigger.replace('-', ' ') + ' · ' : '';
  $('alertSub').textContent = `${trig}${entry.candidates.length} options · session of ${entry.candidates[0].stats.tokens.toLocaleString()} tokens`;
```

In the `poll()` function, after handling pending, also refresh sessions — add `refreshSessions();` as the last line of `poll()`.

- [ ] **Step 5: Verify in a browser**

Run:
```bash
rm -rf /tmp/ta-ui && export TOKEN_ART_HOME=/tmp/ta-ui && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art"
node build-collection.js 30 >/dev/null 2>&1
printf '{"type":"assistant","message":{"role":"assistant","usage":{"input_tokens":50000,"output_tokens":0}}}\n' > /tmp/ta-u.jsonl
echo '{"hook_event_name":"Stop","session_id":"demoSess","transcript_path":"/tmp/ta-u.jsonl"}' | node "watch/hook.js"
pkill -f "node server.js" 2>/dev/null; (node server.js >/dev/null 2>&1 &) ; sleep 1
curl -s localhost:4800/api/usage
```
Expected: `/api/usage` returns JSON with `demoSess`. Open http://localhost:4800 — the Sessions strip shows a `demoSess` row with token count + piece count, and clicking the pending alert shows its trigger. Stop server: `pkill -f "node server.js"; unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT`.

- [ ] **Step 6: Commit**

```bash
git add server.js gallery/index.html gallery/style.css gallery/live.js
git commit -m "feat: /api/usage, sessions strip, trigger in alert"
```

---

### Task 8: Document config + full sweep (README + config docs)

**Files:**
- Modify: `README.md`
- Test: whole suite

**Interfaces:** none new.

- [ ] **Step 1: Run the full suite**

Run: `node --test`
Expected: all pass (rng, palettes, traits, titles, render-smoke, simulate, state, publish, hook, cadence). Fix any failure before continuing.

- [ ] **Step 2: Add a Cadence section to** `README.md` (after the "Real usage hook" section)

```markdown
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
| `events.sessionStart` | `false` | emit a piece when a session begins |
| `events.sessionEnd` | `true` | emit a piece when a session ends |
| `events.burst` | `true` | emit on a big single-turn token burst |
| `events.burstTokens` | `25000` | tokens in one turn that count as a burst |

Each piece records its **trigger** (`interval` / `burst` / `session-start` / `session-end`),
shown in the gallery alert. The top of the gallery shows a per-session strip (tokens +
pieces) so you can see what each session produced.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: cadence config + per-session behavior"
```

---

## Self-Review

**Spec coverage:**
- Pure `engine/cadence.js` (config + merge + init + interval + decideEmissions) → Tasks 1-3. ✓
- Per-session usage schema + old-format reinit → Task 5 (`loadUsage`). ✓
- Config defaults + `config.json` + env override → Tasks 1, 5. ✓
- Jittered/fixed cadence, emitProbability, maxPerSession, burst, session start/end, trigger → Task 3. ✓
- `addPending` meta + `selectCandidate` trigger → Task 4. ✓
- Hook shell branching on `hook_event_name`, keyed by `session_id`, best-effort exit 0 → Task 5. ✓
- Three hook events registered → Task 6. ✓
- `/api/usage` + sessions strip + trigger in alert → Task 7. ✓
- Tests for fixed/jittered/probability/cap/burst/events/per-session isolation → Task 3. ✓
- Docs → Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `decideEmissions(prevSession, stats, event, config, rng) => { emissions, nextSession }` consistent across Tasks 3 and 5. Session object keys `{tokens,count,nextThreshold,lastTokens,startedAt,started,ended}` consistent (Tasks 2, 3, 5). `addPending(dir, stats, driverText, meta)` and `meta={trigger,sessionId}` consistent across Tasks 4 and 5. `trigger` value set `interval|burst|session-start|session-end` consistent (Tasks 3, 4, 7). `loadUsage`/`loadConfig` exported from hook.js and consumed in Task 7's mental model (server reads file directly, not the function — intentional, no cross-task import). ✓
