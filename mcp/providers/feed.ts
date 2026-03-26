/**
 * Resource provider: sunoflow://feed/inspiration
 * Returns the user's latest pending feed-based inspiration items.
 */

import { registerStaticResource } from "../resources";
import { prisma } from "@/lib/prisma";

registerStaticResource({
  uri: "sunoflow://feed/inspiration",
  name: "Inspiration Feed",
  description:
    "Latest inspiration items from the user's RSS feeds awaiting song generation approval.",
  mimeType: "application/json",

  async fetch(userId: string) {
    const items = await prisma.pendingFeedGeneration.findMany({
      where: { userId, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        feedTitle: true,
        itemTitle: true,
        itemLink: true,
        itemPubDate: true,
        prompt: true,
        style: true,
        createdAt: true,
      },
    });

    return {
      uri: "sunoflow://feed/inspiration",
      mimeType: "application/json",
      text: JSON.stringify({ items, total: items.length }, null, 2),
    };
  },
});
