import { z } from "zod";
import {
  sanitizeGenerationInput,
  GENERATION_PROMPT_MAX_LENGTH,
  GENERATION_PROMPT_MAX_MESSAGE,
  GENERATION_PROMPT_REQUIRED_MESSAGE,
  GENERATION_STYLE_MAX_LENGTH,
  GENERATION_TITLE_MAX_LENGTH,
  GENERATION_TITLE_MAX_MESSAGE,
} from "./params";

export const generateSongRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, GENERATION_PROMPT_REQUIRED_MESSAGE)
    .max(GENERATION_PROMPT_MAX_LENGTH, GENERATION_PROMPT_MAX_MESSAGE),
  title: z.string().max(GENERATION_TITLE_MAX_LENGTH, GENERATION_TITLE_MAX_MESSAGE).optional(),
  tags: z
    .string()
    .max(
      GENERATION_STYLE_MAX_LENGTH,
      `Tags must be ${GENERATION_STYLE_MAX_LENGTH} characters or less`,
    )
    .optional(),
  makeInstrumental: z.boolean().optional(),
  personaId: z.string().optional(),
  parentSongId: z.string().optional(),
});

export type GenerateSongRequest = z.infer<typeof generateSongRequestSchema>;

export function sanitizeGenerateSongRequest(body: GenerateSongRequest) {
  return sanitizeGenerationInput({
    prompt: body.prompt,
    title: body.title,
    style: body.tags,
    makeInstrumental: body.makeInstrumental,
    personaId: body.personaId,
    parentSongId: body.parentSongId,
  });
}
