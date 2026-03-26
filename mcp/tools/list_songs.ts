/**
 * list_songs tool — paginated library browse with optional filters.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";

registerTool({
  name: "list_songs",
  description:
    "Browse the user's song library with optional filters. Returns paginated results. Pass the nextCursor from a previous response to fetch the next page.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Number of songs to return (1–100, default 20).",
        minimum: 1,
        maximum: 100,
      },
      cursor: {
        type: "string",
        description: "Pagination cursor returned by a previous list_songs call.",
      },
      genre: {
        type: "string",
        description: "Filter by genre (partial match on song tags).",
      },
      mood: {
        type: "string",
        description: "Filter by mood (partial match on song tags).",
      },
      status: {
        type: "string",
        enum: ["ready", "pending", "failed"],
        description: "Filter by generation status.",
      },
    },
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { limit: rawLimit, cursor, genre, mood, status } = input as {
      limit?: number;
      cursor?: string;
      genre?: string;
      mood?: string;
      status?: string;
    };

    const limit =
      rawLimit !== undefined && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 20;

    // Build WHERE
    const andFilters: object[] = [];

    if (genre) {
      andFilters.push({ tags: { contains: genre, mode: "insensitive" } });
    }
    if (mood) {
      andFilters.push({ tags: { contains: mood, mode: "insensitive" } });
    }

    const where = {
      userId,
      parentSongId: null,
      archivedAt: null,
      ...(status && ["ready", "pending", "failed"].includes(status)
        ? { generationStatus: status }
        : {}),
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    };

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          title: true,
          prompt: true,
          tags: true,
          audioUrl: true,
          imageUrl: true,
          duration: true,
          generationStatus: true,
          isInstrumental: true,
          createdAt: true,
        },
      }),
      prisma.song.count({ where }),
    ]);

    const hasMore = songs.length > limit;
    const sliced = hasMore ? songs.slice(0, limit) : songs;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    return { songs: sliced, nextCursor, total };
  },
});
