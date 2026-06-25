import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const snippet = {
  hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: `node ${join(ROOT, 'watch', 'hook.js')}` }] }] }
};
console.log('Add this to .claude/settings.json (merge into existing "hooks"):\n');
console.log(JSON.stringify(snippet, null, 2));
