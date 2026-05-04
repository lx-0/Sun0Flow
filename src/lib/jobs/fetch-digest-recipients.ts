import { prisma } from "@/lib/prisma";
import type { DigestRecipient } from "./types";

const ACTIVE_WINDOW_DAYS = 30;

export async function fetchDigestRecipients(): Promise<DigestRecipient[]> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return prisma.user.findMany({
    where: {
      emailDigestFrequency: "weekly",
      email: { not: null },
      isDisabled: false,
      lastLoginAt: { gte: cutoff },
    },
    select: {
      id: true,
      email: true,
      unsubscribeToken: true,
      _count: { select: { songs: true } },
    },
  });
}
