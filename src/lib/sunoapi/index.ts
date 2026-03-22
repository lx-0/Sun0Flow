/**
 * sunoapi.org API client
 *
 * Tree-shakeable, no side-effects on import.
 * API key is read from SUNOAPI_KEY env var at call time — never hard-coded.
 *
 * Covers all sunoapi.org v1 endpoints:
 *   - Music generation, extension, mashup, section replacement
 *   - Upload & cover / upload & extend
 *   - Add vocals / add instrumental
 *   - Lyrics generation & timestamped lyrics
 *   - Vocal/instrument separation, WAV conversion, MIDI generation
 *   - Music video creation
 *   - Persona generation, style boost
 *   - Credits query, task status polling
 *   - File uploads (base64, stream, URL)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SongStatus = "pending" | "streaming" | "complete" | "error";

export type TaskStatus =
  | "PENDING"
  | "TEXT_SUCCESS"
  | "FIRST_SUCCESS"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export type SunoModel = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5";

export type VocalGender = "m" | "f";

export type PersonaModel = "style_persona" | "voice_persona";

export type SeparationType = "separate_vocal" | "split_stem";

export interface SunoSong {
  id: string;
  title: string;
  prompt: string;
  tags?: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  duration?: number;
  status: SongStatus;
  model?: string;
  lyrics?: string;
  createdAt: string;
}

/** Shared optional parameters for generation endpoints that support style tuning. */
export interface StyleTuningOptions {
  personaId?: string;
  personaModel?: PersonaModel;
  negativeTags?: string;
  vocalGender?: VocalGender;
  /** Style guidance intensity (0.00–1.00) */
  styleWeight?: number;
  /** Creative deviation control (0.00–1.00) */
  weirdnessConstraint?: number;
  /** Input audio influence weight (0.00–1.00) */
  audioWeight?: number;
}

export interface GenerateSongOptions extends StyleTuningOptions {
  style?: string;
  title?: string;
  instrumental?: boolean;
  model?: SunoModel;
}

export interface GenerateResult {
  taskId: string;
}

export interface TaskStatusResult {
  taskId: string;
  status: TaskStatus;
  songs: SunoSong[];
  errorMessage?: string | null;
  /** The operation that created this task */
  operationType?: string;
}

export interface ExtendMusicOptions extends StyleTuningOptions {
  audioId: string;
  model?: SunoModel;
  /** When true, use custom params (prompt/style/title/continueAt). When false, use source defaults. */
  defaultParamFlag?: boolean;
  prompt?: string;
  style?: string;
  title?: string;
  /** Start extension point in seconds */
  continueAt?: number;
}

export interface UploadCoverOptions extends StyleTuningOptions {
  uploadUrl: string;
  customMode?: boolean;
  instrumental?: boolean;
  model?: SunoModel;
  prompt?: string;
  style?: string;
  title?: string;
}

export interface UploadExtendOptions extends StyleTuningOptions {
  uploadUrl: string;
  model?: SunoModel;
  defaultParamFlag?: boolean;
  instrumental?: boolean;
  prompt?: string;
  style?: string;
  title?: string;
  continueAt?: number;
}

export interface AddVocalsOptions {
  uploadUrl: string;
  prompt: string;
  title: string;
  style: string;
  negativeTags?: string;
  vocalGender?: VocalGender;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  model?: "V4_5PLUS" | "V5";
}

export interface AddInstrumentalOptions {
  uploadUrl: string;
  title: string;
  tags: string;
  negativeTags?: string;
  vocalGender?: VocalGender;
  styleWeight?: number;
  audioWeight?: number;
  weirdnessConstraint?: number;
  model?: "V4_5PLUS" | "V5";
}

export interface GenerateLyricsOptions {
  prompt: string;
}

export interface LyricsResult {
  taskId: string;
}

export interface TimestampedWord {
  word: string;
  success: boolean;
  startS: number;
  endS: number;
  palign: number;
}

export interface TimestampedLyricsResult {
  alignedWords: TimestampedWord[];
  waveformData: number[];
  hootCer: number;
  isStreamed: boolean;
}

export interface SeparateVocalsOptions {
  taskId: string;
  audioId: string;
  type: SeparationType;
}

export interface ConvertToWavOptions {
  taskId: string;
  audioId: string;
}

export interface MusicVideoOptions {
  taskId: string;
  audioId: string;
  author?: string;
  domainName?: string;
}

export interface GeneratePersonaOptions {
  taskId: string;
  audioId: string;
  name: string;
  description: string;
  vocalStart?: number;
  vocalEnd?: number;
  style?: string;
}

