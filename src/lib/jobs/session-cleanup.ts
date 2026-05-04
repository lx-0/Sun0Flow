import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function sessionCleanup(): Promise<void> {
  const { count } = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  logger.info({ deleted: count }, "jobs: session-cleanup done");
}
