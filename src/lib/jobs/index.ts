import { registerJob } from "@/lib/scheduler";
import { smartPlaylistRefresh } from "./smart-playlist-refresh";
import { emailDigestSend } from "./email-digest";
import { analyticsSnapshot } from "./analytics-snapshot";
import { sessionCleanup } from "./session-cleanup";

export { emailDigestSend } from "./email-digest";
export { smartPlaylistRefresh } from "./smart-playlist-refresh";
export { analyticsSnapshot } from "./analytics-snapshot";
export { sessionCleanup } from "./session-cleanup";
export type { DigestRecipient, TrendingCandidate, UserHighlights } from "./types";

export function registerAllJobs() {
  registerJob("smart-playlist-refresh", "0 3 * * *", smartPlaylistRefresh);
  registerJob("email-digest-send", "0 8 * * 1", emailDigestSend);
  registerJob("analytics-aggregation", "0 * * * *", analyticsSnapshot);
  registerJob("session-cleanup", "0 2 * * *", sessionCleanup);
}
