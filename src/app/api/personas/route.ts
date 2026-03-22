import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { generatePersona, SunoApiError } from "@/lib/sunoapi";
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { taskId, audioId, name, description, vocalStart, vocalEnd, style, songId } =
      await request.json();

    if (!taskId || !audioId || !name) {
      return NextResponse.json(
        { error: "taskId, audioId, and name are required" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less" }, { status: 400 });
    }

    // Check persona limit (max 50 per user)
    const count = await prisma.persona.count({ where: { userId } });
    if (count >= 50) {
      return NextResponse.json(
        { error: "Maximum of 50 personas reached. Delete some to create new ones." },
        { status: 400 }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);

    const result = await generatePersona(
      {
        taskId,
        audioId,
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
