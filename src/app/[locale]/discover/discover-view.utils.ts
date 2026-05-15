export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "highest_rated", label: "Highest Rated" },
  { value: "most_played", label: "Most Played" },
] as const;

export const TEMPO_PRESETS = [
  { label: "Slow", min: 0, max: 80 },
  { label: "Medium", min: 81, max: 120 },
  { label: "Fast", min: 121, max: 999 },
] as const;

export const FALLBACK_GENRE_TAGS = [
  "Pop",
  "Rock",
  "Hip-Hop",
  "Electronic",
  "Jazz",
  "Classical",
  "R&B",
  "Country",
  "Lo-Fi",
  "Ambient",
  "Metal",
  "Folk",
  "Indie",
  "Funk",
  "Soul",
];

export const FALLBACK_MOOD_TAGS = [
  "Energetic",
  "Chill",
  "Dark",
  "Uplifting",
  "Melancholic",
  "Dreamy",
  "Epic",
  "Relaxed",
  "Happy",
  "Romantic",
];

const MOOD_KEYWORDS_CLIENT = new Set([
  "energetic",
  "chill",
  "dark",
  "uplifting",
  "melancholic",
  "aggressive",
  "relaxed",
  "happy",
  "sad",
  "epic",
  "dreamy",
  "intense",
  "romantic",
  "mysterious",
  "peaceful",
  "angry",
  "nostalgic",
  "euphoric",
  "somber",
  "atmospheric",
  "hypnotic",
  "groovy",
  "emotional",
  "powerful",
  "calm",
]);

export function formatDuration(seconds: number | null): string {
  if (!seconds || Number.isNaN(seconds) || !Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function parseSongTags(tagsStr: string | null): {
  genres: string[];
  moods: string[];
} {
  if (!tagsStr) return { genres: [], moods: [] };

  const parts = tagsStr
    .split(/[,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const genres: string[] = [];
  const moods: string[] = [];

  for (const part of parts) {
    if (MOOD_KEYWORDS_CLIENT.has(part.toLowerCase())) {
      moods.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    } else {
      genres.push(part.charAt(0).toUpperCase() + part.slice(1));
    }
  }

  return { genres: genres.slice(0, 3), moods: moods.slice(0, 2) };
}
