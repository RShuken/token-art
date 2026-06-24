import { mulberry32, rnd } from './rng.js';
import { deriveTraits, parseDriver } from './traits.js';
import { makeTitle, makePlaque } from './titles.js';

export function simulateSession(rng) {
  const prompts = Math.floor(rnd(rng, 4, 80));
  const avgMsgLen = Math.floor(rnd(rng, 60, 420));
  return {
    tokens: Math.floor(rnd(rng, 4000, 240000)),
    prompts,
    codeBlocks: Math.floor(rnd(rng, 0, 14)),
    toolCalls: Math.floor(rnd(rng, 0, 20)),
    exclamations: Math.floor(rnd(rng, 0, 8)),
    questions: Math.floor(rnd(rng, 0, prompts)),
    avgMsgLen
  };
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
