import type { GenerationOutcome } from "@/lib/generation";
import { prisma } from "@/lib/prisma";
import {
  generateSong,
  extendMusic,
  addVocals as sunoAddVocals,
  addInstrumental as sunoAddInstrumental,
  replaceSection as sunoReplaceSection,
  mockSongs,
} from "@/lib/sunoapi";
import { executeGeneration } from "@/lib/generation";
import { sanitizeText } from "@/lib/sanitize";
import { type Result, success, Err } from "@/lib/result";
import { MAX_VARIATIONS } from "@/lib/songs/variations/constants";
import { normalizeVariationTags, variationTitle } from "@/lib/songs/variations/helpers";
import { resolveParent, resolveRootId } from "@/lib/songs/variations/parent-context";
import { VARIATION_SELECT, toVariationRow } from "@/lib/songs/variations/projection";
import { validateReplaceSectionRange } from "@/lib/songs/variations/section-validation";
import type {
  VariationFamily,
  VariationInput,
  AddVocalsInput,
  AddInstrumentalInput,
  ReplaceSectionInput,
  ExtendSongInput,
  VariationRow,
} from "@/lib/songs/variations/types";

export { MAX_VARIATIONS };
export type {
  VariationFamily,
  VariationInput,
  AddVocalsInput,
  AddInstrumentalInput,
  ReplaceSectionInput,
  ExtendSongInput,
  VariationRow,
};
export { normalizeVariationTags, variationTitle, resolveRootId };

export async function getVariationFamily(userId: string, songId: string): Promise<Result<VariationFamily>> {
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || song.userId !== userId) return Err.notFound("Song not found");

  const rootId = await resolveRootId(songId, song.parentSongId);

  const root = rootId === songId
    ? song
    : await prisma.song.findUnique({ where: { id: rootId } });

  const variations = await prisma.song.findMany({
    where: { parentSongId: rootId },
    orderBy: { createdAt: "asc" },
    select: VARIATION_SELECT,
  });

  return success({
    root: root ? toVariationRow(root) : null,
    variations,
    variationCount: variations.length,
    maxVariations: MAX_VARIATIONS,
  });
}

export async function createVariation(
  userId: string,
  parentId: string,
  input: VariationInput,
): Promise<Result<GenerationOutcome>> {
  const ctx = await resolveParent(userId, parentId);
  if (!ctx.ok) return ctx;
  const { parentSong, rootId, userApiKey, hasApiKey } = ctx.data;

  const prompt = (input.prompt?.trim() || parentSong.prompt || "").trim();
  if (!prompt) return Err.validation("A prompt is required");

  const rawTags = (input.tags?.trim() || parentSong.tags || "").trim();
  const tags = normalizeVariationTags(rawTags);
  const title = variationTitle(parentSong.title, input.title);
  const makeInstrumental = input.makeInstrumental ?? parentSong.isInstrumental;

  const outcome = await executeGeneration({
    userId,
    action: "generate",
    songParams: {
      title: title || null,
      prompt,
      tags: tags || null,
      isInstrumental: Boolean(makeInstrumental),
      parentSongId: rootId,
    },
    hasApiKey,
    mockFallback: mockSongs[0],
    description: `Variation generation: ${title || "Untitled"}`,
    apiCall: () =>
      generateSong(
        prompt,
        { title: title || undefined, style: tags || undefined, instrumental: Boolean(makeInstrumental) },
        userApiKey,
      ),
  });

  return success(outcome);
}

export async function addVocals(
  userId: string,
  parentSongId: string,
  input: AddVocalsInput,
): Promise<Result<GenerationOutcome>> {
  const ctx = await resolveParent(userId, parentSongId);
  if (!ctx.ok) return ctx;
  const { parentSong, rootId, userApiKey, hasApiKey } = ctx.data;

  if (!parentSong.isInstrumental) {
    return Err.validation("Add vocals is only available for instrumental tracks.");
  }

  const promptResult = sanitizeText(input.prompt, "prompt");
  if (!promptResult.value) {
    return Err.validation("A prompt describing the vocals is required.");
  }
  if (promptResult.error) {
    return Err.validation(promptResult.error);
  }
  const prompt = promptResult.value;

  let style = parentSong.tags || "";
  if (input.style !== undefined && input.style !== null) {
    const { value, error } = sanitizeText(input.style, "style", 500);
    if (error) return Err.validation(error);
    style = value;
  }

  let title: string | null = parentSong.title ? `${parentSong.title} (with vocals)` : null;
  if (input.title !== undefined && input.title !== null) {
    const { value, error } = sanitizeText(input.title, "title");
    if (error) return Err.validation(error);
    title = value || title;
  }

  if (hasApiKey && !parentSong.audioUrl) {
    return Err.validation("Parent song has no audio URL to add vocals to.");
  }

  const outcome = await executeGeneration({
    userId,
    action: "generate",
    songParams: {
      title: title || null,
      prompt,
      tags: style || null,
      isInstrumental: false,
      parentSongId: rootId,
    },
    hasApiKey,
    mockFallback: mockSongs[0],
    description: `Add vocals: ${title || "Untitled"}`,
    apiCall: () => sunoAddVocals(
      {
        uploadUrl: parentSong.audioUrl!,
        prompt,
        title: title || "Untitled",
        style: style || "pop",
      },
      userApiKey,
    ),
  });

  return success(outcome);
}

