import { prisma } from "@/lib/prisma";
import { generatePersona, getTaskStatus, SunoApiError, resolveUserApiKey } from "@/lib/sunoapi";
import { type Result, success, Err } from "@/lib/result";

const MAX_PERSONAS = 50;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

export interface PersonaEntry {
  id: string;
  personaId: string;
  name: string;
  description: string | null;
  style: string | null;
  sourceSongId: string | null;
  createdAt: Date;
}

export interface CreatePersonaInput {
  taskId: unknown;
  name: unknown;
  description?: unknown;
  vocalStart?: unknown;
  vocalEnd?: unknown;
  style?: unknown;
  songId?: unknown;
}

const PERSONA_SELECT = {
  id: true,
  personaId: true,
  name: true,
  description: true,
  style: true,
  sourceSongId: true,
  createdAt: true,
} as const;

export async function listPersonas(
  userId: string,
): Promise<Result<PersonaEntry[]>> {
  const personas = await prisma.persona.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: PERSONA_SELECT,
  });
  return success(personas);
}

export async function createPersona(
  userId: string,
  input: CreatePersonaInput,
): Promise<Result<PersonaEntry>> {
  const { taskId, name, description, vocalStart, vocalEnd, style, songId } = input;

  if (!taskId || typeof taskId !== "string" || !name || typeof name !== "string") {
    return Err.validation("taskId and name are required");
  }

  if (name.length > MAX_NAME_LENGTH) {
    return Err.validation(`Name must be ${MAX_NAME_LENGTH} characters or less`);
  }

  if (description && typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
    return Err.validation(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
  }

  const count = await prisma.persona.count({ where: { userId } });
  if (count >= MAX_PERSONAS) {
    return Err.limitReached(`Maximum of ${MAX_PERSONAS} personas reached. Delete some to create new ones.`);
  }

  const userApiKey = await resolveUserApiKey(userId);

  const taskResult = await getTaskStatus(taskId, userApiKey);
  const clip = taskResult.songs[0];
  if (!clip?.id) {
    return Err.clipNotFound(
      "Could not resolve audio clip from Suno task. The song may have expired (15-day retention).",
    );
  }

  const trimmedName = (name as string).trim();
  const trimmedDesc = typeof description === "string" ? description.trim() : undefined;
  const trimmedStyle = typeof style === "string" ? style.trim() : undefined;

  try {
    const result = await generatePersona(
      {
        taskId,
        audioId: clip.id,
        name: trimmedName,
        description: trimmedDesc || trimmedName,
        vocalStart: typeof vocalStart === "number" ? vocalStart : undefined,
        vocalEnd: typeof vocalEnd === "number" ? vocalEnd : undefined,
        style: trimmedStyle || undefined,
      },
      userApiKey,
    );

    const persona = await prisma.persona.create({
      data: {
        userId,
        personaId: result.personaId,
        name: result.name || trimmedName,
        description: result.description || trimmedDesc || null,
        style: trimmedStyle || null,
        sourceSongId: typeof songId === "string" ? songId : null,
      },
      select: PERSONA_SELECT,
    });

    return success(persona);
  } catch (error) {
    if (error instanceof SunoApiError) {
      const msg =
        error.status === 400
          ? "Invalid parameters. Vocal segment must be 10-30 seconds."
          : "Failed to create persona. Please try again.";
      return Err.upstream(msg, error.status >= 500 ? 502 : error.status);
    }
    throw error;
  }
}
