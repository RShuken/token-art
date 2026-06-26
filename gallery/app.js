import { renderPiece } from '../engine/render.js';

const DATA_URL = new URL('gallery.json', location.href);

async function load() {
  const res = await fetch(DATA_URL);
  const data = await res.json();
  window.__gallery = data;
  renderAll(data);
}

function card(piece) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.innerHTML = `<div class="mat"><canvas></canvas></div>
    <div class="cap"><div class="t">${piece.title}</div><div class="pl">${piece.plaque}</div></div>`;
  renderPiece(el.querySelector('canvas'), piece, 2);
  el.addEventListener('click', () => openLightbox(piece));
  return el;
}

function renderAll(data) {
  const m = document.getElementById('masonry');
  m.innerHTML = '';
  for (const p of data.pieces) m.appendChild(card(p));
  const target = data.target || 150;
  const c = document.getElementById('counter');
  if (c) c.textContent = `${data.pieces.length} / ${target} pieces`;
  const banner = document.getElementById('banner');
  if (banner) {
    const ready = data.pieces.length >= target;
    banner.classList.toggle('show', ready);
    const bc = document.getElementById('bannerCount');
    if (bc) bc.textContent = String(data.pieces.length);
  }
}

function openLightbox(piece) {
  const lb = document.getElementById('lightbox');
  renderPiece(document.getElementById('lbCanvas'), piece, 2);
  document.getElementById('lbTitle').textContent = piece.title;
  document.getElementById('lbPlaque').textContent = piece.plaque;
  lb.classList.add('open');
}

document.getElementById('lbClose')?.addEventListener('click', () => document.getElementById('lightbox').classList.remove('open'));
document.getElementById('lightbox')?.addEventListener('click', (e) => { if (e.target.id === 'lightbox') e.currentTarget.classList.remove('open'); });

window.TokenArt = { renderAll, openLightbox };
load();
