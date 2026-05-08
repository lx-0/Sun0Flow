import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { addVocals as sunoAddVocals, addInstrumental as sunoAddInstrumental, replaceSection as sunoReplaceSection } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { executeGeneration, type GenerationOutcome } from "@/lib/generation";

const MAX_VARIATIONS = 5;
const MIN_SECTION_S = 6;
const MAX_SECTION_S = 60;
const MAX_SECTION_RATIO = 0.5;

export type VariationOutcome =
  | { status: "validation_error"; error: string; code: string }
  | { status: "not_found" }
  | GenerationOutcome;

// ---------------------------------------------------------------------------
// Shared orchestration
// ---------------------------------------------------------------------------

interface ParentContext {
  parentSong: NonNullable<Awaited<ReturnType<typeof prisma.song.findUnique>>>;
  rootId: string;
  userApiKey: string | undefined;
  hasApiKey: boolean;
}

async function resolveParent(
  userId: string,
  parentSongId: string
): Promise<{ ok: true; ctx: ParentContext } | VariationOutcome> {
  const parentSong = await prisma.song.findUnique({ where: { id: parentSongId } });
  if (!parentSong || parentSong.userId !== userId) {
    return { status: "not_found" };
  }

  const rootId = parentSong.parentSongId ?? parentSongId;

  const variationCount = await prisma.song.count({ where: { parentSongId: rootId } });
  if (variationCount >= MAX_VARIATIONS) {
    return {
      status: "validation_error",
      error: `Maximum ${MAX_VARIATIONS} variations per song reached.`,
      code: "VALIDATION_ERROR",
    };
  }

  const userApiKey = await resolveUserApiKey(userId);
  const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);

  return { ok: true, ctx: { parentSong, rootId, userApiKey, hasApiKey } };
}

// ---------------------------------------------------------------------------
// Add Vocals
// ---------------------------------------------------------------------------

export interface AddVocalsInput {
  prompt: string;
  style?: string;
  title?: string;
}

export async function addVocals(
  userId: string,
  parentSongId: string,
  input: AddVocalsInput
): Promise<VariationOutcome> {
  const result = await resolveParent(userId, parentSongId);
  if (!("ok" in result)) return result;
  const { parentSong, rootId, userApiKey, hasApiKey } = result.ctx;

  if (!parentSong.isInstrumental) {
    return { status: "validation_error", error: "Add vocals is only available for instrumental tracks.", code: "VALIDATION_ERROR" };
  }

  const promptResult = sanitizeText(input.prompt, "prompt");
  if (!promptResult.value) {
    return { status: "validation_error", error: "A prompt describing the vocals is required.", code: "VALIDATION_ERROR" };
  }
  if (promptResult.error) {
    return { status: "validation_error", error: promptResult.error, code: "VALIDATION_ERROR" };
  }
  const prompt = promptResult.value;

  let style = parentSong.tags || "";
  if (input.style !== undefined && input.style !== null) {
    const { value, error } = sanitizeText(input.style, "style", 500);
    if (error) return { status: "validation_error", error, code: "VALIDATION_ERROR" };
    style = value;
  }

  let title: string | null = parentSong.title ? `${parentSong.title} (with vocals)` : null;
  if (input.title !== undefined && input.title !== null) {
    const { value, error } = sanitizeText(input.title, "title");
    if (error) return { status: "validation_error", error, code: "VALIDATION_ERROR" };
    title = value || title;
  }

  if (hasApiKey && !parentSong.audioUrl) {
    return { status: "validation_error", error: "Parent song has no audio URL to add vocals to.", code: "VALIDATION_ERROR" };
  }

  return executeGeneration({
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
      userApiKey
    ),
  });
}

// ---------------------------------------------------------------------------
// Add Instrumental
// ---------------------------------------------------------------------------

export interface AddInstrumentalInput {
  tags?: string;
  title?: string;
}

