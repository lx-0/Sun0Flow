"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ArrowPathIcon, SparklesIcon } from "@heroicons/react/24/outline";

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

const RSS_FEEDS_KEY = "sunoflow_rss_feeds";

function useRssFeeds() {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RSS_FEEDS_KEY);
      setUrls(stored ? JSON.parse(stored) : []);
    } catch {
      setUrls([]);
    }
  }, []);

  return urls;
}

function InspireContent() {
  const router = useRouter();
  const feedUrls = useRssFeeds();
  const [feeds, setFeeds] = useState<FeedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const CACHE_KEY = "sunoflow_rss_cache";

  const loadFromCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { feeds: cachedFeeds, timestamp } = JSON.parse(cached);
        setFeeds(cachedFeeds);
        setLastRefreshed(new Date(timestamp));
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const fetchFeeds = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;
      setLoading(true);
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
        setLastRefreshed(now);
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ feeds: data.feeds, timestamp: now.toISOString() })
          );
        } catch {
          // storage quota — ignore
        }
      } catch {
        // keep existing feeds if any
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (feedUrls.length === 0) return;
    const hadCache = loadFromCache();
    if (!hadCache) {
      fetchFeeds(feedUrls);
    } else {
      // Refresh in background
      fetchFeeds(feedUrls);
    }
  }, [feedUrls, loadFromCache, fetchFeeds]);

  const allItems: (FeedItem & { feedError?: string })[] = feeds.flatMap((f) =>
    f.error
      ? [{ title: "", description: "", feedError: f.error, source: f.feedTitle }]
      : f.items
  );

  const handleUseAsPrompt = (item: FeedItem) => {
    const prompt = item.title
      ? item.title + (item.description ? ". " + item.description.slice(0, 100) : "")
      : item.description;
    router.push(`/?prompt=${encodeURIComponent(prompt)}`);
  };

  if (feedUrls.length === 0) {
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inspire</h2>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <SparklesIcon className="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            No RSS feeds added yet. Add feeds in Settings to see inspiration here.
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

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inspire</h2>
        <button
          onClick={() => fetchFeeds(feedUrls)}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Updated {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

      {loading && feeds.length === 0 && (
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
      )}

      {!loading && allItems.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <p className="text-gray-500 text-sm">No items found in your feeds.</p>
        </div>
      )}

      <div className="space-y-3">
        {allItems.map((item, i) => {
          if (item.feedError) {
            return (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900 rounded-xl p-4"
              >
                <p className="text-xs text-red-500 dark:text-red-400 font-medium">{item.source}</p>
                <p className="text-xs text-red-500 mt-1">
                  Failed to load: {item.feedError}
                </p>
              </div>
            );
          }
          return (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
            >
              <p className="text-xs text-violet-400 font-medium mb-1">
                {item.source}
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                {item.title}
              </p>
              {item.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {item.description}
                </p>
              )}
              <button
                onClick={() => handleUseAsPrompt(item)}
                className="mt-3 flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors min-h-[44px]"
              >
                <SparklesIcon className="w-4 h-4" />
                Use as prompt
              </button>
            </div>
          );
        })}
      </div>
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
