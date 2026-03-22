# sunoapi.org API Reference

> Upstream API documentation for the Suno AI music generation service.
> Base URL: `https://api.sunoapi.org/api/v1`
> File Upload Base URL: `https://sunoapiorg.redpandaai.co`
> Auth: `Authorization: Bearer <API_KEY>`

## Models

| Model | Max Duration | Notes |
|-------|-------------|-------|
| V4 | 4 min | Enhanced vocals |
| V4_5 | 8 min | Smart prompts, faster generation |
| V4_5PLUS | 8 min | Richer tones |
| V4_5ALL | 8 min | Better song structure |
| V5 | — | Latest cutting-edge model |

## Rate Limits & Retention

- **Rate limit**: 20 requests per 10 seconds
- **Generated files retained**: 15 days (MIDI: 14 days)
- **Uploaded files retained**: 3 days (uploads are free)

## Common Response Envelope

All endpoints return:

```json
{
  "code": 200,
  "msg": "success",
  "data": { ... }
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Invalid parameters |
| 401 | Unauthorized |
| 405 | Method not allowed |
| 413 | Content too long |
| 429 | Insufficient credits |
| 430 | High frequency / rate limited |
| 455 | Maintenance |
| 500 | Server error |

---

## Music Generation

### Generate Music

**POST** `/generate`

Generates 2 songs per request asynchronously.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Conditional | Lyrics or description. 500 chars (non-custom); 3000 (V4 custom); 5000 (V4.5+/V5 custom) |
| `customMode` | boolean | Yes | Enable advanced settings (style/title) |
| `instrumental` | boolean | Yes | Generate without vocals |
| `model` | string | Yes | V4, V4_5, V4_5PLUS, V4_5ALL, V5 |
| `callBackUrl` | string | Yes | Webhook URL for completion |
| `style` | string | Conditional | Music style. 200 chars (V4); 1000 chars (V4.5+/V5). Required if customMode=true |
| `title` | string | Conditional | Track title. 80 chars (V4/V4_5ALL); 100 chars (V4_5/V4_5PLUS/V5). Required if customMode=true |
| `personaId` | string | No | Persona identifier |
| `personaModel` | string | No | `style_persona` (default) or `voice_persona` |
| `negativeTags` | string | No | Styles to exclude |
| `vocalGender` | string | No | `m` or `f` |
| `styleWeight` | number | No | Style guidance (0.00–1.00) |
| `weirdnessConstraint` | number | No | Creative deviation (0.00–1.00) |
| `audioWeight` | number | No | Audio influence weight (0.00–1.00) |

**Conditional logic:**
- `customMode: true` + `instrumental: true` → requires: style, title
- `customMode: true` + `instrumental: false` → requires: style, title, prompt
- `customMode: false` → requires: prompt only

**Response:** `{ "data": { "taskId": "..." } }`

### Extend Music

**POST** `/generate/extend`

Extends an existing track. Model must match source audio.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audioId` | string | Yes | Source track ID |
| `defaultParamFlag` | boolean | Yes | Use custom params (true) or source defaults (false) |
| `model` | string | Yes | Must match source audio model |
| `callBackUrl` | string | Yes | Webhook URL |
| `prompt` | string | When flag=true | Extension description |
| `style` | string | When flag=true | Music style |
| `title` | string | When flag=true | Track title |
| `continueAt` | number | When flag=true | Extension start point (seconds) |
| + all style tuning params | | No | personaId, negativeTags, vocalGender, etc. |

### Upload and Cover Audio

**POST** `/generate/upload-cover`

Transform uploaded audio into a new style.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploadUrl` | string | Yes | Audio file URL (max 8 min; 1 min for V4_5ALL) |
| `customMode` | boolean | Yes | Enable custom settings |
| `instrumental` | boolean | Yes | Instrumental only |
| `model` | string | Yes | Model version |
| `callBackUrl` | string | Yes | Webhook URL |
| `prompt`, `style`, `title` | string | Conditional | Same rules as Generate Music |
| + all style tuning params | | No | |

### Upload and Extend Audio

**POST** `/generate/upload-extend`

Upload audio and extend it with AI continuation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploadUrl` | string | Yes | Audio file URL (max 8 min; 1 min for V4_5ALL) |
| `defaultParamFlag` | boolean | Yes | Use custom params or defaults |
| `model` | string | Yes | Model version |
| `callBackUrl` | string | Yes | Webhook URL |
| `instrumental` | boolean | No | Whether audio is instrumental |
| `prompt`, `style`, `title`, `continueAt` | | When flag=true | Custom extension params |
| + all style tuning params | | No | |

