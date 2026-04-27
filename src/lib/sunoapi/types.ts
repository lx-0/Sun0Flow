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

export type SunoModel = "V4" | "V4_5" | "V4_5PLUS" | "V4_5ALL" | "V5" | "V5_5";

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
  videoUrl?: string;
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
  model?: SunoModel;
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
  model?: SunoModel;
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

/** Pitch key values accepted by the sounds endpoint */
export type SoundKey =
  | "Any" | "Cm" | "C#m" | "Dm" | "D#m" | "Em" | "Fm" | "F#m"
  | "Gm" | "G#m" | "Am" | "A#m" | "Bm"
  | "C" | "C#" | "D" | "D#" | "E" | "F" | "F#"
  | "G" | "G#" | "A" | "A#" | "B";

export interface GenerateSoundsOptions {
  prompt: string;
  /** Only V5 is supported for sounds */
  model?: "V5";
  /** Enable looped playback for ambient audio */
  soundLoop?: boolean;
  /** BPM (1–300) */
  soundTempo?: number;
  /** Musical key */
  soundKey?: SoundKey;
  /** Retrieve lyric subtitle data on completion */
  grabLyrics?: boolean;
}

export interface GenerateCoverImageOptions {
  taskId: string;
}

export interface CoverImageResult {
  taskId: string;
}

export type LyricsTaskStatus =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_LYRICS_FAILED"
  | "CALLBACK_EXCEPTION"
  | "SENSITIVE_WORD_ERROR";

export interface LyricsDetailResult {
  taskId: string;
  status: LyricsTaskStatus;
  type: string;
  response?: {
    data: Array<{
      text: string;
      title: string;
      status: "complete" | "failed";
      errorMessage?: string;
    }>;
  };
  errorCode?: number;
  errorMessage?: string;
}

export type VocalSeparationStatus =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_AUDIO_FAILED"
  | "CALLBACK_EXCEPTION";

export interface VocalSeparationDetailResult {
  taskId: string;
  musicId: string;
  musicIndex: number;
  successFlag: VocalSeparationStatus;
  createTime: string;
  completeTime?: string;
  response?: {
    originUrl?: string;
    vocalUrl?: string;
    instrumentalUrl?: string;
    backingVocalsUrl?: string;
    drumsUrl?: string;
    bassUrl?: string;
    guitarUrl?: string;
    keyboardUrl?: string;
    percussionUrl?: string;
    stringsUrl?: string;
    synthUrl?: string;
    fxUrl?: string;
    brassUrl?: string;
    woodwindsUrl?: string;
  };
  errorCode?: number;
  errorMessage?: string;
}

export type WavConversionStatus =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_WAV_FAILED"
  | "CALLBACK_EXCEPTION";

export interface WavConversionDetailResult {
  taskId: string;
  musicId: string;
  musicIndex: number;
  successFlag: WavConversionStatus;
  createTime: string;
  completeTime?: string;
  response?: {
    audioWavUrl?: string;
  };
  errorCode?: number;
  errorMessage?: string;
}

export type MusicVideoStatus =
  | "PENDING"
  | "SUCCESS"
  | "CREATE_TASK_FAILED"
  | "GENERATE_MP4_FAILED"
  | "CALLBACK_EXCEPTION";

export interface MusicVideoDetailResult {
  taskId: string;
  musicId: string;
  musicIndex: number;
  successFlag: MusicVideoStatus;
  createTime: string;
  completeTime?: string;
  response?: {
    videoUrl?: string;
  };
  errorCode?: number;
  errorMessage?: string;
}

export interface MidiNote {
  pitch: number;
  start: number;
  end: number;
  velocity: number;
}

export interface MidiInstrument {
  name: string;
  notes: MidiNote[];
}

export interface MidiDetailResult {
  taskId: string;
  /** 0=Pending, 1=Success, 2=Creation failed, 3=Generation failed */
  successFlag: number;
  audioId?: string;
  createTime: number;
  completeTime?: number;
  midiData?: {
    state: string;
    instruments: MidiInstrument[];
  };
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface CoverImageDetailResult {
  taskId: string;
  parentTaskId: string;
  /** 0=Pending, 1=Success, 2=Generating, 3=Failed */
  successFlag: number;
  createTime: string;
  completeTime?: string;
  response?: {
    images: string[];
  };
  errorCode?: number;
  errorMessage?: string;
}

export interface StreamUploadResult {
  fileName: string;
  filePath: string;
  downloadUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}
