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
