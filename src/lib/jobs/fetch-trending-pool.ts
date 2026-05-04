import { prisma } from "@/lib/prisma";
import type { TrendingCandidate } from "./types";

const POOL_SIZE = 40;

export async function fetchTrendingPool(): Promise<TrendingCandidate[]> {
  return prisma.song.findMany({
    where: { isPublic: true, generationStatus: "ready", isHidden: false },
    orderBy: { playCount: "desc" },
    take: POOL_SIZE,
    select: { id: true, title: true, tags: true, userId: true },
  });
}
