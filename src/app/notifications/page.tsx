import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { NotificationsView } from "@/components/NotificationsView";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Stay up to date with activity on your SunoFlow account.",
  robots: { index: false },
};

const PAGE_SIZE = 20;

async function fetchNotifications() {
  try {
    const session = await auth();
    if (!session?.user?.id)
      return { notifications: [], nextCursor: null, total: 0 };

    const where = { userId: session.user.id };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE + 1,
      }),
      prisma.notification.count({ where }),
    ]);

    const hasMore = notifications.length > PAGE_SIZE;
    const sliced = hasMore ? notifications.slice(0, PAGE_SIZE) : notifications;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    // Serialize Date to string for client component
    const serialized = sliced.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    }));

    return { notifications: serialized, nextCursor, total };
  } catch {
    return { notifications: [], nextCursor: null, total: 0 };
  }
}

export default async function NotificationsPage() {
  const { notifications, nextCursor, total } = await fetchNotifications();

  return (
    <AppShell>
      <NotificationsView
        initialNotifications={notifications}
        initialNextCursor={nextCursor}
        initialTotal={total}
      />
    </AppShell>
  );
}
