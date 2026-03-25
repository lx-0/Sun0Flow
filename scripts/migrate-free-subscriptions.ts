/**
 * Migration: create FREE Subscription records for all existing users who don't have one.
 *
 * Run with:
 *   npx tsx scripts/migrate-free-subscriptions.ts
 *
 * Idempotent — skips users who already have a subscription.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { subscription: null },
    select: { id: true },
  });

  console.log(`Found ${users.length} users without a subscription record.`);

  if (users.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: `free_${user.id}`,
          stripeSubscriptionId: `free_sub_${user.id}`,
          stripePriceId: "free",
          tier: "free",
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      succeeded++;
    } catch (err) {
      console.error(`  Failed for userId=${user.id}:`, err);
      failed++;
    }
  }

  console.log(
    `Migration complete: ${succeeded} succeeded, ${failed} failed.`
  );
}

main()
  .catch((err) => {
    console.error("Migration error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
