import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGallery, saveGallery, addPending, listPending, selectCandidate } from './state.js';

function freshDir() {
  const d = mkdtempSync(join(tmpdir(), 'tokenart-'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'gallery.json'), JSON.stringify({ pieces: [{ id: 1 }], target: 150 }));
  return d;
}
const stats = { tokens: 40000, prompts: 30, codeBlocks: 2, toolCalls: 1, exclamations: 1, questions: 5, avgMsgLen: 220 };

test('addPending creates 5 candidates', () => {
  const d = freshDir();
  const entry = addPending(d, stats, 'random');
  assert.equal(entry.candidates.length, 5);
  assert.equal(listPending(d).length, 1);
});

test('selectCandidate moves one piece into gallery and clears pending', () => {
  const d = freshDir();
  const entry = addPending(d, stats, 'random');
  const piece = selectCandidate(d, entry.pendingId, 2);
  assert.ok(piece.id > 1, 'new id assigned');
  assert.ok(piece.title && piece.plaque);
  assert.equal(loadGallery(d).pieces.length, 2);
  assert.equal(listPending(d).length, 0);
});

test('saveGallery/loadGallery round-trips', () => {
  const d = freshDir();
  saveGallery(d, { pieces: [{ id: 9 }], target: 150 });
  assert.equal(loadGallery(d).pieces[0].id, 9);
});

test('addPending stores trigger/sessionId meta; selectCandidate carries trigger', () => {
  const d = freshDir();
  const entry = addPending(d, stats, 'random', { trigger: 'session-end', sessionId: 'sess-123' });
  assert.equal(entry.trigger, 'session-end');
  assert.equal(entry.sessionId, 'sess-123');
  const piece = selectCandidate(d, entry.pendingId, 0);
  assert.equal(piece.trigger, 'session-end');
});

test('addPending without meta still works and omits trigger', () => {
  const d = freshDir();
  const entry = addPending(d, stats, 'random');
  assert.equal(entry.trigger, undefined);
  const piece = selectCandidate(d, entry.pendingId, 0);
  assert.equal(piece.trigger, undefined);
});
