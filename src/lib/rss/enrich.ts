import { stripTags } from "./parse";
import type { RssItem } from "./types";

const MOOD_KEYWORDS: Record<string, string[]> = {
  energetic: ["energy", "upbeat", "dance", "party", "fast", "hype", "pump", "power", "fire"],
  chill: ["chill", "relax", "calm", "peaceful", "mellow", "easy", "smooth", "laid-back"],
  melancholic: ["sad", "melanchol", "lonely", "heartbreak", "loss", "grief", "sorrow", "cry"],
  romantic: ["love", "romance", "romantic", "heart", "passion", "kiss", "tender"],
  uplifting: ["hope", "inspir", "uplift", "joy", "happy", "bright", "sunshine", "positive"],
  dark: ["dark", "shadow", "night", "doom", "heavy", "grim", "sinister"],
  dreamy: ["dream", "ethereal", "float", "ambient", "space", "cosmic", "haze"],
  intense: ["intense", "rage", "fury", "epic", "battle", "storm", "chaos"],
};

const TOPIC_KEYWORDS = [
  "rock", "pop", "jazz", "blues", "classical", "electronic", "hip-hop", "rap",
  "country", "folk", "metal", "punk", "r&b", "soul", "reggae", "latin",
  "ambient", "lo-fi", "cinematic", "orchestral", "acoustic", "vocal",
  "guitar", "piano", "synth", "drums", "bass", "violin",
  "summer", "winter", "night", "morning", "rain", "ocean", "city", "nature",
  "love", "freedom", "adventure", "nostalgia", "rebellion", "peace",
];

const MOOD_STYLE_MAP: Record<string, string[]> = {
  energetic: ["upbeat", "driving beat", "high energy"],
  chill: ["lo-fi", "downtempo", "mellow groove"],
  melancholic: ["ballad", "slow tempo", "minor key"],
  romantic: ["smooth", "intimate vocals", "soft"],
  uplifting: ["anthemic", "major key", "soaring melody"],
  dark: ["heavy", "minor key", "brooding"],
  dreamy: ["ambient", "ethereal", "reverb-heavy"],
  intense: ["epic", "powerful", "dramatic build"],
};

export function detectMood(text: string): string {
  const lower = text.toLowerCase();
  let best = "neutral";
  let bestScore = 0;
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = mood;
    }
  }
  return best;
}

export function extractTopics(text: string): string[] {
  const lower = text.toLowerCase();
  return TOPIC_KEYWORDS.filter((t) => lower.includes(t)).slice(0, 5);
}

export function suggestStyle(mood: string, topics: string[]): string {
  const parts: string[] = [];

  const genres = [
    "rock", "pop", "jazz", "blues", "classical", "electronic", "hip-hop", "rap",
    "country", "folk", "metal", "punk", "r&b", "soul", "reggae", "latin",
    "ambient", "lo-fi", "cinematic", "orchestral", "acoustic",
  ];
  const genrePick = topics.find((t) => genres.includes(t));
  if (genrePick) parts.push(genrePick);

  const instruments = ["guitar", "piano", "synth", "drums", "bass", "violin", "vocal"];
  const instrPick = topics.find((t) => instruments.includes(t));
  if (instrPick) parts.push(instrPick);

  const moodStyles = MOOD_STYLE_MAP[mood];
  if (moodStyles) parts.push(moodStyles[0]);

  if (parts.length === 0) {
    return mood !== "neutral" ? `${mood} indie` : "indie, alternative";
  }

  return parts.join(", ");
}

export function buildExcerpt(description: string, maxLen = 800): string {
  const plain = stripTags(description).trim();
  if (plain.length <= maxLen) return plain;

  const region = plain.slice(0, maxLen);
  const sentenceEnd = Math.max(
    region.lastIndexOf(". "),
    region.lastIndexOf("! "),
    region.lastIndexOf("? "),
  );

  if (sentenceEnd > maxLen * 0.4) {
    return plain.slice(0, sentenceEnd + 1).trim();
  }

  const lastSpace = region.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.4) {
    return plain.slice(0, lastSpace).trim() + "…";
  }

  return region.trim() + "…";
}

export function enrichItem(item: RssItem): RssItem {
  const text = `${item.title} ${item.description} ${item.content ?? ""}`;
  const mood = detectMood(text);
  const topics = extractTopics(text);
  const excerpt = item.description ? buildExcerpt(item.description) : undefined;
  return {
    ...item,
    mood,
    topics,
    suggestedStyle: suggestStyle(mood, topics),
    excerpt,
  };
}
