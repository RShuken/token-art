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
