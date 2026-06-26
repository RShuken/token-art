# Auto-Add + Gallery-Ready Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each cadence emission auto-adds one random art piece (no candidate picker); when the personal gallery first reaches `galleryTarget` (50) pieces, the hook prints a one-time terminal `systemMessage` telling the user the gallery is ready.

**Architecture:** Replace the pending/candidate/picker path with a direct `addPiece` that appends one random piece to `gallery.json`. The hook calls `addPiece` per emission and, after adding, prints `{"systemMessage":...}` exactly once when the gallery count crosses `galleryTarget`. The gallery UI drops the picker/alert and gains a "ready" banner. The personal gallery starts empty (the `/token-art` command no longer auto-seeds).

**Tech Stack:** Node.js (ESM, `"type":"module"`), `node:test`+`node:assert` (no deps), `node:http`, vanilla HTML/CSS/Canvas.

## Global Constraints

- Node ESM throughout; zero runtime npm dependencies; no build step. Tests use only `node:test`/`node:assert`.
- The hook must never fail the Claude Code turn: on any internal error it exits 0. The ONLY thing the hook may print to stdout is a single `{"systemMessage":"..."}` JSON object (and only when the gallery just became ready); all other paths print nothing.
- Terminal alert mechanism: a `command` hook prints `{"systemMessage":"text"}` to stdout (exit 0) → Claude Code shows it to the user. Verified against current hooks docs.
- `galleryTarget` default is `50`. `galleryAnnounced` is a once-ever boolean at the TOP LEVEL of `usage.json` (sibling of `sessions`).
- Determinism unchanged: `deriveTraits(stats, driver, salt)` is the single-piece generator; randomness/variety comes from the `salt`.
- Run commands from the project root: `/Users/shuken/AI/ai-demo-projects/Token Art`.

---

### Task 1: Add `galleryTarget` to config

**Files:**
- Modify: `engine/cadence.js` (`DEFAULT_CONFIG`, `mergeConfig`)
- Modify: `config.json`
- Test: `engine/cadence.test.js` (append)

**Interfaces:**
- Consumes: existing `DEFAULT_CONFIG`/`mergeConfig`.
- Produces: `DEFAULT_CONFIG.galleryTarget === 50`; `mergeConfig` overlays `galleryTarget`.

- [ ] **Step 1: Write the failing test** (append to `engine/cadence.test.js`)

```js
test('DEFAULT_CONFIG has galleryTarget 50', () => {
  assert.equal(DEFAULT_CONFIG.galleryTarget, 50);
});

test('mergeConfig overlays galleryTarget and defaults it', () => {
  assert.equal(mergeConfig({}).galleryTarget, 50);
  assert.equal(mergeConfig({ galleryTarget: 25 }).galleryTarget, 25);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test engine/cadence.test.js`
Expected: FAIL — `galleryTarget` is `undefined`.

- [ ] **Step 3: Implement** — edit `engine/cadence.js`

In `DEFAULT_CONFIG`, add `galleryTarget: 50` after `maxPerSession: 10,`:

```js
export const DEFAULT_CONFIG = {
  mode: 'jittered',
  thresholdTokens: 15000,
  jitterPct: 0.4,
  emitProbability: 0.85,
  maxPerSession: 10,
  galleryTarget: 50,
  events: { sessionStart: false, sessionEnd: true, burst: true, burstTokens: 25000 }
};
```

In `mergeConfig`, add the `galleryTarget` line alongside the other top-level fields:

```js
    maxPerSession: r.maxPerSession ?? DEFAULT_CONFIG.maxPerSession,
    galleryTarget: r.galleryTarget ?? DEFAULT_CONFIG.galleryTarget,
```

- [ ] **Step 4: Update** `config.json` — add `"galleryTarget": 50,` after the `"maxPerSession": 10,` line:

```json
{
  "mode": "jittered",
  "thresholdTokens": 15000,
  "jitterPct": 0.4,
  "emitProbability": 0.85,
  "maxPerSession": 10,
  "galleryTarget": 50,
  "events": {
    "sessionStart": false,
    "sessionEnd": true,
    "burst": true,
    "burstTokens": 25000
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test engine/cadence.test.js`
Expected: PASS (all cadence tests incl. 2 new).

