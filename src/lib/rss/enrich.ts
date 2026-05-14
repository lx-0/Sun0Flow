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

const MOOD_STYLE_VARIANTS: Record<string, string[]> = {
  energetic: ["upbeat", "driving", "anthemic", "festival-ready", "pulsing"],
  chill: ["lo-fi", "chilled", "downtempo", "gentle", "sunset"],
  melancholic: ["intimate", "haunting", "wistful", "reflective", "slow burn"],
  romantic: ["lush", "warm", "intimate", "soulful", "tender"],
  uplifting: ["anthemic", "radiant", "hopeful", "sunny", "uplifting"],
  dark: ["brooding", "ominous", "nocturnal", "raw", "tense"],
  dreamy: ["ethereal", "misty", "cinematic", "hazy", "cosmic"],
  intense: ["thunderous", "brutal", "raw energy", "dramatic", "ferocious"],
};

const INSTRUMENT_VARIANTS: Record<string, string[]> = {
  guitar: ["guitar", "clean guitar", "electric guitar", "strummy guitar"],
  piano: ["piano", "acoustic piano", "warm piano", "piano-led"],
  synth: ["synth", "analog synth", "bright synth", "pulsing synth"],
  drums: ["drums", "tight drums", "live drums", "drum machine"],
  bass: ["bassline", "deep bass", "growling bass", "grooving bass"],
  violin: ["violin", "string section", "orchestral strings"],
  vocal: ["vocals", "layered vocals", "female vocals", "male vocals"],
};

function stableSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash);
}

function chooseBySeed<T>(items: T[], seed: number, index: number, fallback = ""): T {
  if (items.length === 0) return fallback as T;
  return items[(seed + index * 37) % items.length];
}

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

export function suggestStyle(mood: string, topics: string[], itemKey = ""): string {
  const seedInput = itemKey
    ? `${itemKey}|${mood}|${topics.join(",")}`
    : `${mood}|${topics.join(",")}`;
  const seed = stableSeed(seedInput);
  const parts: string[] = [];

  const genres = [
    "rock", "pop", "jazz", "blues", "classical", "electronic", "hip-hop", "rap",
    "country", "folk", "metal", "punk", "r&b", "soul", "reggae", "latin",
    "ambient", "lo-fi", "cinematic", "orchestral", "acoustic",
  ];
  const topicGenres = topics.filter((t) => genres.includes(t));
  if (topicGenres.length > 0) {
    parts.push(chooseBySeed(topicGenres, seed, 1, topicGenres[0]));
  }

  const instruments = ["guitar", "piano", "synth", "drums", "bass", "violin", "vocal"];
  const topicInstruments = topics.filter((t) => instruments.includes(t));
  const firstInstrument = topicInstruments[0];
  if (firstInstrument) {
    const variants = INSTRUMENT_VARIANTS[firstInstrument];
    if (variants) {
      parts.push(chooseBySeed(variants, seed, 2, firstInstrument));
    } else {
      parts.push(firstInstrument);
    }
  }

  const moodStyles = MOOD_STYLE_MAP[mood];
  const moodStyleVariants = MOOD_STYLE_VARIANTS[mood] || moodStyles;
  if (moodStyles) {
    const fallbackStyle = moodStyles[0] ?? mood;
    const chosen = chooseBySeed(moodStyleVariants || [fallbackStyle], seed, 3, fallbackStyle);
    parts.push(chosen);
  }

  if (parts.length === 0) {
    return mood !== "neutral" ? `${mood} indie` : "indie, alternative";
  }

  return parts.join(", ");
}

export function buildExcerpt(description: string, maxLen = 1500): string {
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
  const excerptSource = item.content || item.description || "";
  const excerpt = excerptSource ? buildExcerpt(excerptSource) : undefined;
  return {
    ...item,
    mood,
    topics,
    suggestedStyle: suggestStyle(mood, topics, item.link || item.title || ""),
    excerpt,
  };
}