export interface PersonaResult {
  personaId: string;
  name: string;
  description: string;
}

export interface MashupOptions extends StyleTuningOptions {
  uploadUrlList: [string, string];
  customMode?: boolean;
  instrumental?: boolean;
  model?: SunoModel;
  prompt?: string;
  style?: string;
  title?: string;
}

export interface ReplaceSectionOptions {
  taskId: string;
  audioId: string;
  prompt: string;
  tags: string;
  title: string;
  /** Start of section to replace, in seconds */
  infillStartS: number;
  /** End of section to replace, in seconds */
  infillEndS: number;
  negativeTags?: string;
}

export interface GenerateMidiOptions {
  taskId: string;
  audioId?: string;
}

export interface BoostStyleResult {
  taskId: string;
  param: string;
  result: string;
  creditsConsumed: number;
  creditsRemaining: number;
}

export interface FileUploadResult {
  fileId: string;
  fileUrl: string;
  downloadUrl: string;
  expiresAt: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class SunoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "SunoApiError";
    // Restore prototype chain for instanceof checks in transpiled envs
    Object.setPrototypeOf(this, SunoApiError.prototype);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const BASE_URL = "https://api.sunoapi.org/api/v1";
const FILE_UPLOAD_BASE_URL = "https://sunoapiorg.redpandaai.co";

/** Use a no-op callback URL — we poll for results instead of receiving callbacks */
const NOOP_CALLBACK_URL = "https://localhost/noop";

const DEFAULT_MODEL: SunoModel = "V4";

/** Statuses that should trigger a retry */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);

    if (res.ok) return res;

    if (!isRetryable(res.status) || attempt >= maxRetries) {
      let message: string;
      try {
        const body = (await res.json()) as { msg?: string; message?: string; error?: string };
        message = body.msg ?? body.message ?? body.error ?? res.statusText;
      } catch {
        message = res.statusText;
      }
      throw new SunoApiError(res.status, message);
    }

    // Exponential back-off: 200ms, 400ms, 800ms …
    const delay = 200 * Math.pow(2, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }
}

function buildHeaders(apiKey?: string): HeadersInit {
  const key = apiKey || process.env.SUNOAPI_KEY;
  if (!key) {
    throw new SunoApiError(0, "SUNOAPI_KEY environment variable is not set");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

/** Extract taskId from a standard { code, msg, data: { taskId } } response */
async function extractTaskId(res: Response, context: string): Promise<string> {
  const json = (await res.json()) as { code?: number; msg?: string; data?: { taskId?: string } };
  if (!json.data?.taskId) {
    throw new SunoApiError(500, `No taskId returned from ${context}`);
  }
  return json.data.taskId;
}

/** Append style-tuning fields to a request body if present */
function applyStyleTuning(body: Record<string, unknown>, opts: StyleTuningOptions): void {
  if (opts.personaId != null) body.personaId = opts.personaId;
  if (opts.personaModel != null) body.personaModel = opts.personaModel;
  if (opts.negativeTags != null) body.negativeTags = opts.negativeTags;
  if (opts.vocalGender != null) body.vocalGender = opts.vocalGender;
  if (opts.styleWeight != null) body.styleWeight = opts.styleWeight;
  if (opts.weirdnessConstraint != null) body.weirdnessConstraint = opts.weirdnessConstraint;
  if (opts.audioWeight != null) body.audioWeight = opts.audioWeight;
}

/** Map raw API song data (snake_case) to our SunoSong interface */
function mapRawSong(raw: Record<string, unknown>): SunoSong {
  return {
    id: (raw.id as string) ?? "",
    title: (raw.title as string) ?? "",
    prompt: (raw.prompt as string) ?? "",
    tags: (raw.tags as string) ?? undefined,
    audioUrl: (raw.audio_url as string) ?? (raw.audioUrl as string) ?? "",
    streamAudioUrl: (raw.stream_audio_url as string) ?? (raw.streamAudioUrl as string) ?? undefined,
    imageUrl: (raw.image_url as string) ?? (raw.imageUrl as string) ?? undefined,
    duration: (raw.duration as number) ?? undefined,
    status: "pending",
    model: (raw.model_name as string) ?? (raw.modelName as string) ?? undefined,
    lyrics: (raw.prompt as string) ?? undefined,
    createdAt: (raw.createTime as string) ?? (raw.createdAt as string) ?? new Date().toISOString(),
  };
}

/** Map task status to our SongStatus */
function taskStatusToSongStatus(status: TaskStatus): SongStatus {
  if (status === "SUCCESS") return "complete";
  if (
    status === "CREATE_TASK_FAILED" ||
    status === "GENERATE_AUDIO_FAILED" ||
    status === "CALLBACK_EXCEPTION" ||
    status === "SENSITIVE_WORD_ERROR"
  ) {
    return "error";
  }
  return "pending";
}

// ─── Music Generation ─────────────────────────────────────────────────────────

/**
 * Generate songs from a text prompt.
 * Returns a taskId — songs are generated asynchronously (2 songs per request).
 * Poll with getTaskStatus() to get the completed songs.
 */
export async function generateSong(
  prompt: string,
  options: GenerateSongOptions = {},
  apiKey?: string
): Promise<GenerateResult> {
  const instrumental = options.instrumental ?? false;
  const customMode = !!(options.title || options.style);

  const body: Record<string, unknown> = {
    prompt,
    instrumental,
    customMode,
    model: options.model ?? DEFAULT_MODEL,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.style) body.style = options.style;
  if (options.title) body.title = options.title;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "generate API");
  return { taskId };
}

/**
 * Extend an existing song. The model must match the source audio's model.
 * Set defaultParamFlag=true and provide prompt/style/title/continueAt for custom extension.
 */
export async function extendMusic(
  options: ExtendMusicOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    audioId: options.audioId,
    defaultParamFlag: options.defaultParamFlag ?? false,
    model: options.model ?? DEFAULT_MODEL,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  if (options.continueAt != null) body.continueAt = options.continueAt;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/extend`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "extend API");
  return { taskId };
}

/**
 * Upload audio and create a cover version in a new style.
 */
export async function uploadAndCover(
  options: UploadCoverOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const customMode = options.customMode ?? false;
  const instrumental = options.instrumental ?? false;

  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    customMode,
    instrumental,
    model: options.model ?? DEFAULT_MODEL,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/upload-cover`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "upload-cover API");
  return { taskId };
}