- [ ] **Step 6: Commit**

```bash
git add engine/cadence.js engine/cadence.test.js config.json
git commit -m "feat: add galleryTarget config (default 50)"
```

---

### Task 2: `addPiece` — generate one random piece directly

**Files:**
- Modify: `engine/state.js`
- Test: `engine/state.test.js` (append)

**Interfaces:**
- Consumes: `deriveTraits`/`parseDriver` (traits), `makeTitle`/`makePlaque` (titles), `loadGallery`/`saveGallery` (state).
- Produces: `addPiece(dir, stats, driverText, meta = {}) => piece` — appends ONE piece to `gallery.json` and returns it. `meta` may include `salt` (number, default 1), `trigger` (string), `target` (number). Sets `gallery.target = meta.target` when provided.

Note: this task ADDS `addPiece` and ADDS `import { deriveTraits } from './traits.js'`. It does NOT remove `addPending`/`selectCandidate` yet (Task 6 does, after callers are repointed).

- [ ] **Step 1: Write the failing test** (append to `engine/state.test.js`)

```js
import { addPiece } from './state.js';

test('addPiece appends one piece with id/title/plaque and carries trigger', () => {
  const d = freshDir();
  const before = loadGallery(d).pieces.length;
  const piece = addPiece(d, stats, 'random', { salt: 5, trigger: 'session-end', target: 50 });
  assert.equal(loadGallery(d).pieces.length, before + 1);
  assert.ok(piece.id > 0);
  assert.ok(typeof piece.title === 'string' && piece.title.length);
  assert.ok(typeof piece.plaque === 'string' && piece.plaque.length);
  assert.equal(piece.trigger, 'session-end');
  assert.equal(loadGallery(d).target, 50);
});

test('addPiece with different salts yields different pieces', () => {
  const d = freshDir();
  const a = addPiece(d, stats, 'random', { salt: 1 });
  const b = addPiece(d, stats, 'random', { salt: 2 });
  assert.notEqual(a.seed, b.seed);
  assert.equal(loadGallery(d).pieces.length, 2);
});
```

