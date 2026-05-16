# SunoFlow tool reference

Full parameter tables and examples for each MCP tool. Loaded on demand from `SKILL.md`.

Conventions:

- All async generation tools return `{ status: "pending", … }` plus a song or task identifier — poll the corresponding read tool (`get_song` for songs; the SunoFlow UI/API for sub-resources like stems/MIDI/video) until the resource is `ready`.
- "Custom mode" applies only to `generate_song` and `extend_song` (see [Custom mode](#custom-mode) below).
- Param length caps that depend on model version are written as `<V4 cap> / <V4_5+ cap>` (e.g. `3000 / 5000`).

## Contents

- [Song generation](#song-generation): `generate_song`, `extend_song`, `generate_sounds`, `generate_lyrics`, `boost_style`
- [Library management](#library-management): `list_songs`, `get_song`, `create_playlist`, `add_to_playlist`
- [Audio processing](#audio-processing): `separate_vocals`, `convert_to_wav`, `generate_midi`
- [Visual & video](#visual--video): `create_music_video`, `generate_cover_image`
- [Utility](#utility): `sunoflow_info`, `get_credits`
- [Custom mode](#custom-mode) — required reading for `generate_song`
- [Model versions](#model-versions)

---

## Song generation

### `generate_song`

Submit a song generation. Returns a song ID immediately, then 2 audio variations once `generationStatus === "ready"`.

| Param | Type | Notes |
| --- | --- | --- |
| `prompt` *(required)* | string | Free-form style description (non-custom mode, max 500) or literal lyrics (custom mode, max 3000 / 5000). |
| `title` | string | Setting this enables custom mode. Max 80 / 100. |
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

```jsonc
// Free-form mode (style-as-prompt) — model invents everything
{ "prompt": "upbeat synthwave with retro arpeggios", "model": "V5_5" }

// Custom mode (literal lyrics with title + style)
{
  "title": "Coffee Shop Confession",
  "style": "indie folk, acoustic guitar, intimate",
  "prompt": "[Verse 1]\nI saw you reading by the window\nRain was falling on the glass\n...",
  "vocalGender": "f",
  "model": "V5_5"
}

// Instrumental, no vocals
{
  "title": "Driving Score",
  "style": "cinematic, orchestral, building tension",
  "prompt": "[Intro]\n[Build]\n[Climax]",
  "makeInstrumental": true,
  "model": "V5_5"
}

// With negativeTags — exclude unwanted style traits
{
  "prompt": "warm acoustic ballad with strings",
  "negativeTags": "autotune, screaming, distortion",
  "vocalGender": "m",
  "styleWeight": 0.7
}

// Persona cloning — reuse a saved voice persona
{
  "title": "Same Singer New Song",
  "style": "indie folk",
  "prompt": "[Verse]\nNew lyrics here...",
  "personaId": "persona_xyz",
  "personaModel": "voice_persona",
  "audioWeight": 0.6
}
```

Returns `{ songId, status: "pending" }`. Poll `get_song(songId)` until `generationStatus === "ready"`.

### `extend_song`

Continue an existing song from a point. Creates a new variation linked to the original.

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | Source song. |
| `prompt` | string | New lyrics/description for the extension. Omit to continue in original style. |
| `style` | string | Override style for the extension. Max 200 / 1000. |
| `title` | string | Title for extended version. |
| `continueAt` | number ≥ 0 | Continue from this many seconds in. Omit = continue from end. |
| `model` | enum | Match original for best results. |
| `negativeTags`, `vocalGender`, `styleWeight`, `weirdnessConstraint` | same as `generate_song` | |

```jsonc
// Insert a solo at second 45, switch style for the extension
{ "songId": "song_abc", "continueAt": 45, "style": "epic guitar solo, rock" }

// Continue from the end in the original style (no params besides songId)
{ "songId": "song_abc" }

// Append a new section with fresh lyrics in the original style
{
  "songId": "song_abc",
  "prompt": "[Bridge]\nAnd the lights came up...\n[Outro]\nFading now",
  "title": "Song (extended)"
}
```

### `generate_sounds`

Ambient sounds / SFX. Uses V5 model only — `model` param is not accepted.

| Param | Type | Notes |
| --- | --- | --- |
| `prompt` *(required)* | string | Max 500. E.g. `"rain on a tin roof"`, `"808 drum loop"`. |
| `soundLoop` | boolean | Loopable output. |
| `soundTempo` | 1–300 | BPM for rhythmic sounds. |
| `soundKey` | `Any` / `C`–`B` / `Cm`–`Bm` | Musical key. Minor keys end in `m`. |

```jsonc
// Ambient loop in a chosen key
{ "prompt": "lo-fi vinyl crackle loop", "soundLoop": true, "soundKey": "Am" }

// Tempo-driven beat loop
{ "prompt": "808 boom-bap drum loop with hi-hats", "soundLoop": true, "soundTempo": 92 }

// One-shot natural sound (no loop, no key)
{ "prompt": "thunderclap with distant rumble" }
```

### `generate_lyrics`

Generate song lyrics from a description. Returns a `taskId` — lyrics surface via the SunoFlow UI/API once ready.

| Param | Type | Notes |
| --- | --- | --- |
| `prompt` *(required)* | string | Max 200. E.g. `"a love song about meeting someone at a coffee shop"`. |

```jsonc
{ "prompt": "a melancholy farewell letter from a soldier to his family" }
```

### `boost_style`

Expand a short genre tag into a rich style prompt. Feed the result into `generate_song.style`.

| Param | Type | Notes |
| --- | --- | --- |
| `description` *(required)* | string | Max 500. E.g. `"chill lofi"` → `"mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, soft boom-bap drums"`. |

```jsonc
// 1: expand the tag
boost_style({ "description": "chill lofi" })
// → { boosted: "mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, soft boom-bap drums" }

// 2: use the boosted prompt
generate_song({
  "title": "Late Night Study",
  "style": "<boosted result>",
  "prompt": "[Verse]\nLamp light on the page...",
  "model": "V5_5"
})
```

---

## Library management

### `list_songs`

Browse the song library. Paginated.

| Param | Type | Notes |
| --- | --- | --- |
| `limit` | 1–100 | Default 20. |
| `cursor` | string | From previous response. |
| `genre` | string | Partial-match on tags. |
| `mood` | string | Partial-match on tags. |
| `status` | `ready` \| `pending` \| `failed` | Filter by generation status. |

```jsonc
// Filter by status + genre
{ "status": "ready", "genre": "lofi", "limit": 10 }

// Mood filter only
{ "mood": "melancholic", "limit": 20 }

// Surface failures for retry review
{ "status": "failed" }

// Paginate the next page from a previous response's cursor
{ "cursor": "<cursor-from-previous-response>", "limit": 50 }
```

### `get_song`

Full song detail. Used both for retrieval and for polling pending generations.

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | |

### `create_playlist`

Create a new playlist. Max 50 playlists per user.

| Param | Type | Notes |
| --- | --- | --- |
| `name` *(required)* | string | Max 100. |
| `description` | string | Max 1000. |

### `add_to_playlist`

Add a song to a playlist. Max 500 songs per playlist. Idempotent — returns `{ alreadyInPlaylist: true }` on duplicate.

| Param | Type | Notes |
| --- | --- | --- |
| `playlistId` *(required)* | string | |
| `songId` *(required)* | string | |

---

## Audio processing

### `separate_vocals`

Stem separation. Song must be `ready`.

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | |
| `type` *(required)* | `separate_vocal` \| `split_stem` | `separate_vocal` = vocal + instrumental (10 credits). `split_stem` = drums + bass + guitar + keyboard + percussion + strings + synth + fx + brass + woodwinds (50 credits). |

```jsonc
// Cheap option — split into vocals + everything-else
{ "songId": "song_abc", "type": "separate_vocal" }

// Full remix prep — 10 individual stems
{ "songId": "song_abc", "type": "split_stem" }
```

### `convert_to_wav`

Convert a `ready` song to lossless WAV. Returns a `taskId`; the download URL surfaces in the SunoFlow UI/API once conversion completes.

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | |

### `generate_midi`

Extract MIDI (per-instrument tracks with pitch/start/end/velocity).

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | Song must be `ready`. |

---

## Visual & video

### `create_music_video`

Render an MP4 with synchronized visuals. Retained 15 days. Returns a `taskId`.

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | Song must be `ready`. |
| `author` | string | Artist name to display in the video. |

```jsonc
// With author overlay
{ "songId": "song_abc", "author": "MC SunoFlow" }

// Minimal — visuals only, no author text
{ "songId": "song_abc" }
```

### `generate_cover_image`

Generate 2 AI cover-art variations. Retained 14 days. Returns a `taskId`.

| Param | Type | Notes |
| --- | --- | --- |
| `songId` *(required)* | string | Song must be `ready`. |

---

## Utility

### `sunoflow_info`

No input. Returns server version + complete tool list with descriptions sourced from the running registry. Use as a discovery probe when unsure which tools are available.

### `get_credits`

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

---

## Custom mode

Setting `title` or `style` on `generate_song` enables **custom mode**:

- `prompt` is treated as literal lyrics text (with optional `[Verse]` / `[Chorus]` / `[Bridge]` structural tags).
- Max `prompt` length jumps from 500 (free-form) to 3000 (V4) / 5000 (V4_5+).
- `style` controls genre/instrumentation independently of `prompt`.

Use custom mode when you have specific lyrics. Use free-form mode (omit `title` + `style`) when you want the model to invent both lyrics and style from a description.

## Model versions

`generate_song` and `extend_song` accept `model`: `V4`, `V4_5`, `V5`, `V5_5`. `V5_5` is the highest-quality choice.

**Match the original model when extending a song.** A `V4` song extended with a `V5_5` request often produces a stylistic seam.

When the caller does not specify a model, the server falls back to its configured default — `sunoflow_info` reports the active default if relevant.

`generate_sounds` uses V5 only — the `model` param is not accepted there.
