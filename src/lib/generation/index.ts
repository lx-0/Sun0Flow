// Re-exports: keep the public interface stable for all callers.
export { executeGeneration } from "./execute";
export type { GenerationSpec, GenerationOutcome } from "./execute";
export { executeBatchGeneration } from "./batch";
export type { BatchConfig, BatchItemResult, BatchGenerationData } from "./batch";
export { pollToCompletion, pollOnce, MAX_POLL_ATTEMPTS } from "./completion";
export type { CompletionUpdate, CompletionTarget, PollOutcome } from "./completion";
export { respondToGeneration, respondToTransform } from "./respond";
export { userFriendlyError } from "./errors";
export type { GenerationError } from "./errors";
export { executeTransform } from "./transform";
export type { TransformSpec, TransformOutcome } from "./transform";
export { type GuardPolicy } from "./guards";
export { executeCore, type SongParams, type MockData } from "./core";
export { handleSongSuccess, handleSongFailure } from "./song-completion";
export type { SongRecord, CompletionSong, CompletionResult } from "./song-completion";
export {
  generateSongRequestSchema,
  sanitizeGenerateSongRequest,
  type GenerateSongRequest,
} from "./request";