(`freshDir()` and `stats` already exist at the top of `engine/state.test.js`. `freshDir` seeds a gallery with one piece `{id:1}`, so `before` accounts for it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test engine/state.test.js`
Expected: FAIL — `addPiece` not exported.

- [ ] **Step 3: Implement** — edit `engine/state.js`

Add `deriveTraits` to the traits import (line 3):

```js
import { makeCandidates, parseDriver, deriveTraits } from './traits.js';
```

Add `addPiece` (e.g. directly after `saveGallery`):

```js
export function addPiece(dir, stats, driverText, meta = {}) {
  const driver = parseDriver(driverText || 'random');
  const t = deriveTraits(stats, driver, meta.salt ?? 1);
  const gallery = loadGallery(dir);
  if (meta.target) gallery.target = meta.target;
  const id = gallery.pieces.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;
  const piece = { id, ...t };
  if (meta.trigger) piece.trigger = meta.trigger;
  piece.title = makeTitle(piece, id);
  piece.plaque = makePlaque(piece);
  gallery.pieces.push(piece);
  saveGallery(dir, gallery);
  return piece;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test engine/state.test.js`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add engine/state.js engine/state.test.js
git commit -m "feat: addPiece — direct single random piece generation"
```

---

### Task 3: Hook uses `addPiece` + one-time gallery-ready `systemMessage`

**Files:**
- Modify: `watch/hook.js`
- Test: `watch/hook.test.js` (append)

**Interfaces:**
- Consumes: `addPiece` (state), `loadGallery` (state), `decideEmissions`/`mergeConfig` (cadence), `loadConfig`/`loadUsage` (hook, existing), `mulberry32`/`hashToSeed` (rng).
- Produces:
  - `checkGalleryReady(dir, config, usage) => { announce: string|null, usage }` — pure-ish helper: if `loadGallery(dir).pieces.length >= config.galleryTarget` and `!usage.galleryAnnounced`, returns `announce` = the message string and `usage.galleryAnnounced = true`; else `announce: null`. Returns a NEW usage object (does not mutate input).
  - `main()` now: calls `addPiece` per emission (with `salt`+`trigger`+`target`), then runs the ready check and prints the `systemMessage`.

- [ ] **Step 1: Write the failing test** (append to `watch/hook.test.js`)

```js
import { checkGalleryReady } from './hook.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function galleryDir(count) {
  const d = mkdtempSync(join(tmpdir(), 'ta-ready-'));
  const pieces = Array.from({ length: count }, (_, i) => ({ id: i + 1 }));
  writeFileSync(join(d, 'gallery.json'), JSON.stringify({ pieces, target: 50 }));
  return d;
}

test('checkGalleryReady announces once at the target and not before', () => {
  const cfg = { galleryTarget: 50 };
  // below target → no announce
  let r = checkGalleryReady(galleryDir(49), cfg, { sessions: {} });
  assert.equal(r.announce, null);
  // at/over target, not yet announced → announce + flag set
  const d = galleryDir(50);
  r = checkGalleryReady(d, cfg, { sessions: {} });
  assert.match(r.announce, /ready/i);
  assert.equal(r.usage.galleryAnnounced, true);
  // already announced → no repeat
  const r2 = checkGalleryReady(d, cfg, r.usage);
  assert.equal(r2.announce, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test watch/hook.test.js`
Expected: FAIL — `checkGalleryReady` not exported.

- [ ] **Step 3: Implement** — edit `watch/hook.js`

Change the state import to include `addPiece` and `loadGallery`, and drop `addPending`:

```js
import { addPiece, loadGallery } from '../engine/state.js';
```

Add the `checkGalleryReady` export (near `loadConfig`/`loadUsage`):

```js
export function checkGalleryReady(dir, config, usage) {
  const next = { ...usage };
  const count = loadGallery(dir).pieces.length;
  if (count >= config.galleryTarget && !usage.galleryAnnounced) {
    next.galleryAnnounced = true;
    return { announce: `🎨 Your Token Art gallery is ready — ${count} pieces. Run /token-art to view it.`, usage: next };
  }
  return { announce: null, usage: next };
}
```

In `main()`, replace the emission loop and usage write. The current block is:

```js
  if (emissions.length) {
    const driver = existsSync(join(ROOT, 'driver.md')) ? readFileSync(join(ROOT, 'driver.md'), 'utf8') : 'random';
    for (const e of emissions) addPending(STATE, stats, driver, { trigger: e.trigger, sessionId: sid });
  }
  usage.sessions[sid] = nextSession;
  writeFileSync(join(STATE, 'usage.json'), JSON.stringify(usage, null, 2));
  process.exit(0);
```

Replace it with:

```js
  if (emissions.length) {
    const driver = existsSync(join(ROOT, 'driver.md')) ? readFileSync(join(ROOT, 'driver.md'), 'utf8') : 'random';
    for (const e of emissions) {
      addPiece(STATE, stats, driver, { trigger: e.trigger, salt: Math.floor(rng() * 1e9), target: config.galleryTarget });
    }
  }
  usage.sessions[sid] = nextSession;
  const ready = checkGalleryReady(STATE, config, usage);
  const finalUsage = ready.usage;
  writeFileSync(join(STATE, 'usage.json'), JSON.stringify(finalUsage, null, 2));
  if (ready.announce) console.log(JSON.stringify({ systemMessage: ready.announce }));
  process.exit(0);
```

(`rng` is already defined earlier in `main()`. `config` is already loaded. Keep everything else unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test watch/hook.test.js`
Expected: PASS (existing hook tests + the new one).

- [ ] **Step 5: End-to-end smoke (auto-add + ready alert)**

Run:
```bash
rm -rf /tmp/ta-ready && export TOKEN_ART_HOME=/tmp/ta-ready && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art" && export TOKEN_ART_THRESHOLD=1000
printf '{"type":"assistant","message":{"role":"assistant","usage":{"input_tokens":120000,"output_tokens":0}}}\n' > /tmp/tr.jsonl
OUT=$(echo '{"hook_event_name":"Stop","session_id":"s1","transcript_path":"/tmp/tr.jsonl"}' | node "watch/hook.js")
echo "stdout: $OUT"
node -e "console.log('pieces:', JSON.parse(require('fs').readFileSync('/tmp/ta-ready/state/gallery.json','utf8')).pieces.length); console.log('announced:', JSON.parse(require('fs').readFileSync('/tmp/ta-ready/state/usage.json','utf8')).galleryAnnounced)"
unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT TOKEN_ART_THRESHOLD
```
Expected: stdout is a single JSON line `{"systemMessage":"🎨 Your Token Art gallery is ready — … pieces. Run /token-art to view it."}` (120k tokens at 1k threshold ⇒ capped at `maxPerSession` 10 pieces — so it will NOT reach 50 in one call; adjust expectation: with maxPerSession 10 the gallery has ≤11 pieces and announce is null). To actually trip the alert, run the hook across multiple sessions or lower the target: re-run with `TOKEN_ART_HOME` seeded. SIMPLER deterministic check: pre-seed 50 pieces and fire once:
```bash
rm -rf /tmp/ta-ready2 && mkdir -p /tmp/ta-ready2/state && export TOKEN_ART_HOME=/tmp/ta-ready2 && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art"
node -e "const fs=require('fs'); const pieces=Array.from({length:50},(_,i)=>({id:i+1})); fs.writeFileSync('/tmp/ta-ready2/state/gallery.json', JSON.stringify({pieces,target:50}))"
printf '{"type":"assistant","message":{"role":"assistant","usage":{"input_tokens":2000,"output_tokens":0}}}\n' > /tmp/tr2.jsonl
echo '{"hook_event_name":"SessionEnd","session_id":"s9","transcript_path":"/tmp/tr2.jsonl"}' | node "watch/hook.js"
unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT
```
Expected: prints `{"systemMessage":"🎨 Your Token Art gallery is ready — 51 pieces. Run /token-art to view it."}` (the SessionEnd emission adds one → 51 ≥ 50, first announce).

- [ ] **Step 6: Commit**

```bash
git add watch/hook.js watch/hook.test.js
git commit -m "feat: hook auto-adds pieces + one-time gallery-ready systemMessage"
```

---

### Task 4: Server — repoint `/api/simulate`, remove pending/select routes

**Files:**
- Modify: `server.js`

**Interfaces:**
- Consumes: `addPiece` (state), `loadConfig` (hook), `simulateSession`/`mulberry32` (existing).
- Produces: `POST /api/simulate` auto-adds one piece; `/api/pending` and `/api/select` removed.

This task has no unit test (server has none); verified by booting + curl.

- [ ] **Step 1: Edit imports in** `server.js`

Change the state import (currently `import { addPending, listPending, selectCandidate, loadGallery } from './engine/state.js';`) to:

```js
import { addPiece, loadGallery } from './engine/state.js';
import { loadConfig } from './watch/hook.js';
```

- [ ] **Step 2: Remove the `/api/pending` GET route**

Delete this line from the GET-routes block:

```js
    if (p === '/api/pending') return send(res, 200, listPending(STATE));
```

- [ ] **Step 3: Repoint `/api/simulate` and remove `/api/select`**

Replace these lines:

```js
      if (p === '/api/simulate') {
        const stats = simulateSession(mulberry32((Date.now() & 0xffffffff) >>> 0));
        return send(res, 200, addPending(STATE, stats, driverText()));
      }
      if (p === '/api/select') return send(res, 200, selectCandidate(STATE, body.pendingId, body.idx));
```

with:

```js
      if (p === '/api/simulate') {
        const stats = simulateSession(mulberry32((Date.now() & 0xffffffff) >>> 0));
        const target = loadConfig(ROOT).galleryTarget;
        const salt = (Date.now() & 0xffffffff) >>> 0;
        return send(res, 200, addPiece(STATE, stats, driverText(), { trigger: 'interval', salt, target }));
      }
```

- [ ] **Step 4: Verify the server boots and simulate auto-adds**

Run:
```bash
rm -rf /tmp/ta-srv && export TOKEN_ART_HOME=/tmp/ta-srv && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art"
pkill -f "node server.js" 2>/dev/null; (node server.js >/dev/null 2>&1 &) ; sleep 1
curl -s -XPOST localhost:4800/api/simulate | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);console.log('piece id:',p.id,'style:',p.style)})"
curl -s localhost:4800/api/gallery | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const g=JSON.parse(d);console.log('pieces:',g.pieces.length,'target:',g.target)})"
curl -s -o /dev/null -w "pending route gone (404 ok): %{http_code}\n" localhost:4800/api/pending
pkill -f "node server.js"; unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT
```
Expected: simulate returns a piece (id 1, a style); gallery shows `pieces: 1 target: 50`; `/api/pending` returns 404 (route removed → falls through to static 404).

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: /api/simulate auto-adds a piece; drop pending/select routes"
```

