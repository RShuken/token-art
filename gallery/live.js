const $ = (id) => document.getElementById(id);
let firstIncomingId = null;

async function api(path, opts) { const r = await fetch(path, opts); return r.json(); }
async function post(path, body) { return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }

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

async function refreshGallery() {
  const data = await api('/api/gallery');
  window.TokenArt.renderAll(data);
  if (firstIncomingId) {
    const el = [...document.querySelectorAll('.piece')].find((p, i) => data.pieces[i] && data.pieces[i].id === firstIncomingId);
    if (el) el.classList.add('incoming');
    firstIncomingId = null;
  }
}

async function poll() {
  await refreshGallery();
  refreshSessions();
}

$('simBtn').addEventListener('click', async () => { const piece = await post('/api/simulate'); firstIncomingId = piece && piece.id; await poll(); });
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
