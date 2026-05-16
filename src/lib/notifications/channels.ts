/**
 * Per-NotificationType channel configuration — the single source of truth
 * for "which channels fire when this type of notification is created."
 *
 * Adding a new NotificationType triggers a TypeScript error here unless
 * its channels are explicitly declared (or declared empty for "in-app
 * only"). This forces a deliberate channel decision at the point a new
 * type is introduced, instead of silently inheriting "no push, no email."
 *
 * Channels:
 *   - in-app   — always fires (DB row + SSE broadcast). Not configurable.
 *   - push     — gated by the user's push preference column.
 *   - email    — gated by the user's email preference column + presence
 *                of an email address + unsubscribe-token bootstrap.
 *
 * The `send` field on the email config closes over the email-template
 * choice — adding a new emailed notification type means adding both the
 * pref field on the User schema AND the `send` lambda here.
 */
import { sendGenerationCompleteEmail } from "@/lib/email";
import type { NotificationType } from "./types";

export type PushPrefField =
  | "pushGenerationComplete"
  | "pushNewFollower"
  | "pushSongComment";

export type EmailPrefField = "emailGenerationComplete";

export interface PushChannelConfig {
  prefField: PushPrefField;
}

export interface EmailSendParams {
  songId: string | null | undefined;
  title: string;
  message: string;
}

export interface EmailChannelConfig {
  prefField: EmailPrefField;
  send: (
    params: EmailSendParams,
    email: string,
    unsubscribeToken: string,
  ) => Promise<void>;
}

export interface NotificationChannels {
  push?: PushChannelConfig;
  email?: EmailChannelConfig;
}

export const NOTIFICATION_CHANNELS: Record<NotificationType, NotificationChannels> = {
  generation_complete: {
    push: { prefField: "pushGenerationComplete" },
    email: {
      prefField: "emailGenerationComplete",
      send: (params, email, token) =>
        sendGenerationCompleteEmail(
          email,
          { id: params.songId ?? "", title: params.title },
          token,
        ),
    },
  },
  song_comment: { push: { prefField: "pushSongComment" } },
  new_follower: { push: { prefField: "pushNewFollower" } },
  generation_failed: {},
  import_complete: {},
  error: {},
  rate_limit_reset: {},
  announcement: {},
  credit_update: {},
  payment_failed: {},
  new_song_from_following: {},
  playlist_invite: {},
  milestone_earned: {},
  low_credits: {},
};
