import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTitle, makePlaque } from './titles.js';

const rec = {
  id: 47, seed: 123456, style: 'Bauhaus', palette: 'Ember Terminal',
  format: { name: 'Large-format', w: 820, h: 820 },
  stats: { tokens: 48210, prompts: 31, codeBlocks: 9, toolCalls: 4, exclamations: 0, questions: 6, avgMsgLen: 180 }
};

test('makeTitle is deterministic and non-empty', () => {
  assert.equal(makeTitle(rec, 47), makeTitle(rec, 47));
  assert.ok(makeTitle(rec, 47).length > 0);
});

test('makePlaque mentions tokens and prompts', () => {
  const p = makePlaque(rec);
  assert.match(p, /48,210 tokens/);
  assert.match(p, /31 prompts/);
  assert.match(p, /Ember Terminal/);
});

test('plaque labels a code-heavy session', () => {
  assert.match(makePlaque(rec), /code-heavy/);
});
