import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/playlists/invite/[token] — fetch invite info (no auth required)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const collaborator = await prisma.playlistCollaborator.findUnique({
      where: { inviteToken: token },
      include: {
        playlist: {
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { songs: true } },
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!collaborator) {
      return NextResponse.json({ error: "Invite not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (collaborator.status === "accepted") {
      return NextResponse.json({ error: "Invite already accepted", code: "ALREADY_USED" }, { status: 410 });
    }

    if (new Date() > collaborator.inviteExpiresAt) {
      return NextResponse.json({ error: "Invite expired", code: "EXPIRED" }, { status: 410 });
    }

    return NextResponse.json({
      invite: {
        id: collaborator.id,
        status: collaborator.status,
        expiresAt: collaborator.inviteExpiresAt,
        playlist: collaborator.playlist,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// POST /api/playlists/invite/[token] — accept invite
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const collaborator = await prisma.playlistCollaborator.findUnique({
      where: { inviteToken: token },
      include: {
        playlist: { select: { id: true, name: true, userId: true } },
      },
    });

    if (!collaborator) {
      return NextResponse.json({ error: "Invite not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (collaborator.status === "accepted") {
      return NextResponse.json({ error: "Invite already accepted", code: "ALREADY_USED" }, { status: 410 });
    }

    if (new Date() > collaborator.inviteExpiresAt) {
      return NextResponse.json({ error: "Invite expired", code: "EXPIRED" }, { status: 410 });
    }

    // Owner cannot join as collaborator
    if (collaborator.playlist.userId === userId) {
      return NextResponse.json(
        { error: "You own this playlist", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Already a collaborator on this playlist?
    const existing = await prisma.playlistCollaborator.findFirst({
      where: { playlistId: collaborator.playlistId, userId, status: "accepted" },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Already a collaborator", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const updated = await prisma.playlistCollaborator.update({
      where: { id: collaborator.id },
      data: { userId, status: "accepted" },
    });

    return NextResponse.json({
      collaborator: { id: updated.id, status: updated.status },
      playlistId: collaborator.playlistId,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
