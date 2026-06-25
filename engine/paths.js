import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Where the bundled app assets live (engine/, gallery/, watch/, server.js, driver.md).
// Derived from this file's location so it resolves whether Token Art runs from a
// local checkout or an installed Claude Code plugin. When Claude Code runs a
// bundled hook it sets CLAUDE_PLUGIN_ROOT to this same directory.
export const APP_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || join(dirname(fileURLToPath(import.meta.url)), '..');

// Shared, stable directory for generated state (gallery.json, pending.json,
// usage.json). Driven by TOKEN_ART_HOME so the Stop hook and the gallery server
// always agree on one location even when installed as a plugin. Unset (local
// dev / demo) → a `state/` dir next to the app, preserving original behavior.
export const STATE_DIR = process.env.TOKEN_ART_HOME
  ? join(process.env.TOKEN_ART_HOME, 'state')
  : join(APP_ROOT, 'state');
