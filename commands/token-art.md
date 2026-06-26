---
name: token-art
description: Open the Token Art gallery — a live view of the art generated from your token usage.
---

Open the Token Art gallery for the user. The gallery is a small local Node server
that renders the procedural art pieces generated from their token usage.

Do the following with the Bash tool. State lives in a shared data directory at
`$HOME/.token-art` so the gallery shows the same pieces the Stop hook generates.

1. **Start the gallery server in the background** (skip if it is already running on
   port 4800):

   ```bash
   TOKEN_ART_HOME="$HOME/.token-art" node "$CLAUDE_PLUGIN_ROOT/server.js" &
   ```

2. **Tell the user it is live at http://localhost:4800.** The gallery starts empty
   and fills as they use Claude — every cadence emission auto-adds a random piece
   (no picking). When the gallery reaches its target (default 50), the plugin prints
   a "gallery is ready" message in the terminal. They can also click **Simulate
   session** to add pieces on demand, edit the **Driver** to steer style, and **Post**
   to publish.

Notes:
- Art is generated automatically by this plugin's hook as the user works.
- To stop the server later: `pkill -f "$CLAUDE_PLUGIN_ROOT/server.js"`.
- Change the gallery size / cadence in `config.json` (`galleryTarget`, `thresholdTokens`, …).