---

### Task 5: Gallery UI — remove picker/alert, add ready banner

**Files:**
- Modify: `gallery/index.html`
- Modify: `gallery/live.js`
- Modify: `gallery/app.js`
- Modify: `gallery/style.css`

**Interfaces:**
- Consumes: `/api/gallery`, `/api/usage`, `/api/simulate`, `/api/driver`, `/api/post`.
- Produces: no picker, no per-piece alert; a `#banner` that shows when `pieces.length >= target`; Simulate/Driver/Post/Sessions retained.

Verified by running the server + browser (no unit test).

- [ ] **Step 1: Edit** `gallery/index.html` — remove the alert + picker blocks and add a banner.

Delete these two blocks entirely:

```html
<div class="alert" id="alert">
  <div class="alert-dot"></div>
  <div><b>New painting ready</b><div class="alert-sub" id="alertSub">Tap to choose</div></div>
</div>
<div class="picker" id="picker">
  <div class="picker-inner">
    <h2>Choose the piece for this session</h2>
    <p class="pl" id="pickerPlaque"></p>
    <div class="candidates" id="candidates"></div>
  </div>
  <span class="lb-close" id="pickerClose">&times;</span>
</div>
```

Add a banner immediately after the `.titlewall` closing `</div>` (before `<div class="sessions" …>`):

