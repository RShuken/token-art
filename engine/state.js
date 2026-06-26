import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeCandidates, parseDriver, deriveTraits } from './traits.js';
import { makeTitle, makePlaque } from './titles.js';

const galleryPath = (dir) => join(dir, 'gallery.json');
const pendingPath = (dir) => join(dir, 'pending.json');

export function loadGallery(dir) {
  if (!existsSync(galleryPath(dir))) return { pieces: [], target: 150 };
  return JSON.parse(readFileSync(galleryPath(dir), 'utf8'));
}
export function saveGallery(dir, gallery) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(galleryPath(dir), JSON.stringify(gallery, null, 2));
}
export function addPiece(dir, stats, driverText, meta = {}) {
  const driver = parseDriver(driverText || 'random');
  const t = deriveTraits(stats, driver, meta.salt ?? 1);
  const gallery = loadGallery(dir);
  if (meta.target) gallery.target = meta.target;
  const id = gallery.pieces.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;
  const piece = { id, ...t };
  if (meta.trigger) piece.trigger = meta.trigger;
  piece.title = makeTitle(piece, id);
  piece.plaque = makePlaque(piece);
  gallery.pieces.push(piece);
  saveGallery(dir, gallery);
  return piece;
}
function loadPending(dir) {
  if (!existsSync(pendingPath(dir))) return [];
  return JSON.parse(readFileSync(pendingPath(dir), 'utf8'));
}
function savePending(dir, list) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(pendingPath(dir), JSON.stringify(list, null, 2));
}
export function listPending(dir) { return loadPending(dir); }

export function addPending(dir, stats, driverText, meta = {}) {
  const driver = parseDriver(driverText || 'random');
  const candidates = makeCandidates(stats, driver, 5);
  const list = loadPending(dir);
  const pendingId = `p${stats.tokens}_${list.length}_${Math.floor(stats.prompts)}`;
  const entry = { pendingId, candidates };
  if (meta && meta.trigger) entry.trigger = meta.trigger;
  if (meta && meta.sessionId) entry.sessionId = meta.sessionId;
  list.push(entry); savePending(dir, list);
  return entry;
}

export function selectCandidate(dir, pendingId, idx) {
  const list = loadPending(dir);
  const entry = list.find(e => e.pendingId === pendingId);
  if (!entry) throw new Error('pending not found: ' + pendingId);
  const chosen = entry.candidates[idx];
  if (!chosen) throw new Error('candidate index out of range');
  const gallery = loadGallery(dir);
  const id = (gallery.pieces.reduce((m, p) => Math.max(m, p.id || 0), 0)) + 1;
  const piece = { id, ...chosen };
  if (entry.trigger) piece.trigger = entry.trigger;
  piece.title = makeTitle(piece, id);
  piece.plaque = makePlaque(piece);
  gallery.pieces.push(piece); saveGallery(dir, gallery);
  savePending(dir, list.filter(e => e.pendingId !== pendingId));
  return piece;
}
