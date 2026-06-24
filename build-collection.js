import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { buildCollection } from './engine/simulate.js';

const count = Number(process.argv[2] || 140);
const driverText = existsSync('driver.md') ? readFileSync('driver.md', 'utf8') : 'random';
const { pieces } = buildCollection({ count, driverText, seed: 20260624 });
const gallery = { pieces, generatedAt: new Date().toISOString(), target: 150 };

mkdirSync('state', { recursive: true });
writeFileSync('state/gallery.json', JSON.stringify(gallery, null, 2));
console.log(`Built ${pieces.length} pieces → state/gallery.json`);
