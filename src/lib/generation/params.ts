import { z } from "zod";
import { stripHtml } from "@/lib/sanitize";
import { type Result, fail, success } from "@/lib/result";

export const MIN_BATCH_SIZE = 2;
export const MAX_BATCH_SIZE = 5;
export const GENERATION_PROMPT_MAX_LENGTH = 3000;
export const GENERATION_TITLE_MAX_LENGTH = 200;
export const GENERATION_STYLE_MAX_LENGTH = 500;
export const GENERATION_PROMPT_REQUIRED_MESSAGE = "A style/genre prompt is required";
export const GENERATION_PROMPT_MAX_MESSAGE = `Prompt must be ${GENERATION_PROMPT_MAX_LENGTH} characters or less`;
export const GENERATION_TITLE_MAX_MESSAGE = `Title must be ${GENERATION_TITLE_MAX_LENGTH} characters or less`;
export const GENERATION_STYLE_MAX_MESSAGE = `Style must be ${GENERATION_STYLE_MAX_LENGTH} characters or less`;

const promptField = z
  .string()
  .trim()
  .min(1, GENERATION_PROMPT_REQUIRED_MESSAGE)
  .max(GENERATION_PROMPT_MAX_LENGTH, GENERATION_PROMPT_MAX_MESSAGE);

const titleField = z
  .string()
  .max(GENERATION_TITLE_MAX_LENGTH, GENERATION_TITLE_MAX_MESSAGE)
  .optional();
const styleField = z
  .string()
  .max(GENERATION_STYLE_MAX_LENGTH, GENERATION_STYLE_MAX_MESSAGE)
  .optional();

export const generationInputSchema = z.object({
  prompt: promptField,
  title: titleField,
  style: styleField,
  makeInstrumental: z.boolean().optional(),
  personaId: z.string().optional(),
  parentSongId: z.string().optional(),
});

export interface NormalizedGenerationInput {
  prompt: string;
  title?: string;
  style?: string;
  instrumental: boolean;
  personaId?: string;
  parentSongId?: string;
}

export function sanitizeGenerationInput(
  body: Pick<
    z.input<typeof generationInputSchema>,
    "prompt" | "title" | "style" | "makeInstrumental" | "personaId" | "parentSongId"
  >,
): NormalizedGenerationInput {
  return {
    prompt: stripHtml(body.prompt).trim(),
    title: body.title ? stripHtml(body.title).trim() || undefined : undefined,
    style: body.style ? stripHtml(body.style).trim() || undefined : undefined,
    instrumental: Boolean(body.makeInstrumental),
    personaId: body.personaId || undefined,
    parentSongId: body.parentSongId || undefined,
  };
}

const batchGenerationConfigSchema = generationInputSchema.extend({
  model: z.string().optional(),
});

export interface NormalizedBatchGenerationConfig extends NormalizedGenerationInput {
  model?: string;
}

export function validateAndSanitizeBatchGenerationConfigs(
  configs: unknown,
): Result<NormalizedBatchGenerationConfig[]> {
  if (!Array.isArray(configs)) {
    return fail("configs must be an array of generation configurations", "VALIDATION_ERROR", 400);
  }

  if (configs.length < MIN_BATCH_SIZE || configs.length > MAX_BATCH_SIZE) {
    return fail(
      `Batch size must be between ${MIN_BATCH_SIZE} and ${MAX_BATCH_SIZE} (got ${configs.length})`,
      "VALIDATION_ERROR",
      400,
    );
  }

  const normalized: NormalizedBatchGenerationConfig[] = [];

  for (let i = 0; i < configs.length; i++) {
    const parsed = batchGenerationConfigSchema.safeParse(configs[i]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(`Config ${i + 1}: ${issue.message}`, "VALIDATION_ERROR", 400);
    }

    normalized.push({
      ...sanitizeGenerationInput(parsed.data),
      model: parsed.data.model || undefined,
    });
  }

  return success(normalized);
}
