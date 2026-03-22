/**
 * Instagram integration via oEmbed API.
 *
 * Instagram Basic Display API was deprecated Dec 2024. Instead we use:
 * 1. Instagram oEmbed endpoint (no auth, works for public posts)
 * 2. Caption/hashtag extraction for creative inspiration
 */

export interface InstagramPost {
  url: string;
  authorName: string;
  title: string; // caption text
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  hashtags: string[];
  mood: string;
  promptSuggestion: string;
  error?: string;
}

interface OEmbedResponse {
  author_name?: string;
  title?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

const INSTAGRAM_URL_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/?/;

export function isValidInstagramUrl(url: string): boolean {
  return INSTAGRAM_URL_REGEX.test(url);
}

/**
 * Extract mood/theme keywords from caption text.
 * Simple keyword-based detection for music generation prompts.
 */
function detectMood(text: string): string {
  const lower = text.toLowerCase();
  const moods: [string, string[]][] = [
    ["energetic", ["energy", "hype", "pump", "fire", "lit", "party", "dance", "wild", "excited"]],
    ["chill", ["chill", "relax", "calm", "peaceful", "serene", "quiet", "cozy", "mellow"]],
    ["melancholic", ["sad", "miss", "lonely", "rain", "tears", "broken", "lost", "grief"]],
    ["romantic", ["love", "heart", "kiss", "together", "forever", "darling", "babe", "romance"]],
    ["uplifting", ["happy", "joy", "smile", "sunshine", "blessed", "grateful", "bright", "hope"]],
    ["dark", ["dark", "night", "shadow", "midnight", "gothic", "moody", "storm", "haunted"]],
    ["dreamy", ["dream", "float", "ethereal", "cosmic", "stars", "magic", "wonder", "mystic"]],
    ["intense", ["intense", "power", "strong", "fierce", "rage", "battle", "fight", "scream"]],
  ];

  for (const [mood, keywords] of moods) {
    if (keywords.some((kw) => lower.includes(kw))) return mood;
  }
  return "neutral";
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.map((h) => h.toLowerCase()).slice(0, 10) : [];
}

/**
 * Generate a music generation prompt suggestion from Instagram post content.
 */
function generatePromptSuggestion(
  caption: string,
  hashtags: string[],
  mood: string
): string {
  const parts: string[] = [];

  if (mood !== "neutral") {
    parts.push(`${mood} vibe`);
  }

  // Use meaningful hashtags (skip generic ones)
  const genericTags = new Set([
    "#instagood", "#photooftheday", "#instagram", "#love", "#like",
    "#follow", "#photography", "#photo", "#beautiful", "#art",
    "#picoftheday", "#fashion", "#happy", "#style", "#life",
  ]);
  const meaningfulTags = hashtags
    .filter((h) => !genericTags.has(h) && h.length > 2 && h.length < 20)
    .slice(0, 3)
    .map((h) => h.replace("#", ""));
  if (meaningfulTags.length > 0) {
    parts.push(meaningfulTags.join(", "));
  }

  // Use first sentence of caption if short enough
  const firstSentence = caption.split(/[.!?\n]/)[0]?.trim();
  if (firstSentence && firstSentence.length > 5 && firstSentence.length < 80) {
    parts.push(`"${firstSentence}"`);
  }

  return parts.length > 0 ? parts.join(" — ") : caption.slice(0, 100);
}

/**
 * Fetch Instagram post data via the oEmbed API.
 * Works for public posts without authentication.
 */
export async function fetchInstagramPost(
  postUrl: string
): Promise<InstagramPost> {
  if (!isValidInstagramUrl(postUrl)) {
    return {
      url: postUrl,
      authorName: "",
      title: "",
      hashtags: [],
      mood: "neutral",
      promptSuggestion: "",
      error: "Invalid Instagram URL. Use a post, reel, or IGTV link.",
    };
  }

  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(postUrl)}&omitscript=true`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "SunoFlow/1.0" },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return makeError(postUrl, "Post not found or is private");
      }
      if (res.status === 429) {
        return makeError(postUrl, "Rate limited — try again later");
      }
      return makeError(postUrl, `Instagram returned HTTP ${res.status}`);
    }

    const data: OEmbedResponse = await res.json();
    const caption = data.title ?? "";
    const hashtags = extractHashtags(caption);
    const mood = detectMood(caption);
    const promptSuggestion = generatePromptSuggestion(caption, hashtags, mood);

    return {
      url: postUrl,
      authorName: data.author_name ?? "",
      title: caption,
      thumbnailUrl: data.thumbnail_url,
      thumbnailWidth: data.thumbnail_width,
      thumbnailHeight: data.thumbnail_height,
      hashtags,
      mood,
      promptSuggestion,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Request timed out"
        : err instanceof Error
          ? err.message
          : "Unknown error";
    return makeError(postUrl, message);
  }
}

function makeError(url: string, error: string): InstagramPost {
  return {
    url,
    authorName: "",
    title: "",
    hashtags: [],
    mood: "neutral",
    promptSuggestion: "",
    error,
  };
}
