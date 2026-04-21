---
name: sunoflow
description: >
  AI music creation and management via the SunoFlow MCP server.
  Use when you need to generate songs, lyrics, sound effects, manage playlists,
  separate stems, create music videos, or export audio. Connects to a SunoFlow
  instance over MCP stdio transport.
license: MIT
metadata:
  version: "0.1.0"
  mcp-server: sunoflow-mcp
  transport: stdio
  production-url: https://sunoflow.up.railway.app
---

# SunoFlow

Generate and manage AI music through the SunoFlow MCP server.

**Production instance:** https://sunoflow.up.railway.app

## Setup

1. Get an API key from your SunoFlow account at https://sunoflow.up.railway.app/settings/api-keys (or your self-hosted instance under **Settings > API Keys**).
2. Start the MCP server:

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

The server also needs `DATABASE_URL` pointing to the SunoFlow Postgres database.

## Tools

### Song generation

| Tool | Description |
|------|-------------|
| `generate_song` | Create a new song from a prompt or custom lyrics/style/title. Returns a song ID — poll `get_song` until `generationStatus === "ready"`. Generates 2 songs per request. |
| `extend_song` | Continue an existing song from a given point. Creates a new variation linked to the original. |
| `generate_lyrics` | Generate song lyrics from a text description. Returns a task ID for polling. |
| `generate_sounds` | Generate ambient sounds or SFX from a text prompt. Supports looping, BPM, and musical key control. |
| `boost_style` | Expand a short style description (e.g. "chill lofi") into a detailed style prompt for more precise generation. |

### Library management

| Tool | Description |
|------|-------------|
| `list_songs` | Browse the song library with optional genre, mood, and status filters. Paginated. |
| `get_song` | Get full song details: audio URL, metadata, lyrics, generation status. Also used for polling pending generations. |
| `create_playlist` | Create a new playlist (max 50 per user). |
| `add_to_playlist` | Add a song to an existing playlist (max 500 songs per playlist). |

### Audio processing

| Tool | Description |
|------|-------------|
| `separate_vocals` | Split a song into vocal + instrumental tracks, or full multi-stem separation (drums, bass, guitar, etc.). |
| `convert_to_wav` | Convert a generated song to lossless WAV format. |
| `generate_midi` | Extract MIDI data with instrument tracks and note-level detail. |

### Visual & video

| Tool | Description |
|------|-------------|
| `create_music_video` | Generate an MP4 music video with synchronized visuals. Retained 15 days. |
| `generate_cover_image` | Generate 2 AI cover art images for a song. Retained 14 days. |

### Utility

| Tool | Description |
|------|-------------|
| `sunoflow_info` | Server version and list of all registered tools. |
| `get_credits` | Check remaining monthly generation credits. |

## Resources

The server exposes MCP resources for direct data access:

- `sunoflow://songs` — recent songs list
- `sunoflow://songs/{id}` — single song detail
- `sunoflow://playlists` — user playlists
- `sunoflow://playlists/{id}` — playlist with tracks
- `sunoflow://feed` — discovery feed
- `sunoflow://stats/credits` — credit usage summary

## Workflow: generate a song

1. (Optional) Call `boost_style` to expand a short genre tag into a rich style prompt.
2. Call `generate_song` with your prompt, title, and style. Note the returned `songId`.
3. Poll `get_song` with that `songId` until `generationStatus === "ready"`.
4. Optionally call `extend_song` to continue the track, `generate_cover_image` for artwork, or `create_music_video` for video.

## Workflow: stem separation for remixing

1. Use `list_songs` or `get_song` to find the target song (must be status `"ready"`).
2. Call `separate_vocals` with `type: "split_stem"` for full multi-stem output (drums, bass, guitar, keyboard, percussion, strings, synth, fx, brass, woodwinds).
3. Poll the returned task ID until processing completes.

## Credits

Most operations consume credits. Check `get_credits` before bulk operations.

| Operation | Cost |
|-----------|------|
| Song generation | 10 credits |
| Song extension | 10 credits |
| Lyrics generation | 2 credits |
| Style boost | 5 credits |
| Vocal separation | 10 credits |
| Full stem split | 50 credits |

## Model versions

`generate_song` and `extend_song` accept a `model` parameter: `V4`, `V4_5`, `V5`, `V5_5`. V5_5 is the latest with best quality. Match the original model when extending a song.

## Custom mode

Setting `title` or `style` on `generate_song` enables custom mode where `prompt` is treated as literal lyrics text rather than a free-form description. Use this when you have specific lyrics to set to music.
