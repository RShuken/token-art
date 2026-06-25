import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTranscript } from './hook.js';

const lines = [
  { type: 'user', message: { role: 'user', content: 'Help me build a parser! How?' } },
  { type: 'assistant', message: { role: 'assistant', content: 'Sure. ```js\ncode\n```',
      usage: { input_tokens: 1200, output_tokens: 800 } } },
  { type: 'assistant', message: { role: 'assistant', content: 'Done.',
      usage: { input_tokens: 400, output_tokens: 150 } } }
];

test('analyzeTranscript sums tokens across usage entries', () => {
  const s = analyzeTranscript(lines);
  assert.equal(s.tokens, 1200 + 800 + 400 + 150);
});

test('analyzeTranscript counts prompts, code blocks, questions, exclamations', () => {
  const s = analyzeTranscript(lines);
  assert.equal(s.prompts, 1);          // one user message
  assert.ok(s.codeBlocks >= 1);        // one fenced block
  assert.ok(s.questions >= 1);         // "How?"
  assert.ok(s.exclamations >= 1);      // "parser!"
  assert.ok(s.avgMsgLen > 0);
});
