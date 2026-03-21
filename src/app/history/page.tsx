import { AppShell } from "@/components/AppShell";
import { HistoryView } from "@/components/HistoryView";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Song } from "@prisma/client";

async function fetchHistory(): Promise<Song[]> {
  try {
    const session = await auth();
    if (!session?.user?.id) return [];
    return await prisma.song.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return [];
  }
}

export default async function HistoryPage() {
  const songs = await fetchHistory();

  return (
    <AppShell>
      <HistoryView songs={songs} />
    </AppShell>
  );
}