/**
 * Upload audio and extend it with AI-generated continuation.
 */
export async function uploadAndExtend(
  options: UploadExtendOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    defaultParamFlag: options.defaultParamFlag ?? false,
    model: options.model ?? DEFAULT_MODEL,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.instrumental != null) body.instrumental = options.instrumental;
  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  if (options.continueAt != null) body.continueAt = options.continueAt;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/upload-extend`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "upload-extend API");
  return { taskId };
}

/**
 * Add AI-generated vocals over an instrumental track.
 */
export async function addVocals(
  options: AddVocalsOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    prompt: options.prompt,
    title: options.title,
    style: options.style,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.negativeTags != null) body.negativeTags = options.negativeTags;
  if (options.vocalGender != null) body.vocalGender = options.vocalGender;
  if (options.styleWeight != null) body.styleWeight = options.styleWeight;
  if (options.weirdnessConstraint != null) body.weirdnessConstraint = options.weirdnessConstraint;
  if (options.audioWeight != null) body.audioWeight = options.audioWeight;
  if (options.model != null) body.model = options.model;

  const res = await fetchWithRetry(`${BASE_URL}/generate/add-vocals`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "add-vocals API");
  return { taskId };
}

/**
 * Generate instrumental backing for a vocal track.
 */
export async function addInstrumental(
  options: AddInstrumentalOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    title: options.title,
    tags: options.tags,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.negativeTags != null) body.negativeTags = options.negativeTags;
  if (options.vocalGender != null) body.vocalGender = options.vocalGender;
  if (options.styleWeight != null) body.styleWeight = options.styleWeight;
  if (options.audioWeight != null) body.audioWeight = options.audioWeight;
  if (options.weirdnessConstraint != null) body.weirdnessConstraint = options.weirdnessConstraint;
  if (options.model != null) body.model = options.model;

  const res = await fetchWithRetry(`${BASE_URL}/generate/add-instrumental`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "add-instrumental API");
  return { taskId };
}

/**
 * Blend two audio files into a mashup.
 */
export async function generateMashup(
  options: MashupOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const customMode = options.customMode ?? false;

  const body: Record<string, unknown> = {
    uploadUrlList: options.uploadUrlList,
    customMode,
    model: options.model ?? DEFAULT_MODEL,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.instrumental != null) body.instrumental = options.instrumental;
  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/mashup`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "mashup API");
  return { taskId };
}

/**
 * Replace a specific time section of an existing track.
 * Time range must be 6–60 seconds and ≤50% of original track length.
 */
export async function replaceSection(
  options: ReplaceSectionOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    taskId: options.taskId,
    audioId: options.audioId,
    prompt: options.prompt,
    tags: options.tags,
    title: options.title,
    infillStartS: options.infillStartS,
    infillEndS: options.infillEndS,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.negativeTags != null) body.negativeTags = options.negativeTags;

  const res = await fetchWithRetry(`${BASE_URL}/generate/replace-section`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "replace-section API");
  return { taskId };
}

