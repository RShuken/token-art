import { mulberry32, pick } from './rng.js';

const ADJ = ['Quiet', 'Restless', 'Ember', 'Folded', 'Latent', 'Tidal', 'Cardinal',
  'Hollow', 'Bright', 'Slow', 'Electric', 'Patient', 'Fractured', 'Soft', 'Iron'];
const NOUN = ['Threshold', 'Cadence', 'Drift', 'Lattice', 'Interval', 'Field', 'Signal',
  'Current', 'Remainder', 'Chorus', 'Margin', 'Vesper', 'Token', 'Echo', 'Meridian'];

export function makeTitle(record, index) {
  const rng = mulberry32((record.seed ^ (index * 2654435761)) >>> 0);
  if (rng() < 0.18) return `Untitled #${index}`;
  return `${pick(rng, ADJ)} ${pick(rng, NOUN)}`;
}

function sessionCharacter(s) {
  if (s.codeBlocks + s.toolCalls >= 5) return 'code-heavy session';
  if (s.avgMsgLen > 280) return 'long-form session';
  if (s.exclamations >= 3) return 'high-energy session';
  if (s.questions >= s.prompts * 0.6) return 'inquisitive session';
  return 'steady session';
}

export function makePlaque(record) {
  const s = record.stats;
  const tokens = s.tokens.toLocaleString('en-US');
  return `born from ${tokens} tokens · ${s.prompts} prompts · ${sessionCharacter(s)} · palette: ${record.palette}`;
}
