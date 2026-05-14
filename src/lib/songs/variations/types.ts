import type { Song } from "@prisma/client";

export interface VariationInput {
  prompt?: string;
  tags?: string;
  title?: string;
  makeInstrumental?: boolean;
}

export interface AddVocalsInput {
  prompt: string;
  style?: string;
  title?: string;
}

export interface AddInstrumentalInput {
  tags?: string;
  title?: string;
}

export interface ReplaceSectionInput {
  prompt: string;
  tags?: string;
  title?: string;
  infillStartS: number;
  infillEndS: number;
  negativeTags?: string;
}

export interface ExtendSongInput {
  prompt?: string;
  style?: string;
  title?: string;
  continueAt?: number;
}

export type VariationRow = Pick<
  Song,
  "id" | "title" | "prompt" | "tags" | "audioUrl" | "imageUrl" | "duration" | "lyrics" | "generationStatus" | "isInstrumental" | "createdAt"
>;

export interface VariationFamily {
  root: VariationRow | null;
  variations: VariationRow[];
  variationCount: number;
  maxVariations: number;
}
