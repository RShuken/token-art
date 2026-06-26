import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGallery, saveGallery, addPiece } from './state.js';

function freshDir() {
  const d = mkdtempSync(join(tmpdir(), 'tokenart-'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'gallery.json'), JSON.stringify({ pieces: [{ id: 1 }], target: 150 }));
  return d;
}
const stats = { tokens: 40000, prompts: 30, codeBlocks: 2, toolCalls: 1, exclamations: 1, questions: 5, avgMsgLen: 220 };

test('saveGallery/loadGallery round-trips', () => {
  const d = freshDir();
  saveGallery(d, { pieces: [{ id: 9 }], target: 150 });
  assert.equal(loadGallery(d).pieces[0].id, 9);
});

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
  assert.equal(loadGallery(d).pieces.length, 3);
});
