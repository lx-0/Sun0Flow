export const NOTIFICATION_TYPES = [
  "generation_complete",
  "generation_failed",
  "import_complete",
  "error",
  "rate_limit_reset",
  "announcement",
  "credit_update",
  "payment_failed",
  "song_comment",
  "new_follower",
  "new_song_from_following",
  "playlist_invite",
  "milestone_earned",
  "low_credits",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
