import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashToSeed, rnd, pick, intseed } from './rng.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 outputs are in [0,1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('different seeds diverge', () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('hashToSeed is stable and unsigned', () => {
  assert.equal(hashToSeed('ember'), hashToSeed('ember'));
  assert.ok(hashToSeed('ember') >= 0);
  assert.notEqual(hashToSeed('a'), hashToSeed('b'));
});

test('pick is deterministic', () => {
  const arr = ['x', 'y', 'z'];
  assert.equal(pick(mulberry32(5), arr), pick(mulberry32(5), arr));
});

test('rnd respects bounds', () => {
  const r = mulberry32(9);
  for (let i = 0; i < 50; i++) { const v = rnd(r, 10, 20); assert.ok(v >= 10 && v < 20); }
});
