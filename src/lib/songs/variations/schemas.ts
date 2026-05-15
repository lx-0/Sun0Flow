import { z } from "zod";

export const createVariationBody = z.object({
  prompt: z.string().optional(),
  tags: z.string().optional(),
  title: z.string().optional(),
  makeInstrumental: z.boolean().optional(),
});
export type CreateVariationBody = z.infer<typeof createVariationBody>;

export const addVocalsBody = z.object({
  prompt: z.string(),
  style: z.string().optional(),
  title: z.string().optional(),
});
export type AddVocalsBody = z.infer<typeof addVocalsBody>;

export const addInstrumentalBody = z.object({
  tags: z.string().optional(),
  title: z.string().optional(),
});
export type AddInstrumentalBody = z.infer<typeof addInstrumentalBody>;

export const replaceSectionBody = z.object({
  prompt: z.string(),
  tags: z.string().optional(),
  title: z.string().optional(),
  infillStartS: z.number(),
  infillEndS: z.number(),
  negativeTags: z.string().optional(),
});
export type ReplaceSectionBody = z.infer<typeof replaceSectionBody>;

export const extendSongBody = z.object({
  prompt: z.string().optional(),
  style: z.string().optional(),
  title: z.string().optional(),
  continueAt: z.number().optional(),
});
export type ExtendSongBody = z.infer<typeof extendSongBody>;
