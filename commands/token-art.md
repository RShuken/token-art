---
name: token-art
description: Open the Token Art gallery — a live view of the art generated from your token usage.
---

Open the Token Art gallery for the user. The gallery is a small local Node server
that renders the procedural art pieces generated from their token usage.

Do the following with the Bash tool. All commands use a shared data directory at
`$HOME/.token-art` so the gallery shows the same pieces the Stop hook generates.

1. **Ensure a starter collection exists** (only if the gallery is empty). Run:

   ```bash
   TOKEN_ART_HOME="$HOME/.token-art" node "$CLAUDE_PLUGIN_ROOT/build-collection.js" 140
   ```

   (Safe to skip if `$HOME/.token-art/state/gallery.json` already exists and the
   user just wants to view their own accumulated pieces.)

2. **Start the gallery server in the background** (skip if it is already running on
   port 4800):

   ```bash
   TOKEN_ART_HOME="$HOME/.token-art" node "$CLAUDE_PLUGIN_ROOT/server.js" &
   ```

3. **Tell the user it is live at http://localhost:4800** and summarize what they
   can do there: watch the gallery grow as they use Claude (every ~15k tokens a
   new "painting ready" alert appears on the right), click the alert to pick one
   of 5 candidate variations, edit the **Driver** to steer style/palette, and use
   **Simulate session** to demo the flow on demand.

Notes:
- The art is generated automatically by this plugin's Stop hook as the user works
  — no action needed for pieces to accumulate.
- To stop the server later: `pkill -f "$CLAUDE_PLUGIN_ROOT/server.js"` (or just the
  port: `pkill -f "node .*server.js"`).
- Set `TOKEN_ART_THRESHOLD` (default 15000) to change how many tokens produce each
  new piece.
