import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { generatePersona, getTaskStatus, SunoApiError } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const personas = await prisma.persona.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ personas });
  } catch (error) {
    logServerError("personas-list", error, { route: "/api/personas" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { taskId, name, description, vocalStart, vocalEnd, style, songId } =
      await request.json();

    if (!taskId || !name) {
      return NextResponse.json(
        { error: "taskId and name are required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (typeof name !== "string" || name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    if (description && typeof description === "string" && description.length > 500) {
      return NextResponse.json({ error: "Description must be 500 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // Check persona limit (max 50 per user)
    const count = await prisma.persona.count({ where: { userId } });
    if (count >= 50) {
      return NextResponse.json(
        { error: "Maximum of 50 personas reached. Delete some to create new ones.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);

    // Resolve the Suno clip ID (audioId) from the task — the frontend only
    // knows the taskId, but Suno's persona endpoint needs the clip ID.
    const taskResult = await getTaskStatus(taskId, userApiKey);
    const clip = taskResult.songs[0];
    if (!clip?.id) {
      return NextResponse.json(
        { error: "Could not resolve audio clip from Suno task. The song may have expired (15-day retention).", code: "CLIP_NOT_FOUND" },
        { status: 404 }
      );
    }

    const result = await generatePersona(
      {
        taskId,
        audioId: clip.id,
        name: name.trim(),
        description: description?.trim() || name.trim(),
        vocalStart,
        vocalEnd,
        style: style?.trim() || undefined,
      },
      userApiKey
    );

    const persona = await prisma.persona.create({
      data: {
        userId,
        personaId: result.personaId,
        name: result.name || name.trim(),
        description: result.description || description?.trim() || null,
        style: style?.trim() || null,
        sourceSongId: songId || null,
      },
    });

    return NextResponse.json({ persona }, { status: 201 });
  } catch (error) {
    if (error instanceof SunoApiError) {
      logServerError("personas-create-api", error, { route: "/api/personas" });
      return NextResponse.json(
        { error: error.status === 400 ? "Invalid parameters. Vocal segment must be 10-30 seconds." : "Failed to create persona. Please try again." },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }
    logServerError("personas-create", error, { route: "/api/personas" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
