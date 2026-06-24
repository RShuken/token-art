import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES } from './styles.js';
import { STYLE_NAMES } from './catalog.js';

test('every catalog style has a renderer', () => {
  for (const name of STYLE_NAMES) {
    assert.equal(typeof STYLES[name], 'function', `missing renderer: ${name}`);
  }
});

test('no extra renderers beyond catalog', () => {
  for (const key of Object.keys(STYLES)) {
    assert.ok(STYLE_NAMES.includes(key), `orphan renderer: ${key}`);
  }
});
