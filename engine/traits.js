import { STYLE_NAMES, FORMATS } from './catalog.js';
import { PALETTES, PALETTE_NAMES } from './palettes.js';
import { mulberry32, hashToSeed, pick, intseed } from './rng.js';

export const STATS_KEYS = ['tokens', 'prompts', 'codeBlocks', 'toolCalls', 'exclamations', 'questions', 'avgMsgLen'];

const GEOMETRIC = ['Bauhaus', 'Mondrian', 'Truchet', 'Grid Pulse'];
const ORGANIC = ['Flow Field', 'Watercolor', 'Rivers', 'Sediment'];

export function parseDriver(text) {
  const out = { mode: 'directed', styles: [], palettes: [], moods: [], size: 'random' };
  const body = String(text || '').toLowerCase();
  // strip markdown comment/heading lines but keep their content for keyword scan
  const lines = String(text || '').split('\n');
  let sawDirective = false;
  const list = (v) => v.split(',').map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^\s*(styles?|palettes?|mood s?|moods?|size)\s*:\s*(.+)$/i);
    if (!m) continue;
    sawDirective = true;
    const key = m[1].toLowerCase().replace(/s$/, '').replace(/\s/g, '');
    const val = m[2].trim();
    if (key === 'style') out.styles = list(val);
    else if (key === 'palette') out.palettes = list(val);
    else if (key === 'mood') out.moods = list(val).map(s => s.toLowerCase());
    else if (key === 'size') out.size = /large/.test(val) ? 'large' : /small/.test(val) ? 'small' : 'random';
  }
  if (!sawDirective || /\brandom\b/.test(body) && !sawDirective) out.mode = 'random';
  if (!sawDirective) out.mode = 'random';
  return out;
}

function chooseStyle(rng, stats, driver) {
  if (driver.styles.length) {
    const valid = driver.styles.filter(s => STYLE_NAMES.includes(s));
    if (valid.length) return pick(rng, valid);
  }
  // bias: code/tool heavy → geometric; long prose → organic; else any
  const codey = stats.codeBlocks + stats.toolCalls;
  let pool = STYLE_NAMES;
  if (codey >= 3 && rng() < 0.7) pool = GEOMETRIC;
  else if (stats.avgMsgLen > 280 && rng() < 0.6) pool = ORGANIC;
  return pick(rng, pool);
}

function choosePalette(rng, stats, driver) {
  let pool = PALETTE_NAMES.slice();
  if (driver.palettes.length) {
    const valid = driver.palettes.filter(p => PALETTE_NAMES.includes(p));
    if (valid.length) return pick(rng, valid);
  }
  if (driver.moods.length) {
    const byMood = pool.filter(p => driver.moods.includes(PALETTES[p].mood));
    if (byMood.length) pool = byMood;
  } else if (stats.exclamations >= 3 && rng() < 0.6) {
    const warm = pool.filter(p => PALETTES[p].mood === 'warm');
    if (warm.length) pool = warm;
  }
  return pick(rng, pool);
}

function chooseFormat(rng, stats, driver) {
  if (driver.size === 'large') return FORMATS.find(f => f.name === 'Large-format');
  if (driver.size === 'small') return FORMATS.find(f => f.name === 'Small');
  // weight large-format up when token burst is big
  const weights = FORMATS.map(f => f.name === 'Large-format' ? 1 + Math.min(stats.tokens / 60000, 4) : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < FORMATS.length; i++) { r -= weights[i]; if (r <= 0) return FORMATS[i]; }
  return FORMATS[0];
}

export function deriveTraits(stats, driver, salt = 0) {
  const base = hashToSeed(JSON.stringify(stats) + '|' + salt);
  const rng = mulberry32(base);
  const style = chooseStyle(rng, stats, driver);
  const palette = choosePalette(rng, stats, driver);
  const format = chooseFormat(rng, stats, driver);
  const seed = intseed(rng);
  return { seed, style, palette, format, stats };
}

export function makeCandidates(stats, driver, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(deriveTraits(stats, driver, i + 1));
  return out;
}
