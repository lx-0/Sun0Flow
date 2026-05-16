---
name: sunoflow
description: Generates and manages AI music via the SunoFlow MCP server (Suno API behind a credit-managed backend). Covers song + sounds + lyrics generation, style boosting, song extension, stem separation, WAV/MIDI conversion, music-video + cover-art rendering, and playlist management.
when_to_use: Use when the user asks to write or generate a song or lyrics, extend a track, separate vocals or stems, render a music video or cover art, convert to WAV or MIDI, manage playlists, boost a style prompt, browse the inspiration feed, or check Suno credit balance.
metadata:
  version: "0.2.1"
  mcp-server: sunoflow-mcp
  transport: stdio
  production-url: https://sunoflow.up.railway.app
---

# SunoFlow

Generate and manage AI music through the SunoFlow MCP server — Suno API behind a credit-managed multi-user backend.

**Production instance:** https://sunoflow.up.railway.app

## Setup

1. Get an API key from your SunoFlow account at **Settings → API Keys**.
2. Configure the MCP server (stdio transport, needs `SUNOFLOW_API_KEY` + `DATABASE_URL`):

```json
{
  "mcpServers": {
    "sunoflow": {
      "command": "tsx",
      "args": ["mcp/server.ts"],
      "env": {
        "SUNOFLOW_API_KEY": "sk-your-key-here",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

## Tool index

16 tools. **Full parameter tables and examples live in [reference/tools.md](reference/tools.md)** — load it when you need to actually invoke a tool. The index below is just for picking the right one.

| Tool | Cost | Purpose |
| --- | --- | --- |
| `generate_song` | 10 | Generate a song from a prompt (free-form) or from lyrics + style (custom mode). |
| `extend_song` | 10 | Continue an existing song from a chosen second. |
| `generate_sounds` | 10 | Ambient sounds / SFX (V5 only). |
| `generate_lyrics` | 2 | Generate lyrics from a theme. |
| `boost_style` | 5 | Expand a short genre tag into a rich style prompt — feed into `generate_song.style`. |
| `list_songs` | free | Browse the library, paginated, filterable by status/genre/mood. |
| `get_song` | free | Full song detail. Also the polling tool for pending generations. |
| `create_playlist` | free | New playlist (max 50/user). |
| `add_to_playlist` | free | Add song to playlist (max 500/playlist, idempotent). |
| `separate_vocals` | 10 / 50 | Vocal-only split (10) or full stem separation (50). |
| `convert_to_wav` | free | Convert ready song to lossless WAV. |
| `generate_midi` | free | Extract per-instrument MIDI. |
| `create_music_video` | free | Render MP4 with synchronized visuals (15-day retention). |
| `generate_cover_image` | free | Generate 2 AI cover-art variations (14-day retention). |
| `sunoflow_info` | free | Runtime discovery — returns server version + tool list from the running registry. |
| `get_credits` | free | Monthly credit balance + cost table. |

Async generation tools return `{ status: "pending", … }` — poll `get_song(songId)` until `generationStatus === "ready"` for songs; sub-resources (stems, MIDI, video) surface via the SunoFlow UI/API.

## Resources

Direct-read URIs (`sunoflow://…`) — see [reference/resources.md](reference/resources.md).

## Workflows

### Generate a song

1. *(Optional)* `boost_style({ description: "<short tag>" })` → rich style prompt.
2. `generate_song({ prompt, title, style, model: "V5_5" })` → `songId`.
3. Poll `get_song(songId)` every ~10s until `generationStatus === "ready"`.
4. *(Optional)* Chain `generate_cover_image`, `create_music_video`, `convert_to_wav`, `generate_midi`, or `extend_song`.

### Stem separation for remixing

1. `list_songs({ status: "ready" })` → pick target.
2. `separate_vocals({ songId, type: "split_stem" })` → `taskId`.
3. Stems surface in `get_song`'s audio sections (no MCP polling tool).

### Lyrics-first pipeline

1. `generate_lyrics({ prompt: "<theme>" })` → lyrics surface in the SunoFlow UI.
2. Copy lyrics into `generate_song.prompt` with a `title` + `style` (custom mode).

### Budget a batch

1. `get_credits` → confirm headroom.
2. Plan cost: 10 per song, 2 per lyric set, 50 for a full stem split (see Tool index).
3. Run, monitor via `sunoflow://stats/credits`.

## Pick the right mode for `generate_song`

`generate_song` operates in two modes — the choice matters for prompt length and behaviour. See **[Custom mode](reference/tools.md#custom-mode)** in the tool reference.

- **Free-form mode** (no `title`, no `style`): `prompt` is a free-form description; model invents both lyrics and style. Max 500 chars.
- **Custom mode** (setting `title` or `style`): `prompt` is literal lyrics with optional `[Verse]` / `[Chorus]` tags. Max 3000 / 5000 chars depending on model.

## Errors

Tools raise `Error("<verb> failed (<code>): <message>")` on Suno-API errors (network, quota, validation). Credit checks fail before the API call with `Error("Insufficient credits: need <n>, have <m>")`. Post-processing tools (stems, WAV, MIDI, video, cover) fail with `"Cannot <verb> — song is missing Suno identifiers."` when the song lacks `sunoJobId` or `sunoAudioId` (e.g. a failed generation).

## Discovery

If unsure which tools the deployed server supports (e.g. after an update), call `sunoflow_info` first — it returns the server version + the complete tool list with descriptions sourced from the running registry.

## Reference index

- [reference/tools.md](reference/tools.md) — full tool parameter tables, examples, custom-mode semantics, model-version notes
- [reference/resources.md](reference/resources.md) — `sunoflow://` URI schema for read-only data access
