import { z } from "zod";
import { stripHtml } from "@/lib/sanitize";

export const generateSongRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "A style/genre prompt is required")
    .max(3000, "Prompt must be 3000 characters or less"),
  title: z.string().max(200, "Title must be 200 characters or less").optional(),
  tags: z.string().max(500, "Tags must be 500 characters or less").optional(),
  makeInstrumental: z.boolean().optional(),
  personaId: z.string().optional(),
  parentSongId: z.string().optional(),
});

export type GenerateSongRequest = z.infer<typeof generateSongRequestSchema>;

export function sanitizeGenerateSongRequest(body: GenerateSongRequest) {
  return {
    prompt: stripHtml(body.prompt).trim(),
    title: body.title ? stripHtml(body.title).trim() || undefined : undefined,
    style: body.tags ? stripHtml(body.tags).trim() || undefined : undefined,
    instrumental: Boolean(body.makeInstrumental),
    personaId: body.personaId || undefined,
    parentSongId: body.parentSongId || undefined,
  };
}
