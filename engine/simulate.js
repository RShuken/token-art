import { mulberry32, rnd } from './rng.js';
import { deriveTraits, parseDriver } from './traits.js';
import { makeTitle, makePlaque } from './titles.js';

// Session archetypes — each produces stats that classify as a distinct
// session character (see makePlaque/sessionCharacter), so a collection shows
// real variety instead of every piece reading "code-heavy session".
const ARCHETYPES = ['code', 'prose', 'energetic', 'inquisitive', 'steady'];

export function simulateSession(rng) {
  const kind = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const prompts = Math.floor(rnd(rng, 4, 80));
  const tokens = Math.floor(rnd(rng, 4000, 240000));
  // baseline keeps all higher-priority signals low so the archetype's own
  // signal is what gets classified
  let codeBlocks = Math.floor(rnd(rng, 0, 3));
  let toolCalls = Math.floor(rnd(rng, 0, 2));
  let avgMsgLen = Math.floor(rnd(rng, 60, 240));
  let exclamations = Math.floor(rnd(rng, 0, 2));
  let questions = Math.floor(rnd(rng, 0, Math.max(1, Math.floor(prompts * 0.5))));

  if (kind === 'code') {
    codeBlocks = Math.floor(rnd(rng, 3, 14));
    toolCalls = Math.floor(rnd(rng, 4, 20));
  } else if (kind === 'prose') {
    avgMsgLen = Math.floor(rnd(rng, 300, 520));
  } else if (kind === 'energetic') {
    exclamations = Math.floor(rnd(rng, 3, 9));
  } else if (kind === 'inquisitive') {
    questions = Math.floor(rnd(rng, Math.ceil(prompts * 0.6), prompts + 1));
  }
  // 'steady' keeps the low baseline
  return { tokens, prompts, codeBlocks, toolCalls, exclamations, questions, avgMsgLen };
}

export function buildCollection({ count = 140, driverText = 'random', seed = 1 }) {
  const driver = parseDriver(driverText);
  const master = mulberry32(seed);
  const pieces = [];
  for (let i = 1; i <= count; i++) {
    const stats = simulateSession(master);
    const salt = Math.floor(master() * 1e9);
    const t = deriveTraits(stats, driver, salt);
    const rec = { id: i, ...t };
    rec.title = makeTitle(rec, i);
    rec.plaque = makePlaque(rec);
    pieces.push(rec);
  }
  return { pieces, generatedAt: null };
}
