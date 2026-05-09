import {
  extractTagContent,
  extractAllTagContent,
  stripCDATA,
  stripTags,
  extractAtomLink,
} from "./parse";
import { enrichItem } from "./enrich";
import { extractArticleContent } from "./extract-article";
import type { RssItem, FeedResult } from "./types";

export type { RssItem, FeedResult };

const CONTENT_THRESHOLD = 200;
const MAX_ARTICLE_FETCHES = 5;

async function enrichWithFullArticle(items: RssItem[]): Promise<RssItem[]> {
  const toEnrich = items.slice(0, MAX_ARTICLE_FETCHES);
  const passThrough = items.slice(MAX_ARTICLE_FETCHES);

  const enriched = await Promise.all(
    toEnrich.map(async (item) => {
      const inlineLength = (item.content || item.description || "").length;
      if (inlineLength >= CONTENT_THRESHOLD || !item.link) return item;

      const article = await extractArticleContent(item.link);
      if (!article) return item;

      return {
        ...item,
        content: article.slice(0, 5000),
        description: article.slice(0, 800),
      };
    })
  );

  return [...enriched, ...passThrough];
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

    const isAtom =
      /<feed[^>]*xmlns[^>]*>/i.test(xml) || /<feed\s/i.test(xml);

    let feedTitle = "";
    let items: RssItem[] = [];

    if (isAtom) {
      const titleMatch = xml.match(/<title[^>]*>([^<]*)<\/title>/i);
      feedTitle = titleMatch ? stripCDATA(titleMatch[1].trim()) : url;

      const entryXmls = extractAllTagContent(xml, "entry");
      items = entryXmls.slice(0, 20).map((entry) => {
        const title = stripTags(extractTagContent(entry, "title"));
        const rawContent =
          extractTagContent(entry, "content") ||
          extractTagContent(entry, "summary");
        const fullText = stripTags(rawContent);
        const description = fullText.slice(0, 800);
        const content = fullText.slice(0, 5000);
        const link = extractAtomLink(entry) || extractTagContent(entry, "id");
        return { title, description, content, link, source: feedTitle };
      });
    } else {
      const channelMatch = xml.match(
        /<channel[^>]*>([\s\S]*?)<\/channel>/i
      );
      const channelXml = channelMatch ? channelMatch[1] : xml;

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
        const contentEncoded =
          extractTagContent(item, "content:encoded") ||
          extractTagContent(item, "encoded");
        const rawDescription = contentEncoded ||
          stripCDATA(extractTagContent(item, "description"));
        const fullText = stripTags(rawDescription);
        const description = fullText.slice(0, 800);
        const content = fullText.slice(0, 5000);
        const link = extractTagContent(item, "link");
        const pubDate = extractTagContent(item, "pubDate");
        return { title, description, content, link, source: feedTitle, pubDate };
      });
    }

    items = items.filter((i) => i.title.length > 0);
    items = await enrichWithFullArticle(items);
    items = items.map(enrichItem);

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
