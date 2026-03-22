"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ArrowPathIcon, SparklesIcon } from "@heroicons/react/24/outline";

// ─── Types ───

interface FeedItem {
  title: string;
  description: string;
  link?: string;
  source?: string;
  pubDate?: string;
}

interface FeedResult {
  url: string;
  feedTitle: string;
  items: FeedItem[];
  error?: string;
}

interface InstagramPost {
  url: string;
  authorName: string;
  title: string;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  hashtags: string[];
  mood: string;
  promptSuggestion: string;
  error?: string;
}

// ─── Storage keys ───

const RSS_FEEDS_KEY = "sunoflow_rss_feeds";
const IG_POSTS_KEY = "sunoflow_ig_posts";
const IG_CACHE_KEY = "sunoflow_ig_cache";
const RSS_CACHE_KEY = "sunoflow_rss_cache";

type InspireTab = "all" | "rss" | "instagram";

// ─── Hooks ───

function useStoredUrls(key: string) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      setUrls(stored ? JSON.parse(stored) : []);
    } catch {
      setUrls([]);
    }
  }, [key]);
  return urls;
}

// ─── Mood badge colors ───

const MOOD_COLORS: Record<string, string> = {
  energetic: "bg-orange-500/20 text-orange-400",
  chill: "bg-blue-500/20 text-blue-400",
  melancholic: "bg-indigo-500/20 text-indigo-400",
  romantic: "bg-pink-500/20 text-pink-400",
  uplifting: "bg-yellow-500/20 text-yellow-400",
  dark: "bg-gray-500/20 text-gray-400",
  dreamy: "bg-purple-500/20 text-purple-400",
  intense: "bg-red-500/20 text-red-400",
  neutral: "bg-gray-500/20 text-gray-400",
};

// ─── Instagram Section ───

