import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/push/preferences — return user's push notification preferences
export async function GET(request: NextRequest) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pushGenerationComplete: true,
      pushNewFollower: true,
      pushSongComment: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(user);
}

// PATCH /api/push/preferences — update user's push notification preferences
export async function PATCH(request: NextRequest) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const { pushGenerationComplete, pushNewFollower, pushSongComment } = body ?? {};

  const data: Record<string, unknown> = {};

  if (pushGenerationComplete !== undefined) {
    if (typeof pushGenerationComplete !== "boolean") {
      return NextResponse.json(
        { error: "pushGenerationComplete must be a boolean", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    data.pushGenerationComplete = pushGenerationComplete;
  }

  if (pushNewFollower !== undefined) {
    if (typeof pushNewFollower !== "boolean") {
      return NextResponse.json(
        { error: "pushNewFollower must be a boolean", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    data.pushNewFollower = pushNewFollower;
  }

  if (pushSongComment !== undefined) {
    if (typeof pushSongComment !== "boolean") {
      return NextResponse.json(
        { error: "pushSongComment must be a boolean", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    data.pushSongComment = pushSongComment;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      pushGenerationComplete: true,
      pushNewFollower: true,
      pushSongComment: true,
    },
  });

  return NextResponse.json(user);
}
