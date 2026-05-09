import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { ownerWhere, memberWhere } from "./access";
import { INVITE_TTL_DAYS } from "./constants";
import { success, Err } from "./result";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";

function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function inviteExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

export async function listCollaborators(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  const collaborators = await prisma.playlistCollaborator.findMany({
    where: { playlistId: playlist.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          avatarUrl: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return success({ collaborators });
}

export async function inviteByUsername(
  playlistId: string,
  ownerId: string,
  username: string,
  role?: string,
) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, ownerId),
  });
  if (!playlist) return Err.notFound();

  if (!playlist.isCollaborative) {
    return Err.validation("Playlist is not collaborative");
  }

  if (typeof username !== "string" || username.trim().length === 0) {
    return Err.validation("username is required");
  }

  const collaboratorRole = role === "viewer" ? "viewer" : "editor";

  const targetUser = await prisma.user.findFirst({
    where: { username: username.trim() },
    select: {
      id: true,
      name: true,
      image: true,
      avatarUrl: true,
      username: true,
    },
  });
  if (!targetUser) return Err.notFound("User not found");

  if (targetUser.id === ownerId) {
    return Err.validation("You own this playlist");
  }

  const existing = await prisma.playlistCollaborator.findFirst({
    where: {
      playlistId: playlist.id,
      userId: targetUser.id,
      status: "accepted",
    },
  });
  if (existing) return Err.validation("User is already a collaborator");

  const collaborator = await prisma.playlistCollaborator.create({
    data: {
      playlistId: playlist.id,
      userId: targetUser.id,
      inviteToken: generateInviteToken(),
      inviteExpiresAt: inviteExpiresAt(),
      status: "accepted",
      role: collaboratorRole,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          avatarUrl: true,
          username: true,
        },
      },
    },
  });

  try {
    const inviterUser = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true },
    });
    await createNotification({
      userId: targetUser.id,
      type: "playlist_invite",
      title: "Playlist invite",
      message: `${inviterUser?.name ?? "Someone"} invited you to collaborate on "${playlist.name}"`,
      href: `/playlists/${playlist.id}`,
    });
  } catch {
    // Non-critical
  }

  return success({ collaborator });
}

export async function createInviteLink(
  playlistId: string,
  ownerId: string,
  role?: string,
) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, ownerId),
  });
  if (!playlist) return Err.notFound();

  if (!playlist.isCollaborative) {
    return Err.validation("Playlist is not collaborative");
  }

  const collaboratorRole = role === "viewer" ? "viewer" : "editor";

  const collaborator = await prisma.playlistCollaborator.create({
    data: {
      playlistId: playlist.id,
      inviteToken: generateInviteToken(),
      inviteExpiresAt: inviteExpiresAt(),
      status: "pending",
      role: collaboratorRole,
    },
  });

  return success({
    collaborator: {
      id: collaborator.id,
      inviteToken: collaborator.inviteToken,
      inviteExpiresAt: collaborator.inviteExpiresAt,
      status: collaborator.status,
      role: collaborator.role,
    },
  });
}

export async function removeCollaborator(
  playlistId: string,
  ownerId: string,
  collaboratorId: string,
) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, ownerId),
  });
  if (!playlist) return Err.notFound();

  const collaborator = await prisma.playlistCollaborator.findFirst({
    where: { id: collaboratorId, playlistId: playlist.id },
  });
  if (!collaborator) return Err.notFound("Collaborator not found");

  await prisma.playlistCollaborator.delete({ where: { id: collaborator.id } });
  return success({ success: true as const });
}

export async function toggleCollaborative(
  playlistId: string,
  userId: string,
) {
  const playlist = await prisma.playlist.findFirst({
    where: ownerWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  const updated = await prisma.playlist.update({
    where: { id: playlist.id },
    data: { isCollaborative: !playlist.isCollaborative },
  });

  invalidateByPrefix(cacheKey("playlists", userId));
  return success({ isCollaborative: updated.isCollaborative });
}

export async function getInviteInfo(token: string) {
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

  if (!collaborator) return Err.notFound("Invite not found");
  if (collaborator.status === "accepted") {
    return Err.alreadyUsed("Invite already accepted");
  }
  if (new Date() > collaborator.inviteExpiresAt) {
    return Err.expired("Invite expired");
  }

  return success({
    invite: {
      id: collaborator.id,
      status: collaborator.status,
      expiresAt: collaborator.inviteExpiresAt,
      playlist: collaborator.playlist,
    },
  });
}

export async function acceptInvite(token: string, userId: string) {
  const collaborator = await prisma.playlistCollaborator.findUnique({
    where: { inviteToken: token },
    include: {
      playlist: { select: { id: true, name: true, userId: true } },
    },
  });

  if (!collaborator) return Err.notFound("Invite not found");
  if (collaborator.status === "accepted") {
    return Err.alreadyUsed("Invite already accepted");
  }
  if (new Date() > collaborator.inviteExpiresAt) {
    return Err.expired("Invite expired");
  }
  if (collaborator.playlist.userId === userId) {
    return Err.validation("You own this playlist");
  }

  const existing = await prisma.playlistCollaborator.findFirst({
    where: {
      playlistId: collaborator.playlistId,
      userId,
      status: "accepted",
    },
  });
  if (existing) return Err.validation("Already a collaborator");

  const updated = await prisma.playlistCollaborator.update({
    where: { id: collaborator.id },
    data: { userId, status: "accepted" },
  });

  return success({
    collaborator: { id: updated.id, status: updated.status },
    playlistId: collaborator.playlistId,
  });
}

export async function getPlaylistActivity(
  playlistId: string,
  userId: string,
  cursor?: string,
) {
  const PAGE_SIZE = 20;

  const playlist = await prisma.playlist.findFirst({
    where: memberWhere(playlistId, userId),
  });
  if (!playlist) return Err.notFound();

  const activities = await prisma.activity.findMany({
    where: {
      playlistId: playlist.id,
      type: { in: ["song_added_to_playlist", "song_removed_from_playlist"] },
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    include: {
      user: {
        select: { id: true, name: true, image: true, avatarUrl: true },
      },
      song: { select: { id: true, title: true, imageUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  const nextCursor =
    activities.length === PAGE_SIZE
      ? activities[activities.length - 1].id
      : null;

  return success({ activities, nextCursor });
}