function InstagramMoodBoard({
  posts,
  loading,
  onUseAsPrompt,
}: {
  posts: InstagramPost[];
  loading: boolean;
  onUseAsPrompt: (prompt: string) => void;
}) {
  if (loading && posts.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden animate-pulse"
          >
            <div className="aspect-square bg-gray-200 dark:bg-gray-800" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {posts.map((post, i) => {
        if (post.error) {
          return (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900 rounded-xl p-3"
            >
              <p className="text-xs text-red-500 font-medium truncate">{post.url}</p>
              <p className="text-xs text-red-400 mt-1">{post.error}</p>
            </div>
          );
        }
        return (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"
          >
            {post.thumbnailUrl && (
              <div className="aspect-square relative overflow-hidden bg-gray-100 dark:bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.thumbnailUrl}
                  alt={post.title || "Instagram post"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {post.mood !== "neutral" && (
                  <span
                    className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${MOOD_COLORS[post.mood] ?? MOOD_COLORS.neutral}`}
                  >
                    {post.mood}
                  </span>
                )}
              </div>
            )}
            <div className="p-3 space-y-2">
              <p className="text-xs text-pink-400 font-medium">
                @{post.authorName}
              </p>
              {post.title && (
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                  {post.title}
                </p>
              )}
              {post.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.hashtags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => onUseAsPrompt(post.promptSuggestion)}
                className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors min-h-[44px]"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                Use as prompt
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── RSS Section ───

function RssFeedList({
  items,
  loading,
  onUseAsPrompt,
}: {
  items: (FeedItem & { feedError?: string })[];
  loading: boolean;
  onUseAsPrompt: (item: FeedItem) => void;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        if (item.feedError) {
          return (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900 rounded-xl p-4"
            >
              <p className="text-xs text-red-500 dark:text-red-400 font-medium">{item.source}</p>
              <p className="text-xs text-red-500 mt-1">Failed to load: {item.feedError}</p>
            </div>
          );
        }
        return (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
          >
            <p className="text-xs text-violet-400 font-medium mb-1">{item.source}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
              {item.title}
            </p>
            {item.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {item.description}
              </p>
            )}
            <button
              onClick={() => onUseAsPrompt(item)}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors min-h-[44px]"
            >
              <SparklesIcon className="w-4 h-4" />
              Use as prompt
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Content ───

function InspireContent() {
  const router = useRouter();
  const feedUrls = useStoredUrls(RSS_FEEDS_KEY);
  const igUrls = useStoredUrls(IG_POSTS_KEY);

  const [feeds, setFeeds] = useState<FeedResult[]>([]);
  const [rssLoading, setRssLoading] = useState(false);
  const [rssRefreshed, setRssRefreshed] = useState<Date | null>(null);

  const [igPosts, setIgPosts] = useState<InstagramPost[]>([]);
  const [igLoading, setIgLoading] = useState(false);
  const [igRefreshed, setIgRefreshed] = useState<Date | null>(null);

  const [activeTab, setActiveTab] = useState<InspireTab>("all");

  const hasRss = feedUrls.length > 0;
  const hasIg = igUrls.length > 0;
  const hasAnySources = hasRss || hasIg;

  // ── RSS fetching ──

  const loadRssCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(RSS_CACHE_KEY);
      if (cached) {
        const { feeds: cachedFeeds, timestamp } = JSON.parse(cached);
        setFeeds(cachedFeeds);
        setRssRefreshed(new Date(timestamp));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const fetchRssFeeds = useCallback(async (urls: string[]) => {
    if (urls.length === 0) return;
    setRssLoading(true);
    try {
      const res = await fetch("/api/rss/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setFeeds(data.feeds);
      const now = new Date();
      setRssRefreshed(now);
      try {
        localStorage.setItem(
          RSS_CACHE_KEY,
          JSON.stringify({ feeds: data.feeds, timestamp: now.toISOString() })
        );
      } catch {
        // storage quota — ignore
      }
    } catch {
      // keep existing feeds
    } finally {
      setRssLoading(false);
    }
  }, []);

  // ── Instagram fetching ──

  const loadIgCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(IG_CACHE_KEY);
      if (cached) {
        const { posts, timestamp } = JSON.parse(cached);
        setIgPosts(posts);
        setIgRefreshed(new Date(timestamp));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const fetchIgPosts = useCallback(async (urls: string[]) => {
    if (urls.length === 0) return;
    setIgLoading(true);
    try {
      const res = await fetch("/api/instagram/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setIgPosts(data.posts);
      const now = new Date();
      setIgRefreshed(now);
      try {
        localStorage.setItem(
          IG_CACHE_KEY,
          JSON.stringify({ posts: data.posts, timestamp: now.toISOString() })
        );
      } catch {
        // storage quota — ignore
      }
    } catch {
      // keep existing posts
    } finally {
      setIgLoading(false);
    }
  }, []);

  // ── Load on mount ──

  useEffect(() => {
    if (feedUrls.length === 0) return;
    loadRssCache();
    fetchRssFeeds(feedUrls);
  }, [feedUrls, loadRssCache, fetchRssFeeds]);

  useEffect(() => {
    if (igUrls.length === 0) return;
    loadIgCache();
    fetchIgPosts(igUrls);
  }, [igUrls, loadIgCache, fetchIgPosts]);

  // ── Derived data ──

  const allRssItems: (FeedItem & { feedError?: string })[] = feeds.flatMap((f) =>
    f.error
      ? [{ title: "", description: "", feedError: f.error, source: f.feedTitle }]
      : f.items
  );

  const handleRssPrompt = (item: FeedItem) => {
    const prompt = item.title
      ? item.title + (item.description ? ". " + item.description.slice(0, 100) : "")
      : item.description;
    router.push(`/?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleIgPrompt = (prompt: string) => {
    router.push(`/?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleRefresh = () => {
    if (hasRss && (activeTab === "all" || activeTab === "rss")) {
      fetchRssFeeds(feedUrls);
    }
    if (hasIg && (activeTab === "all" || activeTab === "instagram")) {
      fetchIgPosts(igUrls);
    }
  };

  const isLoading = rssLoading || igLoading;

  const lastRefreshed = (() => {
    const times = [rssRefreshed, igRefreshed].filter(Boolean) as Date[];
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map((d) => d.getTime())));
  })();

  // ── Empty state ──

  if (!hasAnySources) {
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inspire</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <SparklesIcon className="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            No inspiration sources added yet. Add RSS feeds or Instagram posts in Settings to get started.
          </p>
          <button
            onClick={() => router.push("/settings")}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  // ── Tab bar (only if both sources exist) ──

  const showTabs = hasRss && hasIg;

  const tabs: { key: InspireTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "rss", label: "RSS" },
    { key: "instagram", label: "Instagram" },
  ];

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inspire</h2>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Updated {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      {showTabs && (
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                activeTab === tab.key
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Instagram mood board */}
      {hasIg && (activeTab === "all" || activeTab === "instagram") && (
        <div className="space-y-3">
          {activeTab === "all" && (
            <h3 className="text-sm font-semibold text-pink-400">Instagram Mood Board</h3>
          )}
          <InstagramMoodBoard
            posts={igPosts}
            loading={igLoading}
            onUseAsPrompt={handleIgPrompt}
          />
        </div>
      )}

      {/* RSS feeds */}
      {hasRss && (activeTab === "all" || activeTab === "rss") && (
        <div className="space-y-3">
          {activeTab === "all" && (
            <h3 className="text-sm font-semibold text-violet-400">RSS Feeds</h3>
          )}
          <RssFeedList
            items={allRssItems}
            loading={rssLoading}
            onUseAsPrompt={handleRssPrompt}
          />
        </div>
      )}

      {/* No items in current tab */}
      {!isLoading && activeTab === "rss" && allRssItems.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No items found in your RSS feeds.</p>
        </div>
      )}
      {!isLoading && activeTab === "instagram" && igPosts.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No Instagram posts loaded yet.</p>
        </div>
      )}
    </div>
  );
}

export default function InspirePage() {
  return (
    <AppShell>
      <InspireContent />
    </AppShell>
  );
}