```html
<div class="banner" id="banner">🎨 Your gallery is ready — <span id="bannerCount">0</span> pieces</div>
```

- [ ] **Step 2: Replace** `gallery/live.js` with the picker/alert-free version

```js
import { renderPiece } from '../engine/render.js';

const $ = (id) => document.getElementById(id);
let firstIncomingId = null;

async function api(path, opts) { const r = await fetch(path, opts); return r.json(); }
async function post(path, body) { return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }

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

async function refreshGallery() {
  const data = await api('/api/gallery');
  window.TokenArt.renderAll(data);
  if (firstIncomingId) {
    const el = [...document.querySelectorAll('.piece')].find((p, i) => data.pieces[i] && data.pieces[i].id === firstIncomingId);
    if (el) el.classList.add('incoming');
    firstIncomingId = null;
  }
}

async function poll() {
  await refreshGallery();
  refreshSessions();
}

$('simBtn').addEventListener('click', async () => { const piece = await post('/api/simulate'); firstIncomingId = piece && piece.id; await poll(); });
$('postBtn').addEventListener('click', async () => {
  $('postBtn').textContent = '⤴ Posting…';
  const r = await post('/api/post');
  $('postBtn').textContent = r.deploy && r.deploy.url ? '✓ Live' : '✓ Exported';
  if (r.deploy && r.deploy.url) window.open(r.deploy.url, '_blank');
  setTimeout(() => ($('postBtn').textContent = '⤴ Post'), 4000);
});
$('driverBtn').addEventListener('click', async () => {
  const { text } = await api('/api/driver'); $('driverText').value = text; $('driverDrawer').classList.toggle('open');
});
$('driverRandom').addEventListener('click', () => { $('driverText').value = 'random'; });
$('driverSave').addEventListener('click', async () => { await post('/api/driver', { text: $('driverText').value }); $('driverDrawer').classList.remove('open'); });

setInterval(poll, 1500);
poll();
```

- [ ] **Step 3: Update** `gallery/app.js` `renderAll` to drive the banner

Replace the `renderAll` function body with:

```js
function renderAll(data) {
  const m = document.getElementById('masonry');
  m.innerHTML = '';
  for (const p of data.pieces) m.appendChild(card(p));
  const target = data.target || 150;
  const c = document.getElementById('counter');
  if (c) c.textContent = `${data.pieces.length} / ${target} pieces`;
  const banner = document.getElementById('banner');
  if (banner) {
    const ready = data.pieces.length >= target;
    banner.classList.toggle('show', ready);
    const bc = document.getElementById('bannerCount');
    if (bc) bc.textContent = String(data.pieces.length);
  }
}
```

