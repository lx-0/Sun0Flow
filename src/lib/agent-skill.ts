/**
 * Claude Code skill file content for SunoFlow.
 * Served by GET /api/agent-skill as downloadable markdown.
 */

export const SKILL_MARKDOWN = `---
name: sunoflow
description: SunoFlow — AI music generation and library management
---

# SunoFlow API Skill

SunoFlow is an AI music generation platform powered by the Suno API. Use this skill to generate songs, manage your music library, organize playlists, and more.

## Setup

1. Log in to your SunoFlow instance and go to **Settings > Account > API Keys**
2. Create a new API key — copy the \`sk-...\` value (it is only shown once)
3. All API requests require the header:
   \`\`\`
   Authorization: Bearer sk-YOUR_API_KEY
   \`\`\`
4. Base URL: your SunoFlow instance URL (e.g. \`https://your-app.example.com\`)

## Rate Limits

- **Song generation**: configurable per instance (default 10/hour)
- **Downloads**: 50/hour
- Rate-limited responses return \`429\` with \`Retry-After\` header and \`resetAt\` timestamp

## Credit Costs

| Action | Credits |
|--------|---------|
| Song generation | 10 |
| Song extension | 10 |
| Cover version | 10 |
| Mashup | 10 |
| Lyrics generation | 2 |
| Style boost | 5 |
| Vocal separation (basic) | 10 |
| Stem separation (full) | 50 |

---

## MCP Tools Reference

The SunoFlow MCP server exposes these tools for AI agent use:

### generate_song

Generate a new AI song from a text prompt. Returns a songId — poll \`get_song\` until \`generationStatus === 'ready'\`. Each request produces 2 song variations. If webhooks are configured, results are also pushed automatically (see Webhook Mode below).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`prompt\` | string | Yes | Song description or lyrics. In custom mode (when title/style set), this is lyrics text. Otherwise a style/genre description. Limit depends on model (see Input Validation below). |
| \`title\` | string | No | Song title. Limit depends on model (see Input Validation). Enables custom mode. |
| \`style\` | string | No | Comma-separated style/genre tags (e.g. 'pop, upbeat, summer'). Enables custom mode. |
| \`makeInstrumental\` | boolean | No | If true, generate without vocals. Default false. |
| \`model\` | string | No | Suno model: \`V4\`, \`V4_5\`, \`V5\`, \`V5_5\`. V5_5 is latest/best quality. |
| \`personaId\` | string | No | Voice persona ID to use for generation. |
| \`personaModel\` | string | No | \`voice_persona\` (clone vocal characteristics) or \`style_persona\` (clone style). |
| \`negativeTags\` | string | No | Comma-separated tags to exclude (e.g. 'autotune, screaming'). |
| \`vocalGender\` | string | No | \`m\` for male, \`f\` for female vocals. |
| \`styleWeight\` | number | No | Style guidance intensity (0.00–1.00). Higher = follows style tags more closely. |
| \`weirdnessConstraint\` | number | No | Creative deviation (0.00–1.00). Higher = more experimental output. |
| \`audioWeight\` | number | No | Input audio influence weight (0.00–1.00). For persona/cover features. |

---

### extend_song

Extend/continue an existing song from a specific point. Creates a new variation linked to the original.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID to extend. |
| \`prompt\` | string | No | Lyrics or description for the extension. If omitted, continues original style. Limit depends on model (see Input Validation). |
| \`style\` | string | No | Style/genre tags for the extension. Limit depends on model. |
| \`title\` | string | No | Title for the extended version. Limit depends on model. |
| \`continueAt\` | number | No | Start point in seconds. If omitted, continues from the end. |
| \`model\` | string | No | Model version. Should match the original song's model. |
| \`negativeTags\` | string | No | Tags to exclude from the extension. |
| \`vocalGender\` | string | No | \`m\` or \`f\` vocal gender preference. |
| \`styleWeight\` | number | No | Style guidance intensity (0.00–1.00). |
| \`weirdnessConstraint\` | number | No | Creative deviation (0.00–1.00). |

---

### generate_lyrics

Generate song lyrics from a text description. Returns a taskId for polling.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`prompt\` | string | Yes | Description of lyrics to generate (max 200 chars). E.g. 'a love song about meeting someone at a coffee shop'. |

---

### boost_style

Expand a short style description into a rich, detailed style prompt. Use the result as the \`style\` parameter in \`generate_song\` for more precise output.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`description\` | string | Yes | Short style/genre to expand (e.g. 'chill lofi', 'epic cinematic'). Max 500 chars. |

**Example:** \`'chill lofi'\` → \`'mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, and soft boom-bap drums'\`

---

### separate_vocals

Separate a song into vocal and instrumental stems.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID to separate. |
| \`type\` | string | Yes | \`separate_vocal\`: vocal + instrumental (10 credits). \`split_stem\`: full multi-stem — drums, bass, guitar, keyboard, percussion, strings, synth, fx, brass, woodwinds (50 credits). |

---

### convert_to_wav

Convert a generated song to lossless WAV format.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID to convert. |

---

### generate_midi

Extract MIDI data from a generated song. Returns instrument tracks with note-level data (pitch, start, end, velocity).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID to extract MIDI from. |

---

### create_music_video

Create an MP4 music video with synchronized visual effects. Videos retained for 15 days.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID to create a video for. |
| \`author\` | string | No | Author/artist name to display in the video. |

---

### generate_cover_image

Generate AI cover art images for a completed song. Produces 2 different style images. Images retained for 14 days.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID to generate cover art for. |

---

### generate_sounds

Generate ambient sounds or sound effects from a text prompt. Uses V5 model only.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`prompt\` | string | Yes | Description of the sound (e.g. 'rain on a tin roof', '808 drum loop'). |
| \`soundLoop\` | boolean | No | Enable looped playback for ambient audio or beat loops. |
| \`soundTempo\` | number | No | BPM tempo (1–300). For rhythmic sounds. |
| \`soundKey\` | string | No | Musical key: \`Any\`, \`C\`–\`B\`, \`Cm\`–\`Bm\`. Minor keys end with 'm'. |

---

### get_song

Retrieve full details for a song including play URL, metadata, and lyrics.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`songId\` | string | Yes | The song ID. |

---

### list_songs

Browse the user's song library with optional filters.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`limit\` | number | No | Results per page (1–100, default 20). |
| \`cursor\` | string | No | Pagination cursor from previous call. |
| \`genre\` | string | No | Filter by genre (partial match). |
| \`mood\` | string | No | Filter by mood (partial match). |
| \`status\` | string | No | Filter by status: \`ready\`, \`pending\`, \`failed\`. |

---

### create_playlist

Create a new playlist in the user's library. Max 50 playlists per user.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`name\` | string | Yes | Playlist name (max 100 chars). |
| \`description\` | string | No | Playlist description (max 1000 chars). |

---

### add_to_playlist

Add a song to an existing playlist. Max 500 songs per playlist.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`playlistId\` | string | Yes | The playlist ID. |
| \`songId\` | string | Yes | The song ID to add. |

---

### get_credits

Check the user's remaining generation credits for this month.

**Parameters:** None.

---

## REST API Endpoints

### Generate a Song

\`\`\`
POST /api/generate
\`\`\`

Create a new AI-generated song from a text prompt.

**Request body:**
\`\`\`json
{
  "prompt": "upbeat pop song about summer adventures",
  "title": "Summer Vibes",
  "tags": "pop, upbeat, summer",
  "makeInstrumental": false,
  "personaId": null,
  "model": "V5_5",
  "negativeTags": "autotune",
  "vocalGender": "f",
  "styleWeight": 0.7,
  "weirdnessConstraint": 0.3,
  "audioWeight": 0.5
}
\`\`\`

- \`prompt\` (required): Style/genre description or lyrics (limit depends on model — see Input Validation)
- \`title\` (optional): Song title (limit depends on model) — enables custom mode
- \`tags\` (optional): Comma-separated genre tags — enables custom mode
- \`makeInstrumental\` (optional): If true, generate without vocals
- \`personaId\` (optional): Voice persona ID to use
- \`model\` (optional): \`V4\`, \`V4_5\`, \`V5\`, \`V5_5\` (latest)
- \`negativeTags\` (optional): Tags to exclude from generation
- \`vocalGender\` (optional): \`m\` or \`f\`
- \`styleWeight\` (optional): 0.00–1.00, style guidance intensity
- \`weirdnessConstraint\` (optional): 0.00–1.00, creative deviation
- \`audioWeight\` (optional): 0.00–1.00, input audio influence

**Response (201):**
\`\`\`json
{
  "songs": [
    {
      "id": "uuid",
      "title": "Summer Vibes",
      "prompt": "upbeat pop song about summer adventures",
      "audioUrl": "https://...",
      "imageUrl": "https://...",
      "generationStatus": "pending",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
\`\`\`

**Errors:** \`400\` invalid prompt, \`429\` rate limited

---

### Poll Song Status

\`\`\`
GET /api/songs/{id}/status
\`\`\`

Check generation progress. Poll until \`generationStatus\` is \`ready\` or \`failed\`.

**Response:**
\`\`\`json
{
  "id": "uuid",
  "generationStatus": "ready",
  "audioUrl": "https://...",
  "duration": 180
}
\`\`\`

Status values: \`pending\`, \`ready\`, \`failed\`

---

### List Songs

\`\`\`
GET /api/songs
\`\`\`

List songs in your library with optional filters.

**Query parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| \`q\` | string | Search title and prompt |
| \`status\` | string | Filter by: \`ready\`, \`pending\`, \`failed\` |
| \`minRating\` | number | Minimum star rating (1-5) |
| \`sortBy\` | string | \`newest\` (default), \`oldest\`, \`highest_rated\`, \`title_az\` |
| \`sortDir\` | string | \`asc\` or \`desc\` |
| \`dateFrom\` | string | ISO date — filter songs created after |
| \`dateTo\` | string | ISO date — filter songs created before |
| \`tagId\` | string | Filter by tag ID |

---

### Get Song Details

\`\`\`
GET /api/songs/{id}
\`\`\`

---

### Download Song

\`\`\`
GET /api/songs/{id}/download
\`\`\`

Returns the audio file as a download. Rate limited (50/hour).

---

### Extend a Song

\`\`\`
POST /api/songs/{id}/extend
\`\`\`

Continue/extend an existing song.

**Request body:**
\`\`\`json
{
  "prompt": "add an epic guitar solo",
  "style": "rock, guitar solo",
  "title": "Extended Version",
  "continueAt": 120,
  "model": "V5_5"
}
\`\`\`

---

### Favorite / Unfavorite

\`\`\`
POST /api/songs/{id}/favorite
\`\`\`

Toggle favorite status on a song.

---

### Rate a Song

\`\`\`
POST /api/songs/{id}/rating
\`\`\`

**Request body:**
\`\`\`json
{
  "rating": 5,
  "note": "Love this one!"
}
\`\`\`

---

### Get Song Variations

\`\`\`
GET /api/songs/{id}/variations
\`\`\`

List all variations/extensions of a song.

---

### Separate Vocals

\`\`\`
POST /api/songs/{id}/separate-vocals
\`\`\`

**Request body:**
\`\`\`json
{
  "type": "separate_vocal"
}
\`\`\`

- \`type\`: \`separate_vocal\` (vocal + instrumental) or \`split_stem\` (full multi-stem)

---

### Add Vocals / Instrumental

\`\`\`
POST /api/songs/{id}/add-vocals
POST /api/songs/{id}/add-instrumental
\`\`\`

Layer vocals or instrumental track onto an existing song.

---

### Manage Song Tags

\`\`\`
GET    /api/songs/{id}/tags          — list tags on a song
POST   /api/songs/{id}/tags          — add a tag: { "tagId": "uuid" }
DELETE /api/songs/{id}/tags/{tagId}  — remove a tag
\`\`\`

---

### Batch Song Operations

\`\`\`
POST /api/songs/batch
\`\`\`

**Request body:**
\`\`\`json
{
  "action": "favorite",
  "songIds": ["uuid1", "uuid2"]
}
\`\`\`

Actions: \`favorite\`, \`unfavorite\`, \`delete\`

---

### List Favorite Songs

\`\`\`
GET /api/songs/favorites
\`\`\`

---

### Share a Song

\`\`\`
POST /api/songs/{id}/share
\`\`\`

---

## Playlists

### List Playlists

\`\`\`
GET /api/playlists
\`\`\`

### Create Playlist

\`\`\`
POST /api/playlists
\`\`\`

**Request body:**
\`\`\`json
{
  "name": "My Playlist",
  "description": "Optional description"
}
\`\`\`

Max 50 playlists per user. Name max 100 characters.

### Get / Update / Delete Playlist

\`\`\`
GET    /api/playlists/{id}
PATCH  /api/playlists/{id}   — { "name": "New Name", "description": "Updated" }
DELETE /api/playlists/{id}
\`\`\`

### Manage Playlist Songs

\`\`\`
GET    /api/playlists/{id}/songs              — list songs in playlist
POST   /api/playlists/{id}/songs              — { "songId": "uuid" }
DELETE /api/playlists/{id}/songs/{songId}     — remove song
POST   /api/playlists/{id}/reorder            — { "songIds": ["uuid1", "uuid2", ...] }
\`\`\`

---

## Tags

### List / Create Tags

\`\`\`
GET  /api/tags                     — list all tags
POST /api/tags                     — { "name": "chill", "color": "#3b82f6" }
\`\`\`

### Get / Update / Delete Tag

\`\`\`
GET    /api/tags/{id}
PATCH  /api/tags/{id}              — { "name": "updated", "color": "#ef4444" }
DELETE /api/tags/{id}
\`\`\`

---

## Personas (Voice Presets)

### List / Create Personas

\`\`\`
GET  /api/personas                 — list voice personas
POST /api/personas                 — create a new persona
\`\`\`

### Get / Update / Delete Persona

\`\`\`
GET    /api/personas/{id}
PATCH  /api/personas/{id}
DELETE /api/personas/{id}
\`\`\`

Max 50 personas per user.

---

## Prompt Templates

### List / Create Templates

\`\`\`
GET  /api/prompt-templates         — list prompt templates
POST /api/prompt-templates         — create a template
\`\`\`

### Get / Update / Delete Template

\`\`\`
GET    /api/prompt-templates/{id}
PATCH  /api/prompt-templates/{id}
DELETE /api/prompt-templates/{id}
\`\`\`

### Daily Prompts

\`\`\`
GET /api/prompts/daily             — get daily prompt suggestions
\`\`\`

---

## Mashup

\`\`\`
POST /api/mashup
\`\`\`

Mix multiple audio sources into a mashup.

**Request body:**
\`\`\`json
{
  "songIds": ["uuid1", "uuid2"],
  "prompt": "blend these into a chill remix",
  "style": "lo-fi, chill",
  "title": "My Mashup"
}
\`\`\`

---

## Style Boost

\`\`\`
POST /api/style-boost
\`\`\`

Enhance a style/genre description prompt.

**Request body:**
\`\`\`json
{ "description": "chill lofi" }
\`\`\`

**Response:**
\`\`\`json
{ "boosted": "mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, and soft boom-bap drums" }
\`\`\`

---

## Search

\`\`\`
GET /api/search?q=query
\`\`\`

Search across songs (title + prompt) and playlists (name). Returns top 10 songs and 5 playlists.

---

## Profile & Stats

\`\`\`
GET   /api/profile                 — get your profile
PATCH /api/profile                 — update display name, bio, avatar
GET   /api/profile/stats           — generation stats
GET   /api/profile/preferences     — get preferences
PATCH /api/profile/preferences     — update preferences
\`\`\`

---

## Rate Limit Status

\`\`\`
GET /api/rate-limit                — check current rate limit
GET /api/rate-limit/status         — detailed rate limit info
\`\`\`

---

## Export Data

\`\`\`
GET /api/export?format=json
GET /api/export?format=csv
\`\`\`

---

## Notifications

\`\`\`
GET  /api/notifications                    — list notifications
POST /api/notifications/{id}/read          — mark one as read
POST /api/notifications/read-all           — mark all as read
\`\`\`

---

## Common Workflows

### Generate a Song with Style Control
1. \`boost_style\` with a short genre description to get a detailed style prompt
2. \`generate_song\` with the boosted style, model \`V5_5\`, and tuning parameters
3. Poll \`get_song\` until \`generationStatus === 'ready'\`

### Generate and Extend a Song
1. \`generate_song\` — create the initial song
2. Poll \`get_song\` until ready
3. \`extend_song\` with \`continueAt\` to add a new section from a specific point

### Create Lyrics Then Generate
1. \`generate_lyrics\` with a description
2. Use the generated lyrics as the \`prompt\` in \`generate_song\` with \`title\` and \`style\` set (custom mode)

### Full Production Pipeline
1. \`generate_song\` — create the track
2. \`separate_vocals\` — extract stems for mixing
3. \`generate_midi\` — get notation data
4. \`create_music_video\` — create a visual
5. \`generate_cover_image\` — create album art
6. \`convert_to_wav\` — export lossless audio

### Generate Ambient Sounds
1. \`generate_sounds\` with a description, optional \`soundLoop\`, \`soundTempo\`, \`soundKey\`
2. Poll \`get_song\` until ready

## Webhook Mode

SunoFlow supports two result-delivery modes for async operations (song generation, extension, etc.):

### Polling (default)

Poll \`GET /api/songs/{id}/status\` until \`generationStatus\` is \`ready\` or \`failed\`. Works out of the box with no extra configuration.

### Push via Webhooks

When the server is configured with \`SUNO_WEBHOOK_SECRET\`, async operations automatically register a callback URL with the Suno API. Results are pushed to \`POST /api/webhooks/suno?token={SECRET}\` as soon as they complete — no polling needed.

- Webhook mode is transparent to callers; the same MCP tools and REST endpoints work in both modes
- Poll-based status checks remain available as a fallback even when webhooks are active
- Webhook payloads are authenticated via the \`token\` query parameter

---

## Input Validation

All inputs are validated before being sent to the Suno API. Character limits vary by model version.

### Model-Specific Limits

| Field | V4 | V4_5 / V4_5PLUS / V5 / V5_5 | V4_5ALL |
|-------|----|-------------------------------|---------|
| \`prompt\` (custom mode) | 3,000 chars | 5,000 chars | 5,000 chars |
| \`style\` | 200 chars | 1,000 chars | 1,000 chars |
| \`title\` | 80 chars | 100 chars | 80 chars |

### Fixed Limits

| Field | Max |
|-------|-----|
| \`prompt\` (non-custom mode, no title/style set) | 500 chars |
| \`prompt\` for \`generate_lyrics\` | 200 chars |
| \`prompt\` for \`generate_sounds\` | 500 chars |
| \`author\` (music video) | 50 chars |

### Numeric Ranges

| Parameter | Range |
|-----------|-------|
| \`soundTempo\` | 1–300 BPM |
| \`styleWeight\` | 0.00–1.00 |
| \`weirdnessConstraint\` | 0.00–1.00 |
| \`audioWeight\` | 0.00–1.00 |
| Infill/replace-section duration | 6–60 seconds |
| Persona vocal segment duration | 10–30 seconds |

Validation errors throw before any API call is made, returning a \`400\` with a descriptive message.

---

## Error Handling

API errors include a structured \`code\` field for programmatic handling. Check the \`code\` field rather than parsing status codes directly.

### Error Response Format

\`\`\`json
{
  "error": "Insufficient credits to generate song",
  "code": "INSUFFICIENT_CREDITS",
  "details": null
}
\`\`\`

### Error Codes

| HTTP Status | \`code\` | Meaning | Recommended Action |
|-------------|--------|---------|-------------------|
| 400 | — | Bad request — missing or invalid parameters | Fix the request body |
| 401 / 403 | \`AUTH_ERROR\` | Invalid or missing API key | Check API key configuration |
| 402 | \`INSUFFICIENT_CREDITS\` | Not enough Suno credits | Call \`get_credits\` to check balance |
| 404 | — | Resource not found or not owned by user | Verify the resource ID |
| 409 | \`CONFLICT\` | Resource conflict (e.g. duplicate operation) | Wait and retry, or check existing state |
| 422 | \`VALIDATION_ERROR\` | Suno API rejected the input | Check \`details\` field for specifics |
| 429 | \`RATE_LIMITED\` | Too many requests | Respect \`Retry-After\` header |
| 451 | \`COMPLIANCE_BLOCK\` | Content blocked for policy/legal reasons | Modify the prompt content |
| 5xx | \`SERVER_ERROR\` | Upstream server error | Retry after a short delay |
| — | \`TIMEOUT\` | Request timed out | Retry; may indicate Suno API issues |

### Handling 402 (Insufficient Credits)

When a generation endpoint returns \`402\`, the response includes the user's remaining credit balance. Use \`get_credits\` to check the balance before retrying with a different operation.

### Handling 422 (Validation Error)

The \`details\` field contains the full validation error payload from the Suno API:

\`\`\`json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "validation": { "field": "prompt", "message": "exceeds maximum length" }
  }
}
\`\`\`
`;

