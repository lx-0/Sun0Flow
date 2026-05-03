import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import crypto from "crypto";

const INVITE_TTL_DAYS = 7;

function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

// GET /api/playlists/[id]/collaborators — list collaborators (owner only)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const collaborators = await prisma.playlistCollaborator.findMany({
      where: { playlistId: playlist.id },
      include: {
        user: { select: { id: true, name: true, image: true, avatarUrl: true, username: true } },
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

// POST /api/playlists/[id]/collaborators
// Body: {} — generate a shareable invite link
// Body: { username: string, role?: "editor"|"viewer" } — invite by username (auto-accepted)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId },
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

    const body = await request.json().catch(() => ({}));
    const { username, role } = body as { username?: string; role?: string };
    const collaboratorRole = role === "viewer" ? "viewer" : "editor";

    const inviteExpiresAt = new Date();
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + INVITE_TTL_DAYS);

    // Invite by username — look up user and auto-accept
    if (username) {
      if (typeof username !== "string" || username.trim().length === 0) {
        return NextResponse.json(
          { error: "username is required", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      const targetUser = await prisma.user.findFirst({
        where: { username: username.trim() },
        select: { id: true, name: true, image: true, avatarUrl: true, username: true },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "User not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      if (targetUser.id === userId) {
        return NextResponse.json(
          { error: "You own this playlist", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      // Check if already a collaborator
      const existing = await prisma.playlistCollaborator.findFirst({
        where: { playlistId: playlist.id, userId: targetUser.id, status: "accepted" },
      });
      if (existing) {
        return NextResponse.json(
          { error: "User is already a collaborator", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      const collaborator = await prisma.playlistCollaborator.create({
        data: {
          playlistId: playlist.id,
          userId: targetUser.id,
          inviteToken: generateInviteToken(),
          inviteExpiresAt,
          status: "accepted",
          role: collaboratorRole,
        },
        include: {
          user: { select: { id: true, name: true, image: true, avatarUrl: true, username: true } },
        },
      });

      // Notify the invitee
      try {
        const inviterUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        const inviterName = inviterUser?.name ?? "Someone";
        await createNotification({
          userId: targetUser.id,
          type: "playlist_invite",
          title: "Playlist invite",
          message: `${inviterName} invited you to collaborate on "${playlist.name}"`,
          href: `/playlists/${playlist.id}`,
        });
      } catch {
        // Non-critical
      }

      return NextResponse.json({ collaborator }, { status: 201 });
    }

    // Generate shareable invite link
    const collaborator = await prisma.playlistCollaborator.create({
      data: {
        playlistId: playlist.id,
        inviteToken: generateInviteToken(),
        inviteExpiresAt,
        status: "pending",
        role: collaboratorRole,
      },
    });

    return NextResponse.json(
      {
        collaborator: {
          id: collaborator.id,
          inviteToken: collaborator.inviteToken,
          inviteExpiresAt: collaborator.inviteExpiresAt,
          status: collaborator.status,
          role: collaborator.role,
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
