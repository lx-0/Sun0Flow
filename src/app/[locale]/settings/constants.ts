export const STYLE_OPTIONS = [
  "pop",
  "rock",
  "electronic",
  "hip-hop",
  "jazz",
  "classical",
  "r&b",
  "country",
  "folk",
  "ambient",
  "metal",
  "latin",
  "instrumental",
  "lo-fi",
  "cinematic",
] as const;

export const IG_POSTS_KEY = "sunoflow_ig_posts";

export const EMAIL_BOOL_NOTIF_TYPES = [
  { key: "emailWelcome", label: "Welcome & tips", description: "Onboarding emails and feature announcements" },
  { key: "emailGenerationComplete", label: "Generation complete", description: "Email me when a song finishes generating (opt-in)" },
] as const;

export const DIGEST_FREQUENCY_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: i, label };
});

export const NOTIF_PREFS_KEY = "sunoflow_notif_prefs";
export const NOTIFICATION_TYPES = [
  { key: "generation_complete", label: "Generation complete", description: "When a song finishes generating" },
  { key: "generation_failed", label: "Generation failed", description: "When a generation encounters an error" },
  { key: "song_comment", label: "Song comments", description: "When someone comments on your song" },
  { key: "new_follower", label: "New followers", description: "When someone follows you" },
  { key: "playlist_invite", label: "Playlist invites", description: "When you're invited to collaborate on a playlist" },
  { key: "rate_limit_reset", label: "Rate limit reset", description: "When your rate limit resets" },
  { key: "announcement", label: "Announcements", description: "Product updates and news" },
] as const;

export const PUSH_NOTIF_TYPES = [
  { key: "pushGenerationComplete", label: "Generation complete", description: "When your song finishes generating" },
  { key: "pushNewFollower", label: "New followers", description: "When someone follows you" },
  { key: "pushSongComment", label: "Song comments", description: "When someone comments on your song" },
] as const;

export const PLAYBACK_PREFS_KEY = "sunoflow_playback_prefs";
