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

---

## Endpoints

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
  "personaId": null
}
\`\`\`

- \`prompt\` (required): Style/genre description
- \`title\` (optional): Song title
- \`tags\` (optional): Comma-separated genre tags
- \`makeInstrumental\` (optional): If true, generate without vocals
- \`personaId\` (optional): Voice persona ID to use

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

**Response:**
\`\`\`json
{
  "songs": [
    {
      "id": "uuid",
      "title": "Song Title",
      "prompt": "description",
      "audioUrl": "https://...",
      "imageUrl": "https://...",
      "generationStatus": "ready",
      "rating": 4,
      "isFavorite": true,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "songTags": [{ "tag": { "id": "uuid", "name": "pop" } }]
    }
  ],
  "total": 42
}
\`\`\`

---

### Get Song Details

\`\`\`
GET /api/songs/{id}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "uuid",
  "title": "Song Title",
  "prompt": "description",
  "audioUrl": "https://...",
  "imageUrl": "https://...",
  "generationStatus": "ready",
  "rating": 4,
  "isFavorite": true,
  "favoriteCount": 1,
  "duration": 180,
  "songTags": [{ "tag": { "id": "uuid", "name": "pop" } }],
  "createdAt": "2025-01-01T00:00:00.000Z"
}
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
  "continueAt": 120
}
\`\`\`

---

### Favorite / Unfavorite

\`\`\`
POST /api/songs/{id}/favorite
\`\`\`

Toggle favorite status on a song.

**Response:**
\`\`\`json
{ "isFavorite": true }
\`\`\`

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

- \`rating\` (required): 1-5 stars
- \`note\` (optional): Text note

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

Split a track into vocal and instrumental stems.

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

Returns all favorited songs.

---

### Share a Song

\`\`\`
POST /api/songs/{id}/share
\`\`\`

Create a public share link.

**Response:**
\`\`\`json
{
  "shareToken": "abc123",
  "shareUrl": "/s/abc123"
}
\`\`\`

---

## Playlists

### List Playlists

\`\`\`
GET /api/playlists
\`\`\`

**Response:**
\`\`\`json
{
  "playlists": [
    {
      "id": "uuid",
      "name": "My Playlist",
      "description": "Chill vibes",
      "_count": { "songs": 12 }
    }
  ]
}
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

## Search

\`\`\`
GET /api/search?q=query
\`\`\`

Search across songs (title + prompt) and playlists (name). Returns top 10 songs and 5 playlists.

**Response:**
\`\`\`json
{
  "songs": [{ "id": "uuid", "title": "...", "prompt": "..." }],
  "playlists": [{ "id": "uuid", "name": "...", "_count": { "songs": 5 } }]
}
\`\`\`

---

## Mashup

\`\`\`
POST /api/mashup
\`\`\`

Mix multiple audio sources into a mashup.

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

**Response:**
\`\`\`json
{
  "remaining": 8,
  "limit": 10,
  "resetAt": "2025-01-01T01:00:00.000Z"
}
\`\`\`

---

## Export Data

\`\`\`
GET /api/export?format=json
GET /api/export?format=csv
\`\`\`

Export all songs and playlists metadata.

---

## Notifications

\`\`\`
GET  /api/notifications                    — list notifications
POST /api/notifications/{id}/read          — mark one as read
POST /api/notifications/read-all           — mark all as read
\`\`\`

---

## Common Workflows

### Generate a Song
1. \`POST /api/generate\` with your prompt
2. Poll \`GET /api/songs/{id}/status\` until \`generationStatus\` is \`ready\`
3. Download with \`GET /api/songs/{id}/download\`

### Search My Library
1. \`GET /api/songs?q=summer&sortBy=highest_rated\`
2. Or use \`GET /api/search?q=summer\` for cross-entity search

### Create a Playlist
1. \`POST /api/playlists\` — create the playlist
2. \`POST /api/playlists/{id}/songs\` — add songs one by one
3. \`POST /api/playlists/{id}/reorder\` — reorder if needed

### Organize with Tags
1. \`POST /api/tags\` — create tags like "chill", "workout"
2. \`POST /api/songs/{id}/tags\` — assign tags to songs
3. \`GET /api/songs?tagId={tagId}\` — filter by tag

## Error Codes

| Code | Meaning |
|------|---------|
| 400  | Bad request — missing or invalid parameters |
| 401  | Unauthorized — invalid or missing API key |
| 403  | Forbidden — admin-only endpoint |
| 404  | Not found — resource doesn't exist or isn't yours |
| 429  | Rate limited — check \`Retry-After\` header |
| 500  | Server error — try again later |
`;
