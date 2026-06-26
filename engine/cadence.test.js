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