- [ ] **Step 4: Edit** `gallery/style.css` — remove now-dead picker/alert rules and add banner styles.

Delete the rule blocks for `.alert`, `.alert-dot`, `@keyframes pulse`, `.alert-sub`, `.picker`, `.picker.open`, `.picker-inner`, `.candidates`, `.cand`, `.cand canvas`, `.cand .lbl` (the alert + picker styling appended in the live-UI task).

Append the banner styles:

```css
.banner { display:none; margin:0 32px 18px; padding:14px 18px; border-radius:12px; text-align:center;
  background:linear-gradient(90deg, rgba(201,162,39,.18), rgba(201,162,39,.06));
  border:1px solid var(--gold); color:var(--ink); font-weight:700; font-size:15px; }
.banner.show { display:block; }
```

- [ ] **Step 5: Verify in a browser**

Run:
```bash
rm -rf /tmp/ta-ui2 && export TOKEN_ART_HOME=/tmp/ta-ui2 && export CLAUDE_PLUGIN_ROOT="/Users/shuken/AI/ai-demo-projects/Token Art"
node -e "const fs=require('fs');fs.mkdirSync('/tmp/ta-ui2/state',{recursive:true});const pieces=Array.from({length:6},(_,i)=>({id:i+1,seed:1000+i,style:'Bauhaus',palette:'Ember Terminal',format:{name:'Small',w:600,h:600},stats:{tokens:40000,prompts:10,codeBlocks:1,toolCalls:0,exclamations:0,questions:2,avgMsgLen:120},title:'Test '+i,plaque:'born from 40,000 tokens'}));fs.writeFileSync('/tmp/ta-ui2/state/gallery.json',JSON.stringify({pieces,target:50}))"
pkill -f "node server.js" 2>/dev/null; (node server.js >/dev/null 2>&1 &) ; sleep 1
echo "open http://localhost:4800 — expect 6/50 counter, NO banner, NO picker/alert; click Simulate adds a piece"
```
Controller opens http://localhost:4800: confirm the counter reads `6 / 50`, no "new painting ready" alert or picker exists, clicking **Simulate session** adds a 7th piece live. Then test the banner: stop server, rewrite the gallery with 50 pieces, restart, confirm the gold "Your gallery is ready — 50 pieces" banner shows. Stop server: `pkill -f "node server.js"; unset TOKEN_ART_HOME CLAUDE_PLUGIN_ROOT`.

- [ ] **Step 6: Commit**

```bash
git add gallery/index.html gallery/live.js gallery/app.js gallery/style.css
git commit -m "feat: drop picker/alert; add gallery-ready banner; counter to target"
```

---

### Task 6: Retire pending path, update command + docs, full sweep

**Files:**
- Modify: `engine/state.js` (remove pending functions)
- Modify: `engine/state.test.js` (remove pending tests)
- Modify: `commands/token-art.md`
- Modify: `README.md`
- Test: whole suite

**Interfaces:** none new — cleanup + docs.

- [ ] **Step 1: Remove the pending path from** `engine/state.js`

Delete these (now-unused) definitions: `pendingPath`, `loadPending`, `savePending`, `listPending`, `addPending`, `selectCandidate`. Also drop `makeCandidates` from the traits import (no longer used) — the import becomes:

```js
import { parseDriver, deriveTraits } from './traits.js';
```

Keep `loadGallery`, `saveGallery`, `addPiece`, and the `makeTitle`/`makePlaque` import.

- [ ] **Step 2: Remove the pending tests from** `engine/state.test.js`

Delete the tests that reference `addPending`/`selectCandidate`/`listPending` (the "addPending creates 5 candidates", "selectCandidate moves one piece…", "addPending stores trigger/sessionId meta…", and "addPending without meta…" tests). Keep the `saveGallery/loadGallery round-trips` test and the two `addPiece` tests. Remove any now-unused imports of `addPending`/`selectCandidate`/`listPending` at the top of the test file.

- [ ] **Step 3: Run the focused state test**

