import { renderPiece } from '../engine/render.js';

const $ = (id) => document.getElementById(id);
let firstIncomingId = null;

async function refreshSessions() {
  try {
    const u = await api('/api/usage');
    const el = $('sessions'); if (!el) return;
    const rows = Object.entries(u.sessions || {});
    el.innerHTML = rows.map(([id, s]) => {
      const tokens = (s.tokens || 0).toLocaleString();
      return `<div class="sess"><b>${id.slice(0, 8)}</b> · ${tokens} tokens · <b>${s.count || 0}</b> pieces</div>`;
    }).join('');
  } catch {}
}

async function api(path, opts) { const r = await fetch(path, opts); return r.json(); }
async function post(path, body) { return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }

async function refreshGallery() {
  const data = await api('/api/gallery');
  window.TokenArt.renderAll(data);
  if (firstIncomingId) {
    const el = [...document.querySelectorAll('.piece')].find((p, i) => data.pieces[i] && data.pieces[i].id === firstIncomingId);
    if (el) el.classList.add('incoming');
    firstIncomingId = null;
  }
}

let currentPending = null;
async function poll() {
  const pending = await api('/api/pending');
  if (pending.length) { currentPending = pending[0]; showAlert(currentPending); }
  else { $('alert').classList.remove('show'); }
  refreshSessions();
}

function showAlert(entry) {
  const trig = entry.trigger ? entry.trigger.replace('-', ' ') + ' · ' : '';
  $('alertSub').textContent = `${trig}${entry.candidates.length} options · session of ${entry.candidates[0].stats.tokens.toLocaleString()} tokens`;
  $('alert').classList.add('show');
}

function openPicker(entry) {
  $('pickerPlaque').textContent = `Session: ${entry.candidates[0].stats.tokens.toLocaleString()} tokens · ${entry.candidates[0].stats.prompts} prompts`;
  const wrap = $('candidates'); wrap.innerHTML = '';
  entry.candidates.forEach((c, idx) => {
    const el = document.createElement('div'); el.className = 'cand';
    el.innerHTML = `<canvas></canvas><div class="lbl">${c.style} · ${c.palette}</div>`;
    renderPiece(el.querySelector('canvas'), c, 1);
    el.addEventListener('click', () => choose(entry.pendingId, idx));
    wrap.appendChild(el);
  });
  $('picker').classList.add('open');
}

async function choose(pendingId, idx) {
  const piece = await post('/api/select', { pendingId, idx });
  firstIncomingId = piece.id;
  $('picker').classList.remove('open');
  await refreshGallery();
  await poll();
}

// wire controls
$('alert').addEventListener('click', () => currentPending && openPicker(currentPending));
$('pickerClose').addEventListener('click', () => $('picker').classList.remove('open'));
$('simBtn').addEventListener('click', async () => { await post('/api/simulate'); await poll(); });
$('postBtn').addEventListener('click', async () => {
  $('postBtn').textContent = '⤴ Posting…';
  const r = await post('/api/post');
  $('postBtn').textContent = r.deploy && r.deploy.url ? '✓ Live' : '✓ Exported';
  if (r.deploy && r.deploy.url) window.open(r.deploy.url, '_blank');
  setTimeout(() => ($('postBtn').textContent = '⤴ Post'), 4000);
});
$('driverBtn').addEventListener('click', async () => {
  const { text } = await api('/api/driver'); $('driverText').value = text; $('driverDrawer').classList.toggle('open');
});
$('driverRandom').addEventListener('click', () => { $('driverText').value = 'random'; });
$('driverSave').addEventListener('click', async () => { await post('/api/driver', { text: $('driverText').value }); $('driverDrawer').classList.remove('open'); });

setInterval(poll, 1500);
poll();
