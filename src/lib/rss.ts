export interface RssItem {
  title: string;
  description: string;
  link?: string;
  source?: string;
  pubDate?: string;
  mood?: string;
  topics?: string[];
}

export interface FeedResult {
  url: string;
  feedTitle: string;
  items: RssItem[];
  error?: string;
}

function extractTagContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
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

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
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

function enrichItem(item: RssItem): RssItem {
  const text = `${item.title} ${item.description}`;
  return {
    ...item,
    mood: detectMood(text),
    topics: extractTopics(text),
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
        const description = stripTags(
          extractTagContent(entry, "summary") ||
            extractTagContent(entry, "content")
        );
        const link = extractAtomLink(entry) || extractTagContent(entry, "id");
        return { title, description, link, source: feedTitle };
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
        const description = stripTags(
          stripCDATA(extractTagContent(item, "description"))
        );
        const link = extractTagContent(item, "link");
        const pubDate = extractTagContent(item, "pubDate");
        return { title, description, link, source: feedTitle, pubDate };
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
