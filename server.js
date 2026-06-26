import { createServer } from 'node:http';
import { readFile, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { addPending, listPending, selectCandidate, loadGallery } from './engine/state.js';
import { simulateSession } from './engine/simulate.js';
import { mulberry32 } from './engine/rng.js';
import { APP_ROOT, STATE_DIR } from './engine/paths.js';

const ROOT = APP_ROOT;
const STATE = STATE_DIR;
const PORT = process.env.PORT || 4800;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d ? JSON.parse(d) : {})); });
}
function driverText() { return existsSync(join(ROOT, 'driver.md')) ? readFileSync(join(ROOT, 'driver.md'), 'utf8') : 'random'; }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p === '/api/gallery') return send(res, 200, loadGallery(STATE));
    if (p === '/api/pending') return send(res, 200, listPending(STATE));
    if (p === '/api/usage') {
      const up = join(STATE, 'usage.json');
      let u = { sessions: {} };
      if (existsSync(up)) { try { u = JSON.parse(readFileSync(up, 'utf8')); } catch {} }
      return send(res, 200, u);
    }
    if (p === '/api/driver' && req.method === 'GET') return send(res, 200, { text: driverText() });
    if (p === '/gallery.json') return send(res, 200, loadGallery(STATE));

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (p === '/api/simulate') {
        const stats = simulateSession(mulberry32((Date.now() & 0xffffffff) >>> 0));
        return send(res, 200, addPending(STATE, stats, driverText()));
      }
      if (p === '/api/select') return send(res, 200, selectCandidate(STATE, body.pendingId, body.idx));
      if (p === '/api/driver') { writeFileSync(join(ROOT, 'driver.md'), body.text || 'random'); return send(res, 200, { ok: true }); }
      if (p === '/api/post') {
        const { exportSite, deploySite } = await import('./scripts/publish.js');
        const out = exportSite(ROOT);
        let deploy = { ok: false, skipped: true };
        try { deploy = await deploySite(out); } catch (e) { deploy = { ok: false, error: String(e) }; }
        return send(res, 200, { exported: out, deploy });
      }
    }

    // static files: gallery/ at root, engine/ passthrough, live gallery.json
    let file = p === '/' ? '/gallery/index.html' : p;
    if (file.startsWith('/engine/')) file = file; else if (!file.startsWith('/gallery/')) file = '/gallery' + file;
    const abs = normalize(join(ROOT, file));
    if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return send(res, 403, 'forbidden', 'text/plain');
    readFile(abs, (err, data) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      send(res, 200, data, MIME[extname(abs)] || 'application/octet-stream');
    });
  } catch (e) {
    send(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => console.log(`Token Art live at http://localhost:${PORT}`));
