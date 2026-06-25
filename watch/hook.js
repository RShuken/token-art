import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPending } from '../engine/state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'state');
const THRESHOLD = Number(process.env.TOKEN_ART_THRESHOLD || 15000);

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(b => (b && b.text) || '').join(' ');
  return '';
}

export function analyzeTranscript(lines) {
  let tokens = 0, prompts = 0, codeBlocks = 0, toolCalls = 0, exclamations = 0, questions = 0, lenSum = 0, msgs = 0;
  for (const ln of lines) {
    const m = ln && ln.message;
    if (!m) continue;
    const u = m.usage;
    if (u) tokens += (u.input_tokens || 0) + (u.output_tokens || 0);
    const t = textOf(m.content);
    if (m.role === 'user') { prompts++; questions += (t.match(/\?/g) || []).length; exclamations += (t.match(/!/g) || []).length; }
    codeBlocks += (t.match(/```/g) || []).length / 2 | 0;
    if (Array.isArray(m.content)) toolCalls += m.content.filter(b => b && b.type === 'tool_use').length;
    lenSum += t.length; msgs++;
  }
  return { tokens, prompts, codeBlocks, toolCalls, exclamations, questions, avgMsgLen: msgs ? Math.round(lenSum / msgs) : 0 };
}

function readTranscript(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

async function main() {
  let raw = ''; for await (const c of process.stdin) raw += c;
  let hook = {}; try { hook = JSON.parse(raw); } catch {}
  const stats = analyzeTranscript(readTranscript(hook.transcript_path));
  mkdirSync(STATE, { recursive: true });
  const usagePath = join(STATE, 'usage.json');
  const prev = existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, 'utf8')) : { emitted: 0 };
  const milestones = Math.floor(stats.tokens / THRESHOLD);
  if (milestones > prev.emitted) {
    const driver = existsSync(join(ROOT, 'driver.md')) ? readFileSync(join(ROOT, 'driver.md'), 'utf8') : 'random';
    addPending(STATE, stats, driver);
  }
  writeFileSync(usagePath, JSON.stringify({ emitted: Math.max(milestones, prev.emitted), lastTokens: stats.tokens }));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
