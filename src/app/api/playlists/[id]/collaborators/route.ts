import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const INVITE_TTL_DAYS = 7;

function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

// GET /api/playlists/[id]/collaborators — list collaborators (owner only)
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id: params.id, userId },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const collaborators = await prisma.playlistCollaborator.findMany({
      where: { playlistId: playlist.id },
      include: {
        user: { select: { id: true, name: true, image: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ collaborators });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// POST /api/playlists/[id]/collaborators — generate invite link
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id: params.id, userId },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (!playlist.isCollaborative) {
      return NextResponse.json(
        { error: "Playlist is not collaborative", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const inviteExpiresAt = new Date();
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + INVITE_TTL_DAYS);

    const collaborator = await prisma.playlistCollaborator.create({
      data: {
        playlistId: playlist.id,
        inviteToken: generateInviteToken(),
        inviteExpiresAt,
        status: "pending",
      },
    });

    return NextResponse.json(
      {
        collaborator: {
          id: collaborator.id,
          inviteToken: collaborator.inviteToken,
          inviteExpiresAt: collaborator.inviteExpiresAt,
          status: collaborator.status,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
