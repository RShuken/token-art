import { STYLES } from './styles.js';
import { PALETTES } from './palettes.js';
import { mulberry32 } from './rng.js';

export function renderPiece(canvas, record, scale = 2) {
  const { w, h } = record.format;
  canvas.width = w * scale; canvas.height = h * scale;
  canvas.style.aspectRatio = `${w} / ${h}`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const colors = (PALETTES[record.palette] || PALETTES['Mono Ink']).colors;
  const draw = STYLES[record.style] || STYLES['Strokes'];
  draw(ctx, w, h, mulberry32(record.seed >>> 0), colors);
}
