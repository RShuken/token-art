import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTranscript, loadUsage, loadConfig } from './hook.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

import { checkGalleryReady } from './hook.js';

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
