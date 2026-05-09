/**
 * sunoapi.org API client
 *
 * Tree-shakeable, no side-effects on import.
 * API key is read from SUNOAPI_KEY env var at call time — never hard-coded.
 *
 * Split into focused modules:
 *   - types.ts         — shared type definitions
 *   - errors.ts        — SunoApiError and error codes
 *   - constants.ts     — base URLs, default model, callback URL builder
 *   - fetch.ts         — fetchWithRetry with circuit breaker, header builder
 *   - mappers.ts       — response mappers: extractTaskId, mapRawSong, applyStyleTuning
 *   - validation.ts    — model-specific and fixed-limit input validators
 *   - create.ts        — core song generation (generateSong, extendMusic)
 *   - upload-based.ts  — upload-then-transform operations (cover, extend, vocals, mashup, replace)
 *   - media.ts         — non-music generation (sounds, cover images)
 *   - lyrics.ts        — lyrics generation & timestamped lyrics
 *   - audio.ts         — vocal separation, WAV conversion, MIDI, music video
 *   - persona.ts       — persona creation, style boost
 *   - status.ts        — task status polling, credits query
 *   - task-detail.ts   — detailed status for lyrics, vocals, WAV, video, MIDI, cover images
 *   - songs.ts         — song listing, retrieval, download
 *   - uploads.ts       — file uploads (base64, URL, stream)
 */

// Types
export type {
  SongStatus,
  TaskStatus,
  SunoModel,
  VocalGender,
  PersonaModel,
  SeparationType,
  SoundKey,
  SunoSong,
  StyleTuningOptions,
  GenerateSongOptions,
  GenerateResult,
  TaskStatusResult,
  ExtendMusicOptions,
  UploadCoverOptions,
  UploadExtendOptions,
  AddVocalsOptions,
  AddInstrumentalOptions,
  GenerateLyricsOptions,
  LyricsResult,
  TimestampedWord,
  TimestampedLyricsResult,
  SeparateVocalsOptions,
  ConvertToWavOptions,
  MusicVideoOptions,
  GeneratePersonaOptions,
  PersonaResult,
  MashupOptions,
  ReplaceSectionOptions,
  GenerateMidiOptions,
  BoostStyleResult,
  FileUploadResult,
  GenerateSoundsOptions,
  GenerateCoverImageOptions,
  CoverImageResult,
  LyricsTaskStatus,
  LyricsDetailResult,
  VocalSeparationStatus,
  VocalSeparationDetailResult,
  WavConversionStatus,
  WavConversionDetailResult,
  MusicVideoStatus,
  MusicVideoDetailResult,
  MidiNote,
  MidiInstrument,
  MidiDetailResult,
  CoverImageDetailResult,
  StreamUploadResult,
} from "./types";

// Error classes
export { SunoApiError, type SunoApiErrorCode } from "./errors";
export { SunoValidationError } from "./validation";
export { CircuitOpenError } from "@/lib/circuit-breaker";

// Core song generation
export { generateSong, extendMusic } from "./create";

// Upload-based generation
export {
  uploadAndCover,
  uploadAndExtend,
  addVocals,
  addInstrumental,
  generateMashup,
  replaceSection,
} from "./upload-based";

// Non-music generation
export { generateSounds, generateCoverImage } from "./media";

// Lyrics
export { generateLyrics, getTimestampedLyrics } from "./lyrics";

// Audio processing & music video
export { separateVocals, convertToWav, generateMidi, createMusicVideo } from "./audio";

// Persona & style
export { generatePersona, boostStyle } from "./persona";

// Status & credits
export { getTaskStatus, getRemainingCredits } from "./status";

// Task detail polling
export {
  getLyricsDetail,
  getVocalSeparationDetail,
  getWavConversionDetail,
  getMusicVideoDetail,
  getMidiDetail,
  getCoverImageDetail,
} from "./task-detail";

// Song retrieval
export { listSongs, getSongById, downloadSong } from "./songs";

// File uploads
export { uploadFileBase64, uploadFileFromUrl, uploadFileStream } from "./uploads";

// Convenience namespace
import { generateSong, extendMusic } from "./create";
import { uploadAndCover, uploadAndExtend, addVocals, addInstrumental, generateMashup, replaceSection } from "./upload-based";
import { generateSounds, generateCoverImage } from "./media";
import { generateLyrics, getTimestampedLyrics } from "./lyrics";
import { separateVocals, convertToWav, generateMidi, createMusicVideo } from "./audio";
import { generatePersona, boostStyle } from "./persona";
import { getTaskStatus, getRemainingCredits } from "./status";
import { getLyricsDetail, getVocalSeparationDetail, getWavConversionDetail, getMusicVideoDetail, getMidiDetail, getCoverImageDetail } from "./task-detail";
import { listSongs, getSongById, downloadSong } from "./songs";
import { uploadFileBase64, uploadFileFromUrl, uploadFileStream } from "./uploads";

export const sunoApi = {
  generateSong,
  extendMusic,
  uploadAndCover,
  uploadAndExtend,
  addVocals,
  addInstrumental,
  generateMashup,
  replaceSection,
  generateSounds,
  generateCoverImage,
  generateLyrics,
  getTimestampedLyrics,
  separateVocals,
  convertToWav,
  generateMidi,
  createMusicVideo,
  generatePersona,
  boostStyle,
  getTaskStatus,
  getRemainingCredits,
  getLyricsDetail,
  getVocalSeparationDetail,
  getWavConversionDetail,
  getMusicVideoDetail,
  getMidiDetail,
  getCoverImageDetail,
  listSongs,
  getSongById,
  downloadSong,
  uploadFileBase64,
  uploadFileFromUrl,
  uploadFileStream,
} as const;
