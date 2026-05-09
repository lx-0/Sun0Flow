import type { RssItem } from "@/lib/rss";

export interface BuiltPrompt {
  name: string;
  prompt: string;
  style: string;
  excerpt: string | null;
}

const MOOD_TEMPLATES: Record<string, string[]> = {
  energetic: [
    "An energetic anthem capturing the thrill of {theme}. {texture}",
    "A high-energy track fueled by {theme}. {texture}",
  ],
  chill: [
    "A laid-back groove reflecting on {theme}. {texture}",
    "A mellow, drifting piece inspired by {theme}. {texture}",
  ],
  melancholic: [
    "A bittersweet ballad about {theme}. {texture}",
    "A hauntingly beautiful song dwelling on {theme}. {texture}",
  ],
  romantic: [
    "A tender love song woven around {theme}. {texture}",
    "An intimate, heartfelt piece about {theme}. {texture}",
  ],
  uplifting: [
    "An uplifting anthem celebrating {theme}. {texture}",
    "A soaring, hopeful track inspired by {theme}. {texture}",
  ],
  dark: [
    "A brooding, atmospheric piece exploring {theme}. {texture}",
    "A shadowy soundscape immersed in {theme}. {texture}",
  ],
  dreamy: [
    "An ethereal, floating track drifting through {theme}. {texture}",
    "A dreamlike piece painting visions of {theme}. {texture}",
  ],
  intense: [
    "An epic, powerful track channeling {theme}. {texture}",
    "A relentless, storming piece driven by {theme}. {texture}",
  ],
};

const FALLBACK_TEMPLATES = [
  "A song inspired by {theme}. {texture}",
  "A track exploring the world of {theme}. {texture}",
];

function scoreItem(item: RssItem): number {
  let score = 0;
  if (item.mood && item.mood !== "neutral") score += 2;
  if (item.topics && item.topics.length > 0) score += item.topics.length;
  if (item.title && item.title.length > 10) score += 1;
  if (item.description && item.description.length > 20) score += 1;
  return score;
}

export function rankItems(items: RssItem[], limit: number): RssItem[] {
  return items
    .map((item) => ({ item, score: scoreItem(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

function extractCoreTheme(excerpt: string): string {
  const sentenceMatch = excerpt.match(/^(.+?[.!?])\s/);
  const sentence = sentenceMatch ? sentenceMatch[1] : excerpt;

  if (sentence.length <= 120) return sentence.replace(/[.!?]+$/, "").trim();

  const truncated = sentence.slice(0, 120);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
}

function extractArticleContext(excerpt: string, maxLength: number): string {
  const sentences = excerpt
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const candidates = sentences.slice(1, 4);
  if (candidates.length === 0) return "";

  let result = "";
  for (const sentence of candidates) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (next.length > maxLength) {
      if (!result) {
        const truncated = sentence.slice(0, maxLength);
        const lastSpace = truncated.lastIndexOf(" ");
        result = (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
        if (!/[.!?]$/.test(result)) result += ".";
      }
      break;
    }
    result = next;
  }

  return result;
}

function buildTexture(item: RssItem): string {
  const parts: string[] = [];

  if (item.suggestedStyle) {
    parts.push(item.suggestedStyle + " feel");
  } else {
    if (item.topics && item.topics.length > 0) {
      parts.push(item.topics.slice(0, 3).join(" and ") + " textures");
    }
    if (item.mood && item.mood !== "neutral") {
      parts.push(`${item.mood} energy`);
    }
  }

  return parts.length > 0 ? parts.join(" with ") : "indie, alternative feel";
}

function buildStyle(item: RssItem): string {
  if (item.suggestedStyle) return item.suggestedStyle;

  return [
    item.mood && item.mood !== "neutral" ? item.mood : "",
    ...(item.topics?.slice(0, 3) ?? []),
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildPromptFromItem(item: RssItem): BuiltPrompt {
  const titleClean = item.title.replace(/\s+/g, " ").trim();
  const excerpt = item.excerpt || item.description || "";
  const hasContent = excerpt.length > 20;

  let prompt: string;

  if (hasContent) {
    const theme = extractCoreTheme(excerpt);
    const texture = buildTexture(item);

    const templates =
      (item.mood && MOOD_TEMPLATES[item.mood]) || FALLBACK_TEMPLATES;
    const template = templates[titleClean.length % templates.length];

    prompt = template.replace("{theme}", theme).replace("{texture}", texture);

    const TARGET_MAX = 400;
    const contextBudget = TARGET_MAX - prompt.length - 1;
    if (contextBudget > 40) {
      const context = extractArticleContext(excerpt, contextBudget);
      if (context) {
        prompt = `${prompt} ${context}`;
      }
    }
  } else {
    const parts: string[] = [];
    if (item.mood && item.mood !== "neutral") parts.push(`${item.mood} mood`);
    if (item.topics && item.topics.length > 0) parts.push(item.topics.join(", "));
    if (titleClean.length > 5 && titleClean.length < 120) {
      parts.push(`inspired by "${titleClean}"`);
    }
    prompt = parts.length > 0 ? parts.join(". ") : titleClean;
  }

  return {
    name: titleClean.slice(0, 60) || "Auto-generated prompt",
    prompt,
    style: buildStyle(item),
    excerpt: item.excerpt ?? null,
  };
}

export function buildSimplePromptFromItem(item: {
  title: string;
  description: string;
  content?: string;
  mood?: string;
  topics?: string[];
  suggestedStyle?: string;
}): { prompt: string; style: string } {
  const parts: string[] = [];

  if (item.mood && item.mood !== "neutral") {
    parts.push(`${item.mood} mood`);
  }
  if (item.topics && item.topics.length > 0) {
    parts.push(item.topics.join(", "));
  }
  const titleClean = item.title.replace(/\s+/g, " ").trim();
  if (titleClean.length > 5 && titleClean.length < 120) {
    parts.push(`inspired by "${titleClean}"`);
  }
  const body = item.content || item.description || "";
  if (body.length > 20) {
    parts.push(body.slice(0, 1500));
  }

  const prompt = parts.length > 0 ? parts.join(". ") : titleClean;

  if (item.suggestedStyle) {
    return { prompt, style: item.suggestedStyle };
  }

  const styleParts: string[] = [];
  if (item.mood && item.mood !== "neutral") styleParts.push(item.mood);
  if (item.topics && item.topics.length > 0) styleParts.push(...item.topics.slice(0, 3));

  return { prompt, style: styleParts.join(", ") };
}
