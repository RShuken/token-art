import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportSite } from './publish.js';

function fakeProject() {
  const root = mkdtempSync(join(tmpdir(), 'ta-proj-'));
  mkdirSync(join(root, 'gallery')); mkdirSync(join(root, 'engine')); mkdirSync(join(root, 'state'));
  writeFileSync(join(root, 'gallery', 'index.html'), '<!doctype html>');
  writeFileSync(join(root, 'gallery', 'app.js'), "import { renderPiece } from '../engine/render.js';\n// app");
  writeFileSync(join(root, 'gallery', 'live.js'), "import { renderPiece } from '../engine/render.js';\n// live");
  writeFileSync(join(root, 'engine', 'render.js'), '// render');
  writeFileSync(join(root, 'state', 'gallery.json'), JSON.stringify({ pieces: [{ id: 1 }], target: 150 }));
  return root;
}

test('exportSite produces a standalone dist with gallery.json', () => {
  const root = fakeProject();
  const dist = exportSite(root);
  assert.ok(existsSync(join(dist, 'index.html')));
  assert.ok(existsSync(join(dist, 'engine', 'render.js')));
  assert.ok(existsSync(join(dist, 'gallery.json')));

  // Verify engine import path rewrite in dist/app.js and dist/live.js
  const appJs = readFileSync(join(dist, 'app.js'), 'utf8');
  assert.ok(appJs.includes('./engine/render.js'), 'dist/app.js should use ./engine/ path');
  assert.ok(!appJs.includes('../engine/render.js'), 'dist/app.js should NOT contain ../engine/ path');

  const liveJs = readFileSync(join(dist, 'live.js'), 'utf8');
  assert.ok(liveJs.includes('./engine/render.js'), 'dist/live.js should use ./engine/ path');
  assert.ok(!liveJs.includes('../engine/render.js'), 'dist/live.js should NOT contain ../engine/ path');
});
