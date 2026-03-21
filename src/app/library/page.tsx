import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LibraryView } from "@/components/LibraryView";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Song } from "@prisma/client";

async function fetchSongs(): Promise<Song[]> {
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

export default async function LibraryPage() {
  const songs = await fetchSongs();

  return (
    <AppShell>
      <Suspense>
        <LibraryView initialSongs={songs} />
      </Suspense>
    </AppShell>
  );
}
