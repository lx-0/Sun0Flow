import { prisma } from "@/lib/prisma";

// "Active" = produced any signal in Activity (created/favorited a song,
// touched a playlist) OR listened to a song (PlayHistory). lastLoginAt is
// not used because session.strategy="jwt" only writes it on fresh sign-in,
// so users with valid JWTs appear inactive for the JWT lifetime.

export async function countActiveUsers(since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT "userId")::bigint AS count FROM (
      SELECT "userId" FROM "Activity"     WHERE "createdAt" >= ${since}
      UNION ALL
      SELECT "userId" FROM "PlayHistory"  WHERE "playedAt"  >= ${since}
    ) AS u
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function listActiveUserIds(since: Date): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT DISTINCT "userId" FROM (
      SELECT "userId" FROM "Activity"     WHERE "createdAt" >= ${since}
      UNION ALL
      SELECT "userId" FROM "PlayHistory"  WHERE "playedAt"  >= ${since}
    ) AS u
  `;
  return rows.map((r) => r.userId);
}

export async function dailyActiveUserCounts(
  since: Date
): Promise<Array<{ date: string; count: number }>> {
  const rows = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
    SELECT day::date AS date, COUNT(DISTINCT "userId")::bigint AS count FROM (
      SELECT "userId", DATE("createdAt") AS day FROM "Activity"
        WHERE "createdAt" >= ${since}
      UNION ALL
      SELECT "userId", DATE("playedAt")  AS day FROM "PlayHistory"
        WHERE "playedAt" >= ${since}
    ) AS u(userId, day)
    GROUP BY day
    ORDER BY day ASC
  `;
  return rows.map((r) => ({
    date: new Date(r.date).toISOString().split("T")[0],
    count: Number(r.count),
  }));
}
