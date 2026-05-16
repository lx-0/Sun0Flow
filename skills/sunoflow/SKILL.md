---
name: sunoflow
description: Generates and manages AI music via the SunoFlow MCP server (Suno API behind a credit-managed backend). Covers song + sounds + lyrics generation, style boosting, song extension, stem separation, WAV/MIDI conversion, music-video + cover-art rendering, and playlist management.
when_to_use: Use when the user asks to write or generate a song or lyrics, extend a track, separate vocals or stems, render a music video or cover art, convert to WAV or MIDI, manage playlists, boost a style prompt, browse the inspiration feed, or check Suno credit balance.
metadata:
  version: "0.3.0"
  mcp-server: sunoflow-mcp
  transport: stdio
  production-url: https://sunoflow.up.railway.app
---

# SunoFlow

Generate and manage AI music through the SunoFlow MCP server (Suno API behind a credit-managed multi-user backend).

**Production instance:** https://sunoflow.up.railway.app

## Setup

1. Get an API key from your SunoFlow account at https://sunoflow.up.railway.app/settings/api-keys (or your self-hosted instance under **Settings → API Keys**).
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

16 tools, grouped by purpose. All async generation tools return a `taskId` and `status: "pending"` — poll the corresponding read tool (usually `get_song`) until the resource is `ready`.

### Song generation

#### `generate_song`

Submit a song generation. Returns a song ID immediately, then 2 audio variations once `generationStatus === "ready"`.

| Param | Type | Notes |
|---|---|---|
| `prompt` *(required)* | string | Free-form style description (non-custom mode, max 500) or literal lyrics (custom mode, max 3000 V4 / 5000 V4_5+). |
| `title` | string | Setting this enables custom mode. Max 80 (V4) / 100 (V4_5+). |
| `style` | string | Comma-separated style/genre tags. Setting this enables custom mode. |
| `makeInstrumental` | boolean | Default `false`. |
| `model` | `V4` \| `V4_5` \| `V5` \| `V5_5` | `V5_5` = highest quality. Server picks its configured default when omitted. |
| `personaId` | string | Voice persona to apply. |
| `personaModel` | `voice_persona` \| `style_persona` | Type of persona cloning. |
| `negativeTags` | string | Comma-separated tags to exclude (e.g. `"autotune, screaming"`). |
| `vocalGender` | `m` \| `f` | |
| `styleWeight` | 0–1 | Style-adherence intensity, default ~0.5. |
| `weirdnessConstraint` | 0–1 | Creative deviation, default ~0.5. |
| `audioWeight` | 0–1 | Only when using persona/cover features. |

**Examples**

```jsonc
// Free-form mode (style-as-prompt)
{ "prompt": "upbeat synthwave with retro arpeggios", "model": "V5_5" }

// Custom mode (literal lyrics with title + style)
{
  "title": "Coffee Shop Confession",
  "style": "indie folk, acoustic guitar, intimate",
  "prompt": "[Verse 1]\nI saw you reading by the window\nRain was falling on the glass\n...",
  "vocalGender": "f",
  "model": "V5_5"
}
```

→ Returns `{ songId, status: "pending" }`. Poll `get_song(songId)` until `generationStatus === "ready"`.

#### `extend_song`

Continue an existing song from a point. Creates a new variation linked to the original.

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | Source song. |
| `prompt` | string | New lyrics/description for the extension. Omit to continue in original style. |
| `style` | string | Override style for the extension. Max 200 (V4) / 1000 (V4_5+). |
| `title` | string | Title for extended version. |
| `continueAt` | number ≥ 0 | Continue from this many seconds in. Omit = continue from end. |
| `model` | enum | Match original for best results. |
| `negativeTags`, `vocalGender`, `styleWeight`, `weirdnessConstraint` | same as `generate_song` | |

**Example**

```jsonc
{ "songId": "song_abc", "continueAt": 45, "style": "epic guitar solo, rock" }
```

#### `generate_sounds`

Ambient sounds / SFX. Uses V5 model only.

