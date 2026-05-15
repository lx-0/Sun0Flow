import type { GenerationQueueItem, Song } from "@prisma/client";
import type { RateLimitStatus } from "@/lib/rate-limit";

export const MAX_QUEUE_SIZE = 10;

export interface AddItemParams {
  prompt: string;
  title?: string | null;
  tags?: string | null;
  makeInstrumental?: boolean;
  personaId?: string | null;
}

export type AddItemResult =
  | { ok: true; item: GenerationQueueItem }
  | { ok: false; code: "QUEUE_FULL"; message: string };

export type CancelResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" };

export type AcquireResult =
  | { status: "acquired"; item: GenerationQueueItem }
  | { status: "already_processing"; item: GenerationQueueItem }
  | { status: "empty" };

export type SongOutcome =
  | { status: "done" }
  | { status: "failed"; errorMessage: string };

export type ProcessNextResult =
  | { outcome: "already_processing"; item: GenerationQueueItem }
  | { outcome: "empty" }
  | { outcome: "rate_limited"; rateLimit: RateLimitStatus }
  | { outcome: "denied" }
  | { outcome: "queued"; message: string }
  | {
      outcome: "failed";
      queueItem: GenerationQueueItem;
      song: Song;
      error: string;
      code: string;
      details?: Record<string, unknown>;
      creditBalance?: number;
      correlationId: string;
    }
  | {
      outcome: "created";
      queueItem: GenerationQueueItem;
      song: Song;
      queueStatus: "done" | "processing";
    };
