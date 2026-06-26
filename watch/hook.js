import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPiece, loadGallery } from '../engine/state.js';
import { APP_ROOT, STATE_DIR } from '../engine/paths.js';
import { mergeConfig, decideEmissions } from '../engine/cadence.js';
import { mulberry32, hashToSeed } from '../engine/rng.js';

const ROOT = APP_ROOT;
const STATE = STATE_DIR;

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

export function loadConfig(appRoot) {
  let raw = null;
  const p = join(appRoot, 'config.json');
  if (existsSync(p)) { try { raw = JSON.parse(readFileSync(p, 'utf8')); } catch { raw = null; } }
  const config = mergeConfig(raw);
  const envT = process.env.TOKEN_ART_THRESHOLD;
  if (envT && Number(envT) > 0) config.thresholdTokens = Number(envT);
  return config;
}

export function loadUsage(dir) {
  const p = join(dir, 'usage.json');
  if (!existsSync(p)) return { sessions: {} };
  try {
    const u = JSON.parse(readFileSync(p, 'utf8'));
    if (u && typeof u === 'object' && u.sessions && typeof u.sessions === 'object') return u;
  } catch {}
  return { sessions: {} };
}

export function checkGalleryReady(dir, config, usage) {
  const next = { ...usage };
  const count = loadGallery(dir).pieces.length;
  if (count >= config.galleryTarget && !usage.galleryAnnounced) {
    next.galleryAnnounced = true;
    return { announce: `🎨 Your Token Art gallery is ready — ${count} pieces. Run /token-art to view it.`, usage: next };
  }
  return { announce: null, usage: next };
}

async function main() {
  let raw = ''; for await (const c of process.stdin) raw += c;
  let hook = {}; try { hook = JSON.parse(raw); } catch {}
  const event = hook.hook_event_name || 'Stop';
  const sid = hook.session_id || 'default';
  const stats = analyzeTranscript(readTranscript(hook.transcript_path));
  stats.now = new Date().toISOString();

  const config = loadConfig(ROOT);
  mkdirSync(STATE, { recursive: true });
  const usage = loadUsage(STATE);
  const rng = mulberry32(hashToSeed(sid + ':' + stats.tokens + ':' + event));
  const { emissions, nextSession } = decideEmissions(usage.sessions[sid], stats, event, config, rng);

  if (emissions.length) {
    const driver = existsSync(join(ROOT, 'driver.md')) ? readFileSync(join(ROOT, 'driver.md'), 'utf8') : 'random';
    for (const e of emissions) {
      addPiece(STATE, stats, driver, { trigger: e.trigger, salt: Math.floor(rng() * 1e9), target: config.galleryTarget });
    }
  }
  usage.sessions[sid] = nextSession;
  const ready = checkGalleryReady(STATE, config, usage);
  const finalUsage = ready.usage;
  writeFileSync(join(STATE, 'usage.json'), JSON.stringify(finalUsage, null, 2));
  if (ready.announce) console.log(JSON.stringify({ systemMessage: ready.announce }));
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => process.exit(0));
}
