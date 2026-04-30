export interface RssItem {
  title: string;
  description: string;
  content?: string;
  link?: string;
  source?: string;
  pubDate?: string;
  mood?: string;
  topics?: string[];
  suggestedStyle?: string;
  excerpt?: string;
}

export interface FeedResult {
  url: string;
  feedTitle: string;
  items: RssItem[];
  error?: string;
}

function extractTagContent(xml: string, tag: string): string {
  // Escape special regex chars in tag name (e.g. "content:encoded")
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":", ":");
  const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i");
  const match = xml.match(regex);
  return match ? stripCDATA(match[1].trim()) : "";
}

function extractAllTagContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function stripCDATA(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function stripTags(text: string): string {
  // Decode entities first so entity-encoded tags like &lt;p&gt; become real tags,
  // then strip them. Repeat once more to handle double-encoded HTML.
  const strip = (s: string) =>
    decodeHtmlEntities(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return strip(strip(text));
}

function extractAtomLink(itemXml: string): string {
  const match = itemXml.match(
    /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i
  );
  return match ? match[1] : "";
}

// ─── Mood / Topic Extraction ───

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

function detectMood(text: string): string {
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

function extractTopics(text: string): string[] {
  const lower = text.toLowerCase();
  return TOPIC_KEYWORDS.filter((t) => lower.includes(t)).slice(0, 5);
}

// ─── Style Suggestion ───

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

function suggestStyle(mood: string, topics: string[]): string {
  const parts: string[] = [];

  // Genre from topics (pick first music-genre topic)
  const genres = [
    "rock", "pop", "jazz", "blues", "classical", "electronic", "hip-hop", "rap",
    "country", "folk", "metal", "punk", "r&b", "soul", "reggae", "latin",
    "ambient", "lo-fi", "cinematic", "orchestral", "acoustic",
  ];
  const genrePick = topics.find((t) => genres.includes(t));
  if (genrePick) parts.push(genrePick);

  // Instrument texture from topics
  const instruments = ["guitar", "piano", "synth", "drums", "bass", "violin", "vocal"];
  const instrPick = topics.find((t) => instruments.includes(t));
  if (instrPick) parts.push(instrPick);

  // Mood-derived style descriptors
  const moodStyles = MOOD_STYLE_MAP[mood];
  if (moodStyles) parts.push(moodStyles[0]);

  // Fallback if nothing was derived
  if (parts.length === 0) {
    return mood !== "neutral" ? `${mood} indie` : "indie, alternative";
  }

  return parts.join(", ");
}

function buildExcerpt(description: string, maxLen = 800): string {
  const plain = stripTags(description).trim();
  if (plain.length <= maxLen) return plain;

  // Find the last sentence boundary (.!?) at or before maxLen
  const region = plain.slice(0, maxLen);
  const sentenceEnd = Math.max(
    region.lastIndexOf(". "),
    region.lastIndexOf("! "),
    region.lastIndexOf("? "),
  );

  if (sentenceEnd > maxLen * 0.4) {
    return plain.slice(0, sentenceEnd + 1).trim();
  }

  // Fall back to word boundary
  const lastSpace = region.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.4) {
    return plain.slice(0, lastSpace).trim() + "…";
  }

  return region.trim() + "…";
}

function enrichItem(item: RssItem): RssItem {
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

export async function fetchFeed(url: string): Promise<FeedResult> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, text/xml, application/xml, */*",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();

    // Detect Atom vs RSS
    const isAtom =
      /<feed[^>]*xmlns[^>]*>/i.test(xml) || /<feed\s/i.test(xml);

    let feedTitle = "";
    let items: RssItem[] = [];

    if (isAtom) {
      // Atom feed
      const titleMatch = xml.match(/<title[^>]*>([^<]*)<\/title>/i);
      feedTitle = titleMatch ? stripCDATA(titleMatch[1].trim()) : url;

      const entryXmls = extractAllTagContent(xml, "entry");
      items = entryXmls.slice(0, 20).map((entry) => {
        const title = stripTags(extractTagContent(entry, "title"));
        // Prefer full content over summary for richer inspiration context
        const rawContent =
          extractTagContent(entry, "content") ||
          extractTagContent(entry, "summary");
        const fullText = stripTags(rawContent);
        const description = fullText.slice(0, 500);
        const content = fullText.slice(0, 3000);
        const link = extractAtomLink(entry) || extractTagContent(entry, "id");
        return { title, description, content, link, source: feedTitle };
      });
    } else {
      // RSS 2.0
      const channelMatch = xml.match(
        /<channel[^>]*>([\s\S]*?)<\/channel>/i
      );
      const channelXml = channelMatch ? channelMatch[1] : xml;

      // Channel title is the first <title> before any <item>
      const firstItemIndex = channelXml.search(/<item[\s>]/i);
      const headerXml =
        firstItemIndex > 0 ? channelXml.slice(0, firstItemIndex) : channelXml;
      const titleMatch = headerXml.match(/<title[^>]*>([^<]*)<\/title>/i);
      feedTitle = titleMatch ? stripCDATA(titleMatch[1].trim()) : url;

      const itemXmls = extractAllTagContent(channelXml, "item");
      items = itemXmls.slice(0, 20).map((item) => {
        const title = stripTags(
          stripCDATA(extractTagContent(item, "title"))
        );
        // Prefer content:encoded (full article body) over description (often just headline)
        const contentEncoded =
          extractTagContent(item, "content:encoded") ||
          extractTagContent(item, "encoded");
        const rawDescription = contentEncoded ||
          stripCDATA(extractTagContent(item, "description"));
        const fullText = stripTags(rawDescription);
        const description = fullText.slice(0, 500);
        const content = fullText.slice(0, 3000);
        const link = extractTagContent(item, "link");
        const pubDate = extractTagContent(item, "pubDate");
        return { title, description, content, link, source: feedTitle, pubDate };
      });
    }

    // Drop items with no title, then enrich with mood/topics
    items = items.filter((i) => i.title.length > 0).map(enrichItem);

    return { url, feedTitle, items };
  } catch (err) {
    return {
      url,
      feedTitle: url,
      items: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
