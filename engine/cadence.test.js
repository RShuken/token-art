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

import { decideEmissions } from './cadence.js';

const NOW = '2026-01-01T00:00:00Z';
// rng stubs: deterministic generators
const always = (v) => () => v;            // constant rng

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
  // threshold advanced past 46000 so it didn't re-emit forever
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