Run: `node --test engine/state.test.js`
Expected: PASS (gallery round-trip + 2 addPiece tests), no references to removed functions.

- [ ] **Step 4: Update** `commands/token-art.md` — remove the auto-seed step.

Replace the numbered steps with (keep the frontmatter and intro):

```markdown
Do the following with the Bash tool. State lives in a shared data directory at
`$HOME/.token-art` so the gallery shows the same pieces the Stop hook generates.

1. **Start the gallery server in the background** (skip if it is already running on
   port 4800):

   ```bash
   TOKEN_ART_HOME="$HOME/.token-art" node "$CLAUDE_PLUGIN_ROOT/server.js" &
   ```

2. **Tell the user it is live at http://localhost:4800.** The gallery starts empty
   and fills as they use Claude — every cadence emission auto-adds a random piece
   (no picking). When the gallery reaches its target (default 50), the plugin prints
   a "gallery is ready" message in the terminal. They can also click **Simulate
   session** to add pieces on demand, edit the **Driver** to steer style, and **Post**
   to publish.

Notes:
- Art is generated automatically by this plugin's hook as the user works.
- To stop the server later: `pkill -f "$CLAUDE_PLUGIN_ROOT/server.js"`.
- Change the gallery size / cadence in `config.json` (`galleryTarget`, `thresholdTokens`, …).
```

- [ ] **Step 5: Update** `README.md` — adjust the demo-flow + cadence sections.

In the cadence table, add a row after `maxPerSession`:

```markdown
| `galleryTarget` | `50` | gallery is "ready" (terminal alert) at this many pieces |
```

Replace the "Each piece records its trigger…" closing paragraph of the Cadence section with:

```markdown
Each cadence emission **auto-adds one random piece** (no picker). When the personal
gallery first reaches `galleryTarget` pieces, the hook prints a one-time terminal
message: *"🎨 Your Token Art gallery is ready — N pieces. Run /token-art to view it."*
Each piece records its **trigger** (`interval` / `burst` / `session-start` / `session-end`),
and the gallery shows a per-session strip plus a "ready" banner at the target.
```

- [ ] **Step 6: Run the full suite**

Run: `node --test`
Expected: all pass (rng, palettes, traits, titles, render-smoke, simulate, state, publish, hook, cadence). No references to removed functions.

- [ ] **Step 7: Commit**

```bash
git add engine/state.js engine/state.test.js commands/token-art.md README.md
git commit -m "refactor: retire pending/picker path; docs for auto-add + ready alert"
```

---

## Self-Review

**Spec coverage:**
- Auto-add one random piece per emission → Tasks 2 (`addPiece`), 3 (hook calls it). ✓
- Remove candidate selection / pending / picker → Tasks 3 (hook), 4 (server routes), 5 (UI), 6 (state cleanup). ✓
- `galleryTarget` config default 50 → Task 1. ✓
- One-time terminal `systemMessage` at target via stdout JSON, exit 0 → Task 3 (`checkGalleryReady` + `console.log`). ✓
- `galleryAnnounced` once-ever flag at top level of usage.json → Task 3. ✓
- Personal gallery starts empty (no auto-seed) → Task 6 (`commands/token-art.md`). ✓
- Gallery-ready banner + counter to target → Task 5. ✓
- `/api/simulate` auto-adds; pending/select routes gone → Task 4. ✓
- Tests: addPiece, galleryTarget default, ready-alert once-only → Tasks 1-3. Full sweep → Task 6. ✓
- Deployed showcase unchanged (`build-collection.js` untouched) → not modified by any task. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The Task 3 Step 5 smoke includes a corrected, deterministic pre-seed-50 variant. ✓

**Type consistency:** `addPiece(dir, stats, driverText, meta={salt,trigger,target})` consistent across Tasks 2, 3, 4. `checkGalleryReady(dir, config, usage) => {announce, usage}` consistent in Task 3 impl + test. `gallery.target` set by `addPiece` and read by `renderAll` (Task 5). `config.galleryTarget` from `loadConfig` used by hook (Task 3) and server (Task 4). Removed symbols (`addPending`/`selectCandidate`/`listPending`) have no remaining references after Tasks 3-5, removed in Task 6. ✓
