import { prisma } from "@/lib/prisma";
import { sendGenerationCompleteEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import type { PersistedSong } from "./types";

export async function notifyCompletion(userId: string, song: PersistedSong): Promise<void> {
  const userPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailGenerationComplete: true,
      unsubscribeToken: true,
      pushGenerationComplete: true,
    },
  });

  if (userPrefs?.email && userPrefs.emailGenerationComplete) {
    let unsubToken = userPrefs.unsubscribeToken;
    if (!unsubToken) {
      unsubToken = crypto.randomUUID();
      await prisma.user.update({ where: { id: userId }, data: { unsubscribeToken: unsubToken } });
    }
    sendGenerationCompleteEmail(userPrefs.email, { id: song.id, title: song.title }, unsubToken).catch((err) =>
      logger.error({ userId, songId: song.id, err }, "song-completion: failed to send generation complete email")
    );
  }

  if (userPrefs?.pushGenerationComplete !== false) {
    sendPushToUser(userId, {
      title: "Your song is ready!",
      body: `"${song.title || "Untitled"}" has finished generating`,
      url: `/library`,
      tag: `generation-complete-${song.id}`,
    }).catch(() => {});
  }
}
