import { sendWeeklyHighlightsEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { fetchDigestRecipients } from "./fetch-digest-recipients";
import { fetchTrendingPool } from "./fetch-trending-pool";
import { gatherUserHighlights } from "./gather-user-highlights";
import { selectRecommendations } from "./select-recommendations";

const SEND_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function emailDigestSend(): Promise<void> {
  const now = Date.now();
  const users = await fetchDigestRecipients();
  const trendingPool = await fetchTrendingPool();

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;

    try {
      const highlights = await gatherUserHighlights(user.id, now);
      const recommendedSongs = selectRecommendations(trendingPool, user.id);

      await sendWeeklyHighlightsEmail(
        user.email,
        {
          topSongs: highlights.topSongs,
          totalSongs: user._count.songs,
          weekGenerations: highlights.weekGenerations,
          totalPlaysReceived: highlights.totalPlaysReceived,
          newFollowers: highlights.newFollowers,
          recommendedSongs,
        },
        user.unsubscribeToken ?? user.id
      );
      sent++;
    } catch (err) {
      failed++;
      logger.error({ userId: user.id, err }, "jobs: email-digest-send user failed");
    }

    await sleep(SEND_DELAY_MS);
  }

  logger.info({ sent, failed, total: users.length }, "jobs: email-digest-send done");
}
