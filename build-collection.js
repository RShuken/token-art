import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCollection } from './engine/simulate.js';
import { APP_ROOT, STATE_DIR } from './engine/paths.js';

const count = Number(process.argv[2] || 140);
const driverPath = join(APP_ROOT, 'driver.md');
const driverText = existsSync(driverPath) ? readFileSync(driverPath, 'utf8') : 'random';
const { pieces } = buildCollection({ count, driverText, seed: 20260624 });
const gallery = { pieces, generatedAt: new Date().toISOString(), target: 150 };

mkdirSync(STATE_DIR, { recursive: true });
const out = join(STATE_DIR, 'gallery.json');
writeFileSync(out, JSON.stringify(gallery, null, 2));
console.log(`Built ${pieces.length} pieces → ${out}`);