// ─── Lyrics ───────────────────────────────────────────────────────────────────

/**
 * Generate lyrics from a text description (max 200 chars).
 * Returns a taskId — poll with getTaskStatus() to get the lyrics.
 */
export async function generateLyrics(
  options: GenerateLyricsOptions,
  apiKey?: string
): Promise<LyricsResult> {
  const body = {
    prompt: options.prompt,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  const res = await fetchWithRetry(`${BASE_URL}/lyrics`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "lyrics API");
  return { taskId };
}

/**
 * Get timestamped (word-level synchronized) lyrics for a generated track.
 */
export async function getTimestampedLyrics(
  taskId: string,
  audioId: string,
  apiKey?: string
): Promise<TimestampedLyricsResult> {
  const res = await fetchWithRetry(`${BASE_URL}/generate/get-timestamped-lyrics`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ taskId, audioId }),
  });

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: TimestampedLyricsResult;
  };

  if (!json.data) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No data in timestamped lyrics response");
  }

  return json.data;
}

// ─── Audio Processing ─────────────────────────────────────────────────────────

/**
 * Separate vocals and instruments from a track.
 * type="separate_vocal" returns vocal + instrumental (10 credits).
 * type="split_stem" returns full stem separation (50 credits).
 */
export async function separateVocals(
  options: SeparateVocalsOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body = {
    taskId: options.taskId,
    audioId: options.audioId,
    type: options.type,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  const res = await fetchWithRetry(`${BASE_URL}/vocal-removal/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "vocal-removal API");
  return { taskId };
}

/**
 * Convert a generated track to WAV format.
 */
export async function convertToWav(
  options: ConvertToWavOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body = {
    taskId: options.taskId,
    audioId: options.audioId,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  const res = await fetchWithRetry(`${BASE_URL}/wav/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "wav/generate API");
  return { taskId };
}

/**
 * Generate a MIDI file from a previously separated vocal track.
 * Requires a completed vocal separation task.
 */
export async function generateMidi(
  options: GenerateMidiOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    taskId: options.taskId,
    callBackUrl: NOOP_CALLBACK_URL,
  };
  if (options.audioId != null) body.audioId = options.audioId;

  const res = await fetchWithRetry(`${BASE_URL}/midi/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "midi/generate API");
  return { taskId };
}

// ─── Music Video ──────────────────────────────────────────────────────────────

/**
 * Create an MP4 music video with synchronized visual effects.
 * Videos are retained for 15 days.
 */
export async function createMusicVideo(
  options: MusicVideoOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    taskId: options.taskId,
    audioId: options.audioId,
    callBackUrl: NOOP_CALLBACK_URL,
  };

  if (options.author != null) body.author = options.author;
  if (options.domainName != null) body.domainName = options.domainName;

  const res = await fetchWithRetry(`${BASE_URL}/mp4/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "mp4/generate API");
  return { taskId };
}

// ─── Persona & Style ──────────────────────────────────────────────────────────

/**
 * Create a reusable persona from an existing audio track.
 * Vocal segment must be 10–30 seconds.
 */
export async function generatePersona(
  options: GeneratePersonaOptions,
  apiKey?: string
): Promise<PersonaResult> {
  const body: Record<string, unknown> = {
    taskId: options.taskId,
    audioId: options.audioId,
    name: options.name,
    description: options.description,
  };

  if (options.vocalStart != null) body.vocalStart = options.vocalStart;
  if (options.vocalEnd != null) body.vocalEnd = options.vocalEnd;
  if (options.style != null) body.style = options.style;

  const res = await fetchWithRetry(`${BASE_URL}/generate/generate-persona`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: PersonaResult;
  };

  if (!json.data?.personaId) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No persona data returned");
  }

  return json.data;
}

/**
 * Boost/expand a style description into a detailed style prompt.
 * V4.5+ feature. Returns the expanded style text synchronously.
 */