| Param | Type | Notes |
|---|---|---|
| `prompt` *(required)* | string | Max 500. E.g. `"rain on a tin roof"`, `"808 drum loop"`. |
| `soundLoop` | boolean | Loopable output. |
| `soundTempo` | 1–300 | BPM for rhythmic sounds. |
| `soundKey` | `Any` / `C`–`B` / `Cm`–`Bm` | Musical key. Minor keys end in `m`. |

**Example**

```jsonc
{ "prompt": "lo-fi vinyl crackle loop", "soundLoop": true, "soundKey": "Am" }
```

#### `generate_lyrics`

Generate song lyrics from a description. Costs 2 credits. Returns a `taskId` (polling happens server-side; lyrics surface via the SunoFlow UI/API).

| Param | Type | Notes |
|---|---|---|
| `prompt` *(required)* | string | Max 200. E.g. `"a love song about meeting someone at a coffee shop"`. |

#### `boost_style`

Expand a short genre tag into a rich style prompt. Use the result as the `style` param of `generate_song`. Costs 5 credits.

| Param | Type | Notes |
|---|---|---|
| `description` *(required)* | string | Max 500. E.g. `"chill lofi"` → mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, soft boom-bap drums. |

**Example chain**

```jsonc
// 1
boost_style({ "description": "chill lofi" })
// → { boosted: "mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, soft boom-bap drums" }

// 2
generate_song({
  "title": "Late Night Study",
  "style": "<boosted result>",
  "prompt": "[Verse]\nLamp light on the page...",
  "model": "V5_5"
})
```

### Library management

#### `list_songs`

Browse the song library. Paginated.

| Param | Type | Notes |
|---|---|---|
| `limit` | 1–100 | Default 20. |
| `cursor` | string | From previous response. |
| `genre` | string | Partial-match on tags. |
| `mood` | string | Partial-match on tags. |
| `status` | `ready` \| `pending` \| `failed` | Filter by generation status. |

**Example**

```jsonc
{ "status": "ready", "genre": "lofi", "limit": 10 }
```

#### `get_song`

Full song detail. Used both for retrieval and for polling pending generations.

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | |

#### `create_playlist`

Create a new playlist. Max 50 playlists per user.

| Param | Type | Notes |
|---|---|---|
| `name` *(required)* | string | Max 100. |
| `description` | string | Max 1000. |

#### `add_to_playlist`

Add a song to a playlist. Max 500 songs per playlist. Idempotent (returns `{ alreadyInPlaylist: true }` on duplicate).

| Param | Type | Notes |
|---|---|---|
| `playlistId` *(required)* | string | |
| `songId` *(required)* | string | |

### Audio processing

#### `separate_vocals`

Stem separation. Song must be `ready`.

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | |
| `type` *(required)* | `separate_vocal` \| `split_stem` | `separate_vocal` = vocal + instrumental (10 credits). `split_stem` = drums + bass + guitar + keyboard + percussion + strings + synth + fx + brass + woodwinds (50 credits). |

**Example (remix prep)**

```jsonc
{ "songId": "song_abc", "type": "split_stem" }
```

#### `convert_to_wav`

Convert a `ready` song to lossless WAV. Returns a `taskId`; the download URL surfaces in the SunoFlow UI/API once conversion completes.

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | |

#### `generate_midi`

Extract MIDI (per-instrument tracks with pitch/start/end/velocity).

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | Song must be `ready`. |

### Visual & video

#### `create_music_video`

Render an MP4 with synchronized visuals. Retained 15 days. Returns a `taskId`.

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | Song must be `ready`. |
| `author` | string | Artist name to display in the video. |

#### `generate_cover_image`

Generate 2 AI cover-art variations. Retained 14 days. Returns a `taskId`.

| Param | Type | Notes |
|---|---|---|
| `songId` *(required)* | string | Song must be `ready`. |

### Utility

#### `sunoflow_info`

No input. Returns server version + complete tool list with descriptions. Use as a discovery probe.

#### `get_credits`

No input. Returns monthly credit balance:

```jsonc
{
  "creditsRemaining": 240,
  "budget": 500,
  "creditsUsedThisMonth": 260,
  "usagePercent": 52,
  "costPerGeneration": 10
}
```