export async function addInstrumental(
  userId: string,
  parentSongId: string,
  input: AddInstrumentalInput,
): Promise<Result<GenerationOutcome>> {
  const ctx = await resolveParent(userId, parentSongId);
  if (!ctx.ok) return ctx;
  const { parentSong, rootId, userApiKey, hasApiKey } = ctx.data;

  if (parentSong.isInstrumental) {
    return Err.validation("Add instrumental is only available for vocal tracks.");
  }

  let tags = (parentSong.tags || "").trim();
  if (input.tags !== undefined && input.tags !== null) {
    const { value, error } = sanitizeText(input.tags, "tags", 500);
    if (error) return Err.validation(error);
    tags = value;
  }

  if (!tags) {
    return Err.validation("Style tags are required for instrumental generation.");
  }

  let title: string | null = parentSong.title ? `${parentSong.title} (instrumental)` : null;
  if (input.title !== undefined && input.title !== null) {
    const { value, error } = sanitizeText(input.title, "title");
    if (error) return Err.validation(error);
    title = value || title;
  }

  if (hasApiKey && !parentSong.audioUrl) {
    return Err.validation("Parent song has no audio URL to generate instrumental from.");
  }

  const mock = mockSongs[0];
  const outcome = await executeGeneration({
    userId,
    action: "generate",
    songParams: {
      title,
      prompt: parentSong.prompt || "",
      tags,
      isInstrumental: true,
      parentSongId: rootId,
    },
    apiCall: () => sunoAddInstrumental(
      { uploadUrl: parentSong.audioUrl!, title: title || "Untitled", tags },
      userApiKey,
    ),
    mockFallback: {
      title: mock.title,
      tags: mock.tags,
      audioUrl: mock.audioUrl,
      imageUrl: mock.imageUrl,
      duration: mock.duration,
      model: mock.model,
    },
    hasApiKey,
    guards: "free",
    description: "add-instrumental",
  });

  return success(outcome);
}

export async function replaceSection(
  userId: string,
  parentSongId: string,
  input: ReplaceSectionInput,
): Promise<Result<GenerationOutcome>> {
  const ctx = await resolveParent(userId, parentSongId);
  if (!ctx.ok) return ctx;
  const { parentSong, rootId, userApiKey, hasApiKey } = ctx.data;

  const prompt = (input.prompt ?? "").trim();
  const tags = (input.tags ?? parentSong.tags ?? "").trim();
  const title = (input.title ?? "").trim() || (parentSong.title ? `${parentSong.title} (section replaced)` : null);
  const { infillStartS, infillEndS } = input;
  const negativeTags = input.negativeTags?.trim() || undefined;

  const rangeValidationError = validateReplaceSectionRange(infillStartS, infillEndS, parentSong.duration);
  if (rangeValidationError) {
    return Err.validation(rangeValidationError);
  }

  if (!prompt) {
    return Err.validation("A replacement prompt is required.");
  }
  if (!tags) {
    return Err.validation("Style tags are required.");
  }

  if (hasApiKey && (!parentSong.sunoJobId || !parentSong.sunoAudioId)) {
    return Err.validation("Cannot replace section on a song without Suno identifiers.");
  }

  const mock = mockSongs[0];
  const outcome = await executeGeneration({
    userId,
    action: "generate",
    songParams: {
      title,
      prompt,
      tags,
      isInstrumental: parentSong.isInstrumental,
      parentSongId: rootId,
    },
    apiCall: () => sunoReplaceSection(
      {
        taskId: parentSong.sunoJobId!,
        audioId: parentSong.sunoAudioId!,
        prompt,
        tags,
        title: title || parentSong.title || "Untitled",
        infillStartS,
        infillEndS,
        negativeTags,
      },
      userApiKey,
    ),
    mockFallback: {
      title: mock.title,
      tags: mock.tags,
      audioUrl: mock.audioUrl,
      imageUrl: mock.imageUrl,
      duration: mock.duration,
      lyrics: mock.lyrics,
      model: mock.model,
    },
    hasApiKey,
    guards: "free",
    description: "replace-section",
  });

  return success(outcome);
}

export async function extendSong(
  userId: string,
  parentSongId: string,
  input: ExtendSongInput,
): Promise<Result<GenerationOutcome>> {
  const ctx = await resolveParent(userId, parentSongId);
  if (!ctx.ok) return ctx;
  const { parentSong, rootId, userApiKey, hasApiKey } = ctx.data;

  let prompt = (parentSong.prompt || "").trim();
  if (input.prompt !== undefined && input.prompt !== null) {
    const { value, error } = sanitizeText(input.prompt, "prompt");
    if (error) return Err.validation(error);
    prompt = value || prompt;
  }

  let style: string | undefined = (parentSong.tags || "").trim() || undefined;
  if (input.style !== undefined && input.style !== null) {
    const { value, error } = sanitizeText(input.style, "style", 500);
    if (error) return Err.validation(error);
    style = value || undefined;
  }

  let title: string | null = parentSong.title ? `${parentSong.title} (extended)` : null;
  if (input.title !== undefined && input.title !== null) {
    const { value, error } = sanitizeText(input.title, "title");
    if (error) return Err.validation(error);
    title = value || title;
  }

  const continueAt = typeof input.continueAt === "number" ? input.continueAt : undefined;

  if (hasApiKey && !parentSong.sunoAudioId) {
    return Err.validation("Cannot extend a song without a Suno audio ID.");
  }

  const outcome = await executeGeneration({
    userId,
    action: "extend",
    songParams: {
      title: title || null,
      prompt,
      tags: style || null,
      isInstrumental: parentSong.isInstrumental,
      parentSongId: rootId,
    },
    hasApiKey,
    mockFallback: mockSongs[0],
    description: `Music extension: ${title || "Untitled"}`,
    apiCall: () => extendMusic(
      {
        audioId: parentSong.sunoAudioId!,
        defaultParamFlag: !!(prompt || style || title || continueAt),
        prompt: prompt || undefined,
        style,
        title: title || undefined,
        continueAt,
      },
      userApiKey,
    ),
  });

  return success(outcome);
}
