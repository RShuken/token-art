import { rnd, pick } from './rng.js';

export const STYLES = {
  'Flow Field': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1);
    for (let i = 0; i < 1400; i++) {
      let x = rnd(r, 0, W), y = rnd(r, 0, H);
      ctx.strokeStyle = pick(r, cols); ctx.globalAlpha = 0.35; ctx.lineWidth = rnd(r, 0.5, 1.8);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 26; s++) {
        const a = Math.sin(x * 0.01) * Math.cos(y * 0.012) * Math.PI * 2;
        x += Math.cos(a) * 6; y += Math.sin(a) * 6; ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Bauhaus': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[4] || P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1), g = 4, cw = W / g, ch = H / g;
    for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
      const x = i * cw, y = j * ch, k = Math.floor(rnd(r, 0, 4)); ctx.fillStyle = pick(r, cols);
      if (k === 0) ctx.fillRect(x, y, cw, ch);
      else if (k === 1) { ctx.beginPath(); ctx.arc(x + cw / 2, y + ch / 2, cw / 2, 0, 7); ctx.fill(); }
      else if (k === 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cw, y); ctx.lineTo(x, y + ch); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x, y, cw, 0, Math.PI / 2); ctx.lineTo(x, y); ctx.fill(); }
    }
  },
  'Mondrian': (ctx, W, H, r, P) => {
    ctx.fillStyle = '#f6f6f2'; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1);
    (function split(x, y, w, h, d) {
      if (d <= 0 || (w < 110 && h < 110)) {
        ctx.fillStyle = r() < 0.32 ? pick(r, cols) : '#f6f6f2'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#111'; ctx.lineWidth = 8; ctx.strokeRect(x, y, w, h); return;
      }
      if (w > h) { const c = rnd(r, 0.3, 0.7) * w; split(x, y, c, h, d - 1); split(x + c, y, w - c, h, d - 1); }
      else { const c = rnd(r, 0.3, 0.7) * h; split(x, y, w, c, d - 1); split(x, y + c, w, h - c, d - 1); }
    })(0, 0, W, H, 4);
  },
  'Circle Packing': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1), circ = [];
    for (let i = 0; i < 1400; i++) {
      let x = rnd(r, 0, W), y = rnd(r, 0, H), rad = 2, ok = true;
      for (let g = 0; g < 18; g++) {
        let bad = false;
        for (const c of circ) { if (Math.hypot(c.x - x, c.y - y) < c.r + rad + 2) { bad = true; break; } }
        if (bad || x - rad < 0 || x + rad > W || y - rad < 0 || y + rad > H) { ok = g > 0; break; }
        rad++;
      }
      if (ok && rad > 2) { circ.push({ x, y, r: rad }); ctx.fillStyle = pick(r, cols); ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); }
    }
  },
  'Truchet': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const t = rnd(r, 60, 92), c1 = pick(r, P.slice(1)), c2 = pick(r, P.slice(1)); ctx.lineWidth = t * 0.22;
    for (let x = 0; x < W; x += t) for (let y = 0; y < H; y += t) {
      ctx.strokeStyle = r() < 0.5 ? c1 : c2; ctx.beginPath();
      if (r() < 0.5) { ctx.arc(x, y, t / 2, 0, Math.PI / 2); ctx.moveTo(x + t, y + t); ctx.arc(x + t, y + t, t / 2, Math.PI, Math.PI * 1.5); }
      else { ctx.arc(x + t, y, t / 2, Math.PI / 2, Math.PI); ctx.moveTo(x, y + t); ctx.arc(x, y + t, t / 2, Math.PI * 1.5, Math.PI * 2); }
      ctx.stroke();
    }
  },
  'Watercolor': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[3] || '#f3ede4'; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1);
    for (let b = 0; b < 9; b++) {
      const cx = rnd(r, 0, W), cy = rnd(r, 0, H), base = rnd(r, 60, 150), col = pick(r, cols);
      ctx.fillStyle = col; ctx.globalAlpha = 0.05;
      for (let layer = 0; layer < 16; layer++) {
        ctx.beginPath(); const n = 22;
        for (let i = 0; i <= n; i++) {
          const a = i / n * Math.PI * 2, rr = base + rnd(r, -base * 0.5, base * 0.5) + layer * 3;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
  'Orbital': (ctx, W, H, r, P) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W);
    g.addColorStop(0, P[0]); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1);
    for (let ring = 0; ring < 90; ring++) {
      const rad = ring * (W / 130) + rnd(r, 0, 6); ctx.strokeStyle = pick(r, cols);
      ctx.globalAlpha = rnd(r, 0.15, 0.6); ctx.lineWidth = rnd(r, 0.4, 2.2);
      ctx.beginPath(); ctx.arc(W / 2 + rnd(r, -40, 40), H / 2 + rnd(r, -40, 40), rad, rnd(r, 0, 7), rnd(r, 3, 10)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Strokes': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1);
    for (let i = 0; i < 420; i++) {
      const x = rnd(r, 0, W), y = rnd(r, 0, H), len = rnd(r, 20, 160), a = pick(r, [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]);
      ctx.strokeStyle = pick(r, cols); ctx.globalAlpha = rnd(r, 0.5, 1); ctx.lineWidth = rnd(r, 1, 9); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  'Voronoi Shards': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1), pts = []; for (let i = 0; i < 48; i++) pts.push({ x: rnd(r, 0, W), y: rnd(r, 0, H), c: pick(r, cols) });
    const step = 5;
    for (let x = 0; x < W; x += step) for (let y = 0; y < H; y += step) {
      let best = 1e9, bc = cols[0];
      for (const p of pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < best) { best = d; bc = p.c; } }
      ctx.fillStyle = bc; ctx.fillRect(x, y, step, step);
    }
    ctx.fillStyle = '#000'; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill(); }
  },
  'Grid Pulse': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1), n = Math.floor(rnd(r, 10, 16)), cw = W / n, ch = H / n;
    const cx = rnd(r, 0, W), cy = rnd(r, 0, H), maxd = Math.hypot(W, H);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * cw + cw / 2, y = j * ch + ch / 2, d = Math.hypot(x - cx, y - cy) / maxd;
      const sz = (1 - d) * cw * 0.9 * rnd(r, 0.6, 1.1);
      ctx.fillStyle = pick(r, cols); ctx.beginPath(); ctx.arc(x, y, Math.max(1, sz / 2), 0, 7); ctx.fill();
    }
  },
  'Sediment': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1); let y = 0;
    while (y < H) {
      const band = rnd(r, H * 0.04, H * 0.14), col = pick(r, cols); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, y);
      const n = 8; for (let i = 0; i <= n; i++) { const x = (i / n) * W, yy = y + rnd(r, -band * 0.3, band * 0.3); ctx.lineTo(x, yy); }
      ctx.lineTo(W, y + band); ctx.lineTo(0, y + band); ctx.closePath(); ctx.fill();
      y += band;
    }
  },
  'Constellation': (ctx, W, H, r, P) => {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, P[0]); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1), stars = []; for (let i = 0; i < 90; i++) stars.push({ x: rnd(r, 0, W), y: rnd(r, 0, H) });
    ctx.strokeStyle = pick(r, cols); ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    for (const s of stars) for (const t of stars) { if (s !== t && Math.hypot(s.x - t.x, s.y - t.y) < 120 && r() < 0.12) { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke(); } }
    ctx.globalAlpha = 1;
    for (const s of stars) { ctx.fillStyle = pick(r, cols); ctx.beginPath(); ctx.arc(s.x, s.y, rnd(r, 1, 4), 0, 7); ctx.fill(); }
  },
  'Rivers': (ctx, W, H, r, P) => {
    ctx.fillStyle = P[0]; ctx.fillRect(0, 0, W, H);
    const cols = P.slice(1);
    for (let k = 0; k < 26; k++) {
      let x = rnd(r, 0, W), y = 0; ctx.strokeStyle = pick(r, cols); ctx.globalAlpha = rnd(r, 0.3, 0.8); ctx.lineWidth = rnd(r, 1, 6);
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < H) { x += rnd(r, -18, 18); y += rnd(r, 10, 28); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
};