export async function addInstrumental(
  userId: string,
  parentSongId: string,
  input: AddInstrumentalInput
): Promise<VariationOutcome> {
  const result = await resolveParent(userId, parentSongId);
  if (!("ok" in result)) return result;
  const { parentSong, rootId, userApiKey, hasApiKey } = result.ctx;

  if (parentSong.isInstrumental) {
    return { status: "validation_error", error: "Add instrumental is only available for vocal tracks.", code: "VALIDATION_ERROR" };
  }

  let tags = (parentSong.tags || "").trim();
  if (input.tags !== undefined && input.tags !== null) {
    const { value, error } = sanitizeText(input.tags, "tags", 500);
    if (error) return { status: "validation_error", error, code: "VALIDATION_ERROR" };
    tags = value;
  }

  if (!tags) {
    return { status: "validation_error", error: "Style tags are required for instrumental generation.", code: "VALIDATION_ERROR" };
  }

  let title: string | null = parentSong.title ? `${parentSong.title} (instrumental)` : null;
  if (input.title !== undefined && input.title !== null) {
    const { value, error } = sanitizeText(input.title, "title");
    if (error) return { status: "validation_error", error, code: "VALIDATION_ERROR" };
    title = value || title;
  }

  if (hasApiKey && !parentSong.audioUrl) {
    return { status: "validation_error", error: "Parent song has no audio URL to generate instrumental from.", code: "VALIDATION_ERROR" };
  }

  const mock = mockSongs[0];
  return executeGeneration({
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
      userApiKey
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
}

// ---------------------------------------------------------------------------
// Replace Section
// ---------------------------------------------------------------------------

export interface ReplaceSectionInput {
  prompt: string;
  tags?: string;
  title?: string;
  infillStartS: number;
  infillEndS: number;
  negativeTags?: string;
}

export async function replaceSection(
  userId: string,
  parentSongId: string,
  input: ReplaceSectionInput
): Promise<VariationOutcome> {
  const result = await resolveParent(userId, parentSongId);
  if (!("ok" in result)) return result;
  const { parentSong, rootId, userApiKey, hasApiKey } = result.ctx;

  const prompt = (input.prompt ?? "").trim();
  const tags = (input.tags ?? parentSong.tags ?? "").trim();
  const title = (input.title ?? "").trim() || (parentSong.title ? `${parentSong.title} (section replaced)` : null);
  const { infillStartS, infillEndS } = input;
  const negativeTags = input.negativeTags?.trim() || undefined;

  if (infillStartS == null || infillEndS == null) {
    return { status: "validation_error", error: "Start and end times are required.", code: "VALIDATION_ERROR" };
  }
  if (infillStartS < 0 || infillEndS <= infillStartS) {
    return { status: "validation_error", error: "Invalid time range. End must be after start.", code: "VALIDATION_ERROR" };
  }
  const sectionLen = infillEndS - infillStartS;
  if (sectionLen < MIN_SECTION_S) {
    return { status: "validation_error", error: `Section must be at least ${MIN_SECTION_S} seconds.`, code: "VALIDATION_ERROR" };
  }
  if (sectionLen > MAX_SECTION_S) {
    return { status: "validation_error", error: `Section must be at most ${MAX_SECTION_S} seconds.`, code: "VALIDATION_ERROR" };
  }
  if (parentSong.duration && sectionLen > parentSong.duration * MAX_SECTION_RATIO) {
    return { status: "validation_error", error: "Section must be at most 50% of the song duration.", code: "VALIDATION_ERROR" };
  }

  if (!prompt) {
    return { status: "validation_error", error: "A replacement prompt is required.", code: "VALIDATION_ERROR" };
  }
  if (!tags) {
    return { status: "validation_error", error: "Style tags are required.", code: "VALIDATION_ERROR" };
  }

  if (hasApiKey && (!parentSong.sunoJobId || !parentSong.sunoAudioId)) {
    return { status: "validation_error", error: "Cannot replace section on a song without Suno identifiers.", code: "VALIDATION_ERROR" };
  }

  const mock = mockSongs[0];
  return executeGeneration({
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
      userApiKey
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
}
