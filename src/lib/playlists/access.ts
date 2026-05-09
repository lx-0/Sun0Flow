import { Prisma } from "@prisma/client";

export function ownerWhere(
  playlistId: string,
  userId: string
): Prisma.PlaylistWhereInput {
  return { id: playlistId, userId };
}

export function memberWhere(
  playlistId: string,
  userId: string
): Prisma.PlaylistWhereInput {
  return {
    id: playlistId,
    OR: [
      { userId },
      {
        isCollaborative: true,
        collaborators: { some: { userId, status: "accepted" } },
      },
    ],
  };
}

export function editorWhere(
  playlistId: string,
  userId: string
): Prisma.PlaylistWhereInput {
  return {
    id: playlistId,
    OR: [
      { userId },
      {
        isCollaborative: true,
        collaborators: {
          some: { userId, status: "accepted", role: "editor" },
        },
      },
    ],
  };
}