export async function boostStyle(
  content: string,
  apiKey?: string
): Promise<BoostStyleResult> {
  const res = await fetchWithRetry(`${BASE_URL}/style/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ content }),
  });

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: BoostStyleResult;
  };

  if (!json.data) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No data from style/generate API");
  }

  return json.data;
}

// ─── Status & Credits ─────────────────────────────────────────────────────────

/**
 * Poll for the status and results of a generation task.
 */
export async function getTaskStatus(
  taskId: string,
  apiKey?: string
): Promise<TaskStatusResult> {
  const res = await fetchWithRetry(
    `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET", headers: buildHeaders(apiKey) }
  );

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: {
      taskId?: string;
      status?: TaskStatus;
      errorMessage?: string | null;
      operationType?: string;
      response?: {
        sunoData?: Record<string, unknown>[];
      };
    };
  };

  const data = json.data;
  if (!data) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No data in task status response");
  }

  const status = data.status ?? "PENDING";
  const rawSongs = data.response?.sunoData ?? [];
  const songs: SunoSong[] = rawSongs.map((raw) => {
    const song = mapRawSong(raw);
    song.status = taskStatusToSongStatus(status);
    return song;
  });

  return {
    taskId: data.taskId ?? taskId,
    status,
    songs,
    errorMessage: data.errorMessage,
    operationType: data.operationType,
  };
}

/**
 * Get remaining credits for the account.
 */
export async function getRemainingCredits(apiKey?: string): Promise<number> {
  const res = await fetchWithRetry(`${BASE_URL}/generate/credit`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });

  const json = (await res.json()) as { code?: number; msg?: string; data?: number };

  if (json.data == null) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No credit data returned");
  }

  return json.data;
}

// ─── Song retrieval (existing endpoints) ──────────────────────────────────────

/**
 * List all songs associated with the account's API key.
 */
export async function listSongs(apiKey?: string): Promise<SunoSong[]> {
  const res = await fetchWithRetry(`${BASE_URL}/songs`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
  const data = (await res.json()) as { clips?: SunoSong[]; data?: SunoSong[] };
  return data.clips ?? data.data ?? [];
}

/**
 * Fetch a single song by ID.
 */
export async function getSongById(id: string, apiKey?: string): Promise<SunoSong> {
  const res = await fetchWithRetry(`${BASE_URL}/songs/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: buildHeaders(apiKey),
  });
  const data = (await res.json()) as { clip?: SunoSong; data?: SunoSong };
  const song = data.clip ?? data.data;
  if (!song) {
    throw new SunoApiError(404, `Song ${id} not found in response`);
  }
  return song;
}

/**
 * Download the raw audio for a song as an ArrayBuffer.
 */
export async function downloadSong(id: string, apiKey?: string): Promise<ArrayBuffer> {
  const song = await getSongById(id, apiKey);
  const audioRes = await fetchWithRetry(song.audioUrl, {
    method: "GET",
  });
  return audioRes.arrayBuffer();
}

// ─── File Uploads ─────────────────────────────────────────────────────────────

/**
 * Upload a file via base64 encoding. Best for files ≤10MB.
 * Files are automatically deleted after 3 days. Uploads are free.
 */
export async function uploadFileBase64(
  base64Data: string,
  apiKey?: string
): Promise<FileUploadResult> {
  const res = await fetchWithRetry(`${FILE_UPLOAD_BASE_URL}/api/file-base64-upload`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ file: base64Data }),
  });

  const json = (await res.json()) as { success?: boolean; code?: number; data?: FileUploadResult };
  if (!json.data?.fileUrl) {
    throw new SunoApiError(500, "No file data returned from base64 upload");
  }
  return json.data;
}

/**
 * Upload a file via URL. The server downloads from the provided URL.
 * Best for remote files. 30-second download timeout, ≤100MB recommended.
 */
export async function uploadFileFromUrl(
  url: string,
  apiKey?: string
): Promise<FileUploadResult> {
  const res = await fetchWithRetry(`${FILE_UPLOAD_BASE_URL}/api/file-url-upload`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ url }),
  });

  const json = (await res.json()) as { success?: boolean; code?: number; data?: FileUploadResult };
  if (!json.data?.fileUrl) {
    throw new SunoApiError(500, "No file data returned from URL upload");
  }
  return json.data;
}

// ─── Default singleton (convenience export) ───────────────────────────────────

export const sunoApi = {
  // Music generation
  generateSong,
  extendMusic,
  uploadAndCover,
  uploadAndExtend,
  addVocals,
  addInstrumental,
  generateMashup,
  replaceSection,
  // Lyrics
  generateLyrics,
  getTimestampedLyrics,
  // Audio processing
  separateVocals,
  convertToWav,
  generateMidi,
  // Music video
  createMusicVideo,
  // Persona & style
  generatePersona,
  boostStyle,
  // Status & credits
  getTaskStatus,
  getRemainingCredits,
  // Song retrieval
  listSongs,
  getSongById,
  downloadSong,
  // File uploads
  uploadFileBase64,
  uploadFileFromUrl,
} as const;
