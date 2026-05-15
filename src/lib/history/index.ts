import { prisma } from "@/lib/prisma";
import { cursorPaginate } from "@/lib/pagination";

const MAX_HISTORY = 50;
const DEDUP_WINDOW_MS = 5_000;

const historySongSelect = {
  id: true,
  title: true,
  imageUrl: true,
  audioUrl: true,
  duration: true,
  lyrics: true,
  generationStatus: true,
  archivedAt: true,
} as const;

export interface ListPlayHistoryOptions {
  limit: number;
  cursor?: string;
}

export async function listPlayHistory(
  userId: string,
  options: ListPlayHistoryOptions,
) {
  const { limit, cursor } = options;

  const [items, [{ count: rawTotal }]] = await Promise.all([
    prisma.playHistory.findMany({
      where: { userId },
      orderBy: { playedAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { song: { select: historySongSelect } },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count FROM "PlayHistory" WHERE "userId" = ${userId}
    `,
  ]);

  const page = cursorPaginate(items, limit);

  return { ...page, total: Number(rawTotal) };
}

export type RecordPlayResult =
  | { status: "not_found" }
  | { status: "deduped" }
  | { status: "recorded"; entry: { id: string; userId: string; songId: string; playedAt: Date } };

export async function recordPlay(
  userId: string,
  songId: string,
): Promise<RecordPlayResult> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    select: { id: true },
  });
  if (!song) {
    return { status: "not_found" };
  }

  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS);
  const recent = await prisma.playHistory.findFirst({
    where: { userId, songId, playedAt: { gte: cutoff } },
    select: { id: true },
  });
  if (recent) {
    return { status: "deduped" };
  }

  const entry = await prisma.playHistory.create({
    data: { userId, songId },
  });

  prisma.playHistory
    .findMany({
      where: { userId },
      orderBy: { playedAt: "desc" },
      skip: MAX_HISTORY,
      select: { id: true },
    })
    .then((old) => {
      if (old.length === 0) return;
      return prisma.playHistory.deleteMany({
        where: { id: { in: old.map((e) => e.id) } },
      });
    })
    .catch(() => {});

  return { status: "recorded", entry };
}

export async function clearHistory(userId: string): Promise<void> {
  await prisma.playHistory.deleteMany({ where: { userId } });
}