### Add Vocals

**POST** `/generate/add-vocals`

Layer AI vocals over an instrumental track.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploadUrl` | string | Yes | Instrumental audio URL |
| `prompt` | string | Yes | Vocal description |
| `title` | string | Yes | Track title (max 100 chars) |
| `style` | string | Yes | Musical style |
| `negativeTags` | string | Yes | Styles to exclude |
| `callBackUrl` | string | Yes | Webhook URL |
| `vocalGender` | string | No | `m` or `f` |
| `styleWeight` | number | No | 0.00–1.00 |
| `weirdnessConstraint` | number | No | 0.00–1.00 |
| `audioWeight` | number | No | 0.00–1.00 |
| `model` | string | No | V4_5PLUS (default) or V5 |

### Add Instrumental

**POST** `/generate/add-instrumental`

Generate backing music for a vocal track.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploadUrl` | string | Yes | Vocal audio URL |
| `title` | string | Yes | Track title (max 100 chars) |
| `tags` | string | Yes | Desired style/characteristics |
| `negativeTags` | string | Yes | Styles to exclude |
| `callBackUrl` | string | Yes | Webhook URL |
| `vocalGender` | string | No | `m` or `f` |
| `styleWeight` | number | No | 0.00–1.00 |
| `audioWeight` | number | No | 0.00–1.00 |
| `weirdnessConstraint` | number | No | 0.00–1.00 |
| `model` | string | No | V4_5PLUS (default) or V5 |

### Generate Mashup

**POST** `/generate/mashup`

