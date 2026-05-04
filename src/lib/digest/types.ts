export interface DigestItem {
  source: "rss";
  title: string;
  link?: string;
  mood: string;
  topics: string[];
  suggestedPrompt: string;
  feedTitle?: string;
}

export const MAX_DIGESTS_PER_USER = 10;
export const MAX_FEEDS = 5;
export const MAX_ITEMS_PER_FEED = 3;
export const MAX_TOTAL_ITEMS = 15;
export const PICKS_MIN = 3;
export const PICKS_MAX = 5;
export const MAX_PER_SOURCE = 2;
