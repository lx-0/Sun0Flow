import type { SunoModel } from "./types";
import { DEFAULT_MODEL } from "./constants";

export class SunoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SunoValidationError";
    Object.setPrototypeOf(this, SunoValidationError.prototype);
  }
}

// ── Model-specific character limits ──────────────────────────────────────────

const PROMPT_LIMIT: Record<SunoModel, number> = {
  V4: 3000,
  V4_5: 5000,
  V4_5PLUS: 5000,
  V4_5ALL: 5000,
  V5: 5000,
  V5_5: 5000,
};

const STYLE_LIMIT: Record<SunoModel, number> = {
  V4: 200,
  V4_5: 1000,
  V4_5PLUS: 1000,
  V4_5ALL: 1000,
  V5: 1000,
  V5_5: 1000,
};

const TITLE_LIMIT: Record<SunoModel, number> = {
  V4: 80,
  V4_5: 100,
  V4_5PLUS: 100,
  V4_5ALL: 80,
  V5: 100,
  V5_5: 100,
};

const NON_CUSTOM_PROMPT_LIMIT = 500;
const SOUNDS_PROMPT_LIMIT = 500;
const LYRICS_PROMPT_LIMIT = 200;
const SOUND_TEMPO_MIN = 1;
const SOUND_TEMPO_MAX = 300;
const INFILL_RANGE_MIN_S = 6;
const INFILL_RANGE_MAX_S = 60;
const PERSONA_VOCAL_MIN_S = 10;
const PERSONA_VOCAL_MAX_S = 30;
const AUTHOR_MAX = 50;
const DOMAIN_NAME_MAX = 50;

// ── Internal helpers ─────────────────────────────────────────────────────────

function assertLength(field: string, value: string, max: number): void {
  if (value.length > max) {
    throw new SunoValidationError(
      `${field} exceeds ${max} characters (got ${value.length})`
    );
  }
}

function assertRange(field: string, value: number, min: number, max: number): void {
  if (value < min || value > max) {
    throw new SunoValidationError(
      `${field} must be between ${min} and ${max} (got ${value})`
    );
  }
}

// ── Model-specific field validators ──────────────────────────────────────────

export function validatePrompt(prompt: string, model?: SunoModel): void {
  assertLength("prompt", prompt, PROMPT_LIMIT[model ?? DEFAULT_MODEL]);
}

export function validateNonCustomPrompt(prompt: string): void {
  assertLength("prompt", prompt, NON_CUSTOM_PROMPT_LIMIT);
}

export function validateStyle(style: string, model?: SunoModel): void {
  assertLength("style", style, STYLE_LIMIT[model ?? DEFAULT_MODEL]);
}

export function validateTitle(title: string, model?: SunoModel): void {
  assertLength("title", title, TITLE_LIMIT[model ?? DEFAULT_MODEL]);
}

// ── Fixed-limit validators ───────────────────────────────────────────────────

export function validateLyricsPrompt(prompt: string): void {
  assertLength("lyrics prompt", prompt, LYRICS_PROMPT_LIMIT);
}

export function validateSoundsPrompt(prompt: string): void {
  assertLength("sounds prompt", prompt, SOUNDS_PROMPT_LIMIT);
}

export function validateSoundTempo(tempo: number): void {
  assertRange("soundTempo", tempo, SOUND_TEMPO_MIN, SOUND_TEMPO_MAX);
}

export function validateAuthor(author: string): void {
  assertLength("author", author, AUTHOR_MAX);
}

export function validateDomainName(domainName: string): void {
  assertLength("domainName", domainName, DOMAIN_NAME_MAX);
}

// ── Range validators ─────────────────────────────────────────────────────────

export function validateInfillRange(startS: number, endS: number): void {
  const duration = endS - startS;
  if (duration < INFILL_RANGE_MIN_S || duration > INFILL_RANGE_MAX_S) {
    throw new SunoValidationError(
      `infill range must be ${INFILL_RANGE_MIN_S}–${INFILL_RANGE_MAX_S} seconds (got ${duration.toFixed(2)}s)`
    );
  }
}

export function validatePersonaVocalSegment(start: number, end: number): void {
  const duration = end - start;
  if (duration < PERSONA_VOCAL_MIN_S || duration > PERSONA_VOCAL_MAX_S) {
    throw new SunoValidationError(
      `persona vocal segment must be ${PERSONA_VOCAL_MIN_S}–${PERSONA_VOCAL_MAX_S} seconds (got ${duration.toFixed(2)}s)`
    );
  }
}

export function validateStyleTuningWeights(opts: {
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
}): void {
  if (opts.styleWeight != null) assertRange("styleWeight", opts.styleWeight, 0, 1);
  if (opts.weirdnessConstraint != null) assertRange("weirdnessConstraint", opts.weirdnessConstraint, 0, 1);
  if (opts.audioWeight != null) assertRange("audioWeight", opts.audioWeight, 0, 1);
}
