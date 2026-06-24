import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDriver, deriveTraits, makeCandidates } from './traits.js';
import { STYLE_NAMES } from './catalog.js';
import { PALETTE_NAMES, PALETTES } from './palettes.js';

const RANDOM = { mode: 'random', styles: [], palettes: [], moods: [], size: 'random' };
const baseStats = { tokens: 40000, prompts: 30, codeBlocks: 2, toolCalls: 1, exclamations: 1, questions: 5, avgMsgLen: 220 };

test('parseDriver detects random', () => {
  assert.equal(parseDriver('random').mode, 'random');
  assert.equal(parseDriver('# anything\n\nrandom\n').mode, 'random');
});

test('parseDriver reads directives', () => {
  const d = parseDriver('styles: Bauhaus, Mondrian\npalettes: Neon Synth\nmood: warm\nsize: large');
  assert.equal(d.mode, 'directed');
  assert.deepEqual(d.styles, ['Bauhaus', 'Mondrian']);
  assert.deepEqual(d.palettes, ['Neon Synth']);
  assert.deepEqual(d.moods, ['warm']);
  assert.equal(d.size, 'large');
});

test('deriveTraits is deterministic for same stats+salt', () => {
  const a = deriveTraits(baseStats, RANDOM, 3);
  const b = deriveTraits(baseStats, RANDOM, 3);
  assert.deepEqual(a, b);
});

test('deriveTraits returns valid catalog members', () => {
  const t = deriveTraits(baseStats, RANDOM, 1);
  assert.ok(STYLE_NAMES.includes(t.style));
  assert.ok(PALETTE_NAMES.includes(t.palette));
  assert.ok(Number.isInteger(t.seed));
});

test('directed driver constrains style + palette', () => {
  const d = { mode: 'directed', styles: ['Bauhaus'], palettes: ['Neon Synth'], moods: [], size: 'random' };
  for (let salt = 0; salt < 8; salt++) {
    const t = deriveTraits(baseStats, d, salt);
    assert.equal(t.style, 'Bauhaus');
    assert.equal(t.palette, 'Neon Synth');
  }
});

test('mood directive filters palettes by mood', () => {
  const d = { mode: 'directed', styles: [], palettes: [], moods: ['warm'], size: 'random' };
  for (let salt = 0; salt < 10; salt++) {
    const t = deriveTraits(baseStats, d, salt);
    assert.equal(PALETTES[t.palette].mood, 'warm');
  }
});

test('big token bursts bias toward large-format', () => {
  const huge = { ...baseStats, tokens: 200000 };
  let large = 0;
  for (let salt = 0; salt < 40; salt++) if (deriveTraits(huge, RANDOM, salt).format.name === 'Large-format') large++;
  assert.ok(large > 8, `expected some large-format, got ${large}`);
});

test('makeCandidates returns n distinct seeds', () => {
  const cands = makeCandidates(baseStats, RANDOM, 5);
  assert.equal(cands.length, 5);
  assert.equal(new Set(cands.map(c => c.seed)).size, 5);
});
