import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDriver, deriveTraits } from './traits.js';
import { makeTitle, makePlaque } from './titles.js';

const galleryPath = (dir) => join(dir, 'gallery.json');

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
