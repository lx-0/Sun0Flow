import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { HistoryView } from "@/components/HistoryView";
import { HistorySkeleton } from "@/components/Skeleton";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Generation History",
  description: "Review your past music generation requests and results.",
  robots: { index: false },
};
import { prisma } from "@/lib/prisma";
import type { Song } from "@prisma/client";

const PAGE_SIZE = 20;

async function fetchHistory(): Promise<{
  songs: Song[];
  nextCursor: string | null;
  total: number;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { songs: [], nextCursor: null, total: 0 };

    const where = { userId: session.user.id };

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE + 1,
      }),
      prisma.song.count({ where }),
    ]);

    const hasMore = songs.length > PAGE_SIZE;
    const sliced = hasMore ? songs.slice(0, PAGE_SIZE) : songs;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    return { songs: sliced, nextCursor, total };
  } catch {
    return { songs: [], nextCursor: null, total: 0 };
  }
}

async function HistoryContent() {
  const { songs, nextCursor, total } = await fetchHistory();
  return (
    <HistoryView
      songs={songs}
      initialNextCursor={nextCursor}
      initialTotal={total}
    />
  );
}

export default function HistoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<HistorySkeleton />}>
        <HistoryContent />
      </Suspense>
    </AppShell>
  );
}
