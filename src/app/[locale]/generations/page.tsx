import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { GenerationHistoryView } from "@/components/GenerationHistoryView";
import { HistorySkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Generation History",
  description: "View all your past generation attempts, retry failures, and save prompts for reuse.",
  robots: { index: false },
};

const PAGE_SIZE = 20;

async function fetchGenerations() {
  try {
    const session = await auth();
    if (!session?.user?.id) return { songs: [], total: 0, nextCursor: null };

    const userId = session.user.id;

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          title: true,
          prompt: true,
          tags: true,
          audioUrl: true,
          imageUrl: true,
          duration: true,
          generationStatus: true,
          errorMessage: true,
          isInstrumental: true,
          source: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.song.count({ where: { userId } }),
    ]);

    const hasMore = songs.length > PAGE_SIZE;
    const page = hasMore ? songs.slice(0, PAGE_SIZE) : songs;
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt?.toISOString() : null;

    return { songs: page, total, nextCursor };
  } catch {
    return { songs: [], total: 0, nextCursor: null };
  }
}

export default async function GenerationsPage() {
  const { songs, total, nextCursor } = await fetchGenerations();

  return (
    <AppShell>
      <Suspense fallback={<HistorySkeleton />}>
        <GenerationHistoryView
          songs={songs.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() }))}
          initialNextCursor={nextCursor}
          initialTotal={total}
        />
      </Suspense>
    </AppShell>
  );
}