Blend two audio files into one track.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uploadUrlList` | string[] | Yes | Exactly 2 audio file URLs |
| `customMode` | boolean | Yes | Enable custom settings |
| `model` | string | Yes | Model version |
| `callBackUrl` | string | Yes | Webhook URL |
| `instrumental` | boolean | No | Exclude vocals |
| `prompt` | string | Conditional | Required if customMode=false, or customMode=true + instrumental=false |
| `style`, `title` | string | When customMode=true | Style and title |
| + style tuning params | | No | vocalGender, styleWeight, etc. |

### Replace Section

**POST** `/generate/replace-section`

Replace a specific time segment of an existing track.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Original task ID |
| `audioId` | string | Yes | Audio track ID |
| `prompt` | string | Yes | Replacement content description |
| `tags` | string | Yes | Music style |
| `title` | string | Yes | Track title |
| `infillStartS` | number | Yes | Start time (seconds, 2 decimals) |
| `infillEndS` | number | Yes | End time (seconds, 2 decimals) |
| `negativeTags` | string | No | Styles to exclude |
| `callBackUrl` | string | No | Webhook URL |

**Constraints:** Range must be 6–60 seconds and ≤50% of original track length.

---

## Lyrics

### Generate Lyrics

**POST** `/lyrics`

Generate AI lyrics from a description.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Lyrics description (max 200 chars) |
| `callBackUrl` | string | Yes | Webhook URL |

### Get Timestamped Lyrics

**POST** `/generate/get-timestamped-lyrics`

Get word-level synchronized lyrics for a track.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Music generation task ID |
| `audioId` | string | Yes | Audio track ID |

**Response data:**
```json
{
  "alignedWords": [
    { "word": "Hello", "success": true, "startS": 0.5, "endS": 1.0, "palign": 1 }
  ],
  "waveformData": [0.1, 0.5, ...],
  "hootCer": 0.95,
  "isStreamed": false
}
```

---

## Audio Processing

### Vocal & Instrument Separation

**POST** `/vocal-removal/generate`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Source task ID |
| `audioId` | string | Yes | Audio track ID |
| `type` | string | Yes | `separate_vocal` (10 credits) or `split_stem` (50 credits) |
| `callBackUrl` | string | Yes | Webhook URL |

**`separate_vocal` returns:** vocal_url, instrumental_url
**`split_stem` returns:** vocal, backing_vocals, drums, bass, guitar, keyboard, strings, brass, woodwinds, percussion, synth, fx URLs

### Convert to WAV

**POST** `/wav/generate`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Source task ID |
| `audioId` | string | Yes | Audio track ID |
| `callBackUrl` | string | Yes | Webhook URL |

### Generate MIDI

**POST** `/midi/generate`

Convert separated audio to MIDI. Requires prior vocal separation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Completed vocal separation task ID |
| `callBackUrl` | string | Yes | Webhook URL |
| `audioId` | string | No | Specific separated track to convert |

Processing time: 30–90 seconds. MIDI retained 14 days.

---

## Music Video

### Create Music Video

**POST** `/mp4/generate`

Generate MP4 with synchronized visual effects.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Source task ID |
| `audioId` | string | Yes | Audio track ID |
| `callBackUrl` | string | Yes | Webhook URL |
| `author` | string | No | Artist name (max 50 chars) |
| `domainName` | string | No | Watermark text (max 50 chars) |

---

## Persona & Style

### Generate Persona

**POST** `/generate/generate-persona`

Create a reusable musical identity from an existing track.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | Source task ID |
| `audioId` | string | Yes | Audio track ID |
| `name` | string | Yes | Persona name |
| `description` | string | Yes | Musical qualities description |
| `vocalStart` | number | No | Segment start (seconds, default 0.0) |
| `vocalEnd` | number | No | Segment end (seconds, default 30.0) |
| `style` | string | No | Genre label |

**Constraint:** Vocal segment must be 10–30 seconds.

**Response:** `{ "data": { "personaId": "...", "name": "...", "description": "..." } }`

### Boost Style

**POST** `/style/generate`

Expand a brief style description into detailed style instructions (V4.5+ feature).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | Style description (e.g., "Pop, Mysterious") |

**Response:** Synchronous — returns expanded style text, credits consumed/remaining.

---

## Status & Credits

### Get Music Generation Details

**GET** `/generate/record-info?taskId={taskId}`

Poll for task status and results.

**Response data:**
```json
{
  "taskId": "...",
  "status": "PENDING | TEXT_SUCCESS | FIRST_SUCCESS | SUCCESS | CREATE_TASK_FAILED | GENERATE_AUDIO_FAILED | CALLBACK_EXCEPTION | SENSITIVE_WORD_ERROR",
  "operationType": "generate | extend | upload_cover | upload_extend",
  "errorMessage": null,
  "response": {
    "sunoData": [
      {
        "id": "audioId",
        "audioUrl": "...",
        "streamAudioUrl": "...",
        "imageUrl": "...",
        "prompt": "...",
        "modelName": "...",
        "title": "...",
        "tags": "...",
        "duration": 180,
        "createTime": "..."
      }
    ]
  }
}
```

### Get Remaining Credits

**GET** `/generate/credit`

No parameters. Returns integer credit balance.

---

## File Uploads

Base URL: `https://sunoapiorg.redpandaai.co`

All uploads are **free**. Files auto-deleted after **3 days**.

### Base64 Upload

**POST** `/api/file-base64-upload`

Best for files ≤10MB. ~33% transmission overhead.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | Yes | Base64-encoded file data (or data URL) |

### File Stream Upload

**POST** `/api/file-stream-upload`

Best for files >10MB. Uses multipart/form-data.

### URL Upload

**POST** `/api/file-url-upload`

Best for remote files. 30-second timeout, ≤100MB recommended.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | HTTP/HTTPS URL of the file |

**Upload response:**
```json
{
  "success": true,
  "code": 200,
  "data": {
    "fileId": "file_abc123",
    "fileUrl": "https://sunoapiorg.redpandaai.co/files/...",
    "downloadUrl": "https://sunoapiorg.redpandaai.co/download/...",
    "expiresAt": "2025-01-18T10:30:00Z"
  }
}
```

---

## Callback System

Most async endpoints support a `callBackUrl` parameter. The server POSTs JSON to this URL upon completion.

**Callback stages:**
- `text` — lyrics ready
- `first` — first track complete
- `complete` — all tracks finished

**Callback mechanics:**
- Method: POST with `application/json`
- Timeout: 15 seconds
- Retries: 3 attempts before stopping
- Acknowledge with: `{ "status": "received" }` (HTTP 200)

Our client uses a no-op callback URL and polls via `getTaskStatus()` instead.