## Resources

Direct-read URIs (read-only data access without going through tools):

| URI | Kind | Returns |
|---|---|---|
| `sunoflow://stats/credits` | static | Credit balance, monthly usage, full cost table |
| `sunoflow://feed/inspiration` | static | Top 20 pending RSS-feed inspiration items awaiting song-generation approval |
| `sunoflow://songs/{id}` | template | Single song: metadata, audio URL, lyrics, generation params |
| `sunoflow://playlists/{id}` | template | Playlist metadata + ordered track listing |

There is no list-resource for songs or playlists — use the `list_songs` tool and the playlist UI/API for browsing.

## Credits

Most generative operations cost credits (charged only when using the SunoFlow-managed key, not when bringing your own Suno API key).

| Operation | Cost |
|---|---|
| Song generation (`generate_song`, `extend_song`, `generate_sounds`) | 10 |
| Lyrics generation (`generate_lyrics`) | 2 |
| Style boost (`boost_style`) | 5 |
| Vocal separation (`separate_vocals` `separate_vocal`) | 10 |
| Full stem split (`separate_vocals` `split_stem`) | 50 |

Read-side tools (`list_songs`, `get_song`, `get_credits`), playlist mutations, and download-style operations (`convert_to_wav`, `generate_midi`, `create_music_video`, `generate_cover_image`) are free. Use `get_credits` (or read `sunoflow://stats/credits`) before a bulk batch to confirm the cost will fit.

## Model versions

`generate_song` and `extend_song` accept `model`: `V4`, `V4_5`, `V5`, `V5_5`. `V5_5` is the highest-quality choice. **Match the original model when extending a song.** When the caller does not specify a model, the server falls back to its configured default — `sunoflow_info` reports the active default if relevant.

`generate_sounds` uses V5 only — the `model` param is not accepted there.

## Custom mode (generate_song)

Setting `title` or `style` on `generate_song` enables **custom mode**:

- `prompt` is treated as literal lyrics text (with optional `[Verse]` / `[Chorus]` / `[Bridge]` structural tags).
- Max `prompt` length jumps from 500 (free-form) to 3000 (V4) / 5000 (V4_5+).
- `style` controls genre/instrumentation independently of `prompt`.

Use custom mode when you have specific lyrics; use free-form mode when you want the model to invent both lyrics and style from a description.

## Workflows

### Generate a song

1. *(Optional)* `boost_style({ description: "<short tag>" })` → rich style prompt.
2. `generate_song({ prompt, title, style, model: "V5_5" })` → `songId`.
3. Poll `get_song(songId)` every ~10s until `generationStatus === "ready"`.
4. *(Optional)* Chain `generate_cover_image`, `create_music_video`, `convert_to_wav`, `generate_midi`, or `extend_song`.

### Stem separation for remixing

1. `list_songs({ status: "ready" })` → pick target.
2. `separate_vocals({ songId, type: "split_stem" })` → `taskId`.
3. Poll via the SunoFlow UI or your application until stems are ready (no MCP polling tool — surfaces in `get_song` and the song's audio sections).

### Lyrics-first pipeline

1. `generate_lyrics({ prompt: "<theme>" })` → lyrics surface in the SunoFlow UI.
2. Copy lyrics into `generate_song.prompt` with a `title` + `style` (custom mode).

### Bulk-process before credit check

1. `get_credits` → confirm headroom.
2. Plan operations (10 credits per song, 50 for full stems).
3. Run generations, monitor `usagePercent` via the static resource.

## Errors

Tools raise `Error("<verb> failed (<code>): <message>")` on Suno-API errors (network/quota/validation). Credit checks fail before the API call with `Error("Insufficient credits: need <n>, have <m>")`. Songs missing `sunoJobId` / `sunoAudioId` (e.g. failed generation) fail post-processing tools with `"Cannot <verb> — song is missing Suno identifiers."`.

## Discovery

If unsure which tools the deployed server supports (e.g. after an update), call `sunoflow_info` first — it returns the server version + the complete tool list with descriptions sourced from the running registry.
