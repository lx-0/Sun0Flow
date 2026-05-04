import { prisma } from "@/lib/prisma";
import { collectItems } from "./collect-items";
import { selectPicks } from "./select-picks";
import { MAX_FEEDS, MAX_DIGESTS_PER_USER } from "./types";

export type { DigestItem } from "./types";

export async function generateDigest(userId: string) {
  const feeds = await prisma.rssFeedSubscription.findMany({
    where: { userId },
    take: MAX_FEEDS,
    orderBy: { createdAt: "asc" },
    select: { url: true, title: true },
  });

  if (feeds.length === 0) return null;

  const allItems = await collectItems(feeds);
  if (allItems.length === 0) return null;

  const selected = selectPicks(allItems);

  const now = new Date();
  const title = `Today's Picks — ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  const digest = await prisma.inspirationDigest.create({
    data: {
      userId,
      title,
      items: selected as object[],
    },
  });

  const oldest = await prisma.inspirationDigest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: MAX_DIGESTS_PER_USER,
    select: { id: true },
  });
  if (oldest.length > 0) {
    await prisma.inspirationDigest.deleteMany({
      where: { id: { in: oldest.map((d) => d.id) } },
    });
  }

  return { ...digest, items: selected };
}
