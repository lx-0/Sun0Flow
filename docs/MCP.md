# SunoFlow MCP Server

SunoFlow exposes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets AI agents (Claude Desktop, Cursor, Windsurf, etc.) interact with the platform programmatically.

## Transport

The server uses **stdio transport** — the host spawns it as a subprocess, communicates over stdin/stdout, and the server logs to stderr.

## Authentication

Generate a personal API key in your SunoFlow account settings (`/settings/api-keys`).
Set it as `SUNOFLOW_API_KEY` when launching the server. The server exits immediately if the key is missing or revoked.

## Quick start (local)

```bash
SUNOFLOW_API_KEY=sk-... tsx mcp/server.ts
```

Or compile first:

```bash
pnpm build:mcp
node dist/mcp/server.js
```

## Claude Desktop

Add the following to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sunoflow": {
      "command": "tsx",
      "args": ["/absolute/path/to/sunoflow/mcp/server.ts"],
      "env": {
        "SUNOFLOW_API_KEY": "sk-your-key-here",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

> **Note:** The server needs a `DATABASE_URL` that points to the SunoFlow Postgres database, because it validates your API key on startup.

For a self-hosted instance, set `DATABASE_URL` to your database connection string.
For the hosted service, contact support for a read-only replica credential suitable for MCP use.

## Available tools

The canonical reference (with full parameter tables, examples, and credit costs) is [`skills/sunoflow/SKILL.md`](../skills/sunoflow/SKILL.md). Summary of the 16 registered tools:

| Tool | Group | Purpose |
|------|-------|---------|
| `generate_song` | Generation | Submit a song generation. Returns `songId`; poll `get_song`. |
| `extend_song` | Generation | Continue an existing song from a point (or end). |
| `generate_sounds` | Generation | Ambient sounds / SFX (V5 only). |
| `generate_lyrics` | Generation | Lyrics from a 200-char description (2 credits). |
| `boost_style` | Generation | Expand a short genre tag into a rich style prompt (5 credits). |
| `list_songs` | Library | Paginated browse with genre/mood/status filters. |
| `get_song` | Library | Full song detail (also used for polling pending generations). |
| `create_playlist` | Library | Create playlist (max 50/user). |
| `add_to_playlist` | Library | Add song to playlist (max 500/playlist, idempotent). |
| `separate_vocals` | Audio | Vocal/instrumental split (10) or full stem split (50 credits). |
| `convert_to_wav` | Audio | Lossless WAV conversion. |
| `generate_midi` | Audio | Extract per-instrument MIDI tracks. |
| `create_music_video` | Visual | MP4 with synchronized visuals (retained 15 days). |
| `generate_cover_image` | Visual | 2 cover-art variations (retained 14 days). |
| `get_credits` | Utility | Monthly credit balance + cost table. |
| `sunoflow_info` | Utility | Server version + tool inventory probe. |

## Available resources

Read-only URIs for direct data access:

| URI | Returns |
|------|---------|
| `sunoflow://stats/credits` | Credit balance, monthly usage, cost reference |
| `sunoflow://feed/inspiration` | Top 20 pending RSS-feed inspiration items |
| `sunoflow://songs/{id}` | Song metadata, audio URL, lyrics, generation params |
| `sunoflow://playlists/{id}` | Playlist metadata + ordered tracks |

No list-resources for songs/playlists — use `list_songs` and the playlist API for browsing.

## Adding tools

Create a file in `mcp/tools/` and call `registerTool()` at module load time:

```typescript
// mcp/tools/my-tool.ts
import { registerTool } from "../registry";

registerTool({
  name: "sunoflow_my_tool",
  description: "What this tool does",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The input" },
    },
    required: ["prompt"],
  },
  async handler(input, userId) {
    // userId is the authenticated SunoFlow user
    return { result: "..." };
  },
});
```

Then import it in `mcp/server.ts`:

```typescript
import "./tools/my-tool";
```

## Running tests

```bash
pnpm test mcp/server.test.ts
```
