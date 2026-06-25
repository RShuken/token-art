import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PALETTE_NAMES } from './palettes.js';
import { STYLE_NAMES, FORMATS } from './catalog.js';

test('PALETTE_NAMES matches PALETTES keys', () => {
  assert.deepEqual(PALETTE_NAMES, Object.keys(PALETTES));
});

test('every palette has >=4 colors and a valid mood', () => {
  for (const name of PALETTE_NAMES) {
    const p = PALETTES[name];
    assert.ok(p.colors.length >= 4, `${name} needs >=4 colors`);
    assert.ok(['warm', 'cool', 'neutral'].includes(p.mood), `${name} mood`);
    for (const c of p.colors) assert.match(c, /^#[0-9a-fA-F]{6}$/, `${name} color ${c}`);
  }
});

test('catalog has styles and formats', () => {
  assert.ok(STYLE_NAMES.length >= 12);
  assert.equal(new Set(STYLE_NAMES).size, STYLE_NAMES.length, 'style names unique');
  assert.ok(FORMATS.length === 4);
});
