import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateSession, buildCollection } from './simulate.js';
import { mulberry32 } from './rng.js';
import { STYLE_NAMES } from './catalog.js';
import { PALETTE_NAMES } from './palettes.js';

test('simulateSession produces a full stats object', () => {
  const s = simulateSession(mulberry32(1));
  for (const k of ['tokens', 'prompts', 'codeBlocks', 'toolCalls', 'exclamations', 'questions', 'avgMsgLen'])
    assert.equal(typeof s[k], 'number', `missing ${k}`);
  assert.ok(s.tokens > 0 && s.prompts > 0);
});

test('buildCollection yields requested count of valid records', () => {
  const { pieces } = buildCollection({ count: 140, driverText: 'random', seed: 99 });
  assert.equal(pieces.length, 140);
  for (const p of pieces) {
    assert.ok(STYLE_NAMES.includes(p.style));
    assert.ok(PALETTE_NAMES.includes(p.palette));
    assert.ok(typeof p.title === 'string' && p.title.length);
    assert.ok(typeof p.plaque === 'string' && p.plaque.length);
    assert.ok(Number.isInteger(p.id));
  }
  assert.equal(new Set(pieces.map(p => p.id)).size, 140, 'ids unique');
});

test('buildCollection is deterministic for same seed', () => {
  const a = buildCollection({ count: 10, driverText: 'random', seed: 5 });
  const b = buildCollection({ count: 10, driverText: 'random', seed: 5 });
  assert.deepEqual(a.pieces, b.pieces);
});
