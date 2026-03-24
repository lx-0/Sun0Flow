import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isDev = process.env.NODE_ENV !== "production";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev
      ? [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ]
      : [
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ],
  });

if (isDev) {
  // Log slow queries (>100ms) to help identify N+1s and missing indexes
  prisma.$on("query" as never, (e: { query: string; duration: number }) => {
    if (e.duration > 100) {
      console.warn(`[prisma] slow query (${e.duration}ms): ${e.query}`);
    }
  });

  globalForPrisma.prisma = prisma;
}
