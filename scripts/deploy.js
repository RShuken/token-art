import { execFileSync } from 'node:child_process';
import { exportSite, deploySite } from './publish.js';

const root = process.cwd();
execFileSync('node', ['build-collection.js', process.argv[2] || '140'], { cwd: root, stdio: 'inherit' });
const dist = exportSite(root);
console.log('Exported →', dist);
const res = await deploySite(dist);
console.log('Deployed →', res.url);
