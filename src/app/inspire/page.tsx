"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  ArrowPathIcon,
  SparklesIcon,
  BoltIcon,
  MusicalNoteIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

// ─── Types ───

interface DailyPrompt {
  id: string;
  name: string;
  prompt: string;
  style?: string | null;
  category?: string | null;
  createdAt: string;
}

interface FeedItem {
  title: string;
  description: string;
  link?: string;
  source?: string;
  pubDate?: string;
  mood?: string;
  topics?: string[];
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

// ─── Storage keys (Instagram still uses localStorage) ───

const IG_POSTS_KEY = "sunoflow_ig_posts";
const IG_CACHE_KEY = "sunoflow_ig_cache";

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

function useDbFeedUrls() {
  const [urls, setUrls] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/rss/feeds")
      .then((r) => r.json())
      .then((data) => {
        const feedUrls = (data.feeds ?? []).map((f: { url: string }) => f.url);
        setUrls(feedUrls);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  return { urls, loaded };
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

// ─── Daily Prompts Section ───

function DailyPrompts({
  prompts,
  loading,
  generating,
  stale,
  onGenerate,
  onUsePrompt,
}: {
  prompts: DailyPrompt[];
  loading: boolean;
  generating: boolean;
  stale: boolean;
  onGenerate: () => void;
  onUsePrompt: (prompt: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-full mb-1" />
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BoltIcon className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-amber-400">Daily Prompts</h3>
          {stale && prompts.length > 0 && (
            <span className="text-[10px] text-gray-400 bg-gray-500/10 px-1.5 py-0.5 rounded">
              stale
            </span>
          )}
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
        >
          <SparklesIcon className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
          {prompts.length === 0 ? "Generate" : "Refresh"}
        </button>
      </div>

      {prompts.length === 0 && !generating && (
        <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-5 text-center">
          <MusicalNoteIcon className="w-8 h-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Generate music prompts from your feed content
          </p>
          <button
            onClick={onGenerate}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Auto-generate prompts
          </button>
        </div>
      )}

      {prompts.map((p) => {
        // Extract mood-like style keywords for badge display
        const styleParts = p.style?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
        const moodKey = styleParts[0]?.toLowerCase();
        const badgeColor = MOOD_COLORS[moodKey ?? ""] ?? MOOD_COLORS.neutral;

        return (
          <div
            key={p.id}
            className="bg-white dark:bg-gray-900 border border-amber-200/30 dark:border-amber-900/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-amber-400 font-medium truncate flex-1">{p.name}</p>
              {moodKey && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
                  {moodKey}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mb-1">
              {p.prompt}
            </p>
            {styleParts.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {styleParts.slice(1).map((tag) => (
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
              onClick={() => onUsePrompt(p.prompt)}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors min-h-[44px]"
            >
              <SparklesIcon className="w-4 h-4" />
              Generate song
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-violet-400 font-medium">{item.source}</p>
              {item.mood && item.mood !== "neutral" && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${MOOD_COLORS[item.mood] ?? MOOD_COLORS.neutral}`}
                >
                  {item.mood}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
              {item.title}
            </p>
            {item.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {item.description}
              </p>
            )}
            {item.topics && item.topics.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.topics.map((topic) => (
                  <span
                    key={topic}
                    className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => onUseAsPrompt(item)}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors min-h-[44px]"
            >
              <SparklesIcon className="w-4 h-4" />
              Generate from this
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
  const { urls: feedUrls, loaded: feedsLoaded } = useDbFeedUrls();
  const igUrls = useStoredUrls(IG_POSTS_KEY);

  const [feeds, setFeeds] = useState<FeedResult[]>([]);
  const [rssLoading, setRssLoading] = useState(false);
  const [rssRefreshed, setRssRefreshed] = useState<Date | null>(null);

  const [igPosts, setIgPosts] = useState<InstagramPost[]>([]);
  const [igLoading, setIgLoading] = useState(false);
  const [igRefreshed, setIgRefreshed] = useState<Date | null>(null);

  const [dailyPrompts, setDailyPrompts] = useState<DailyPrompt[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyGenerating, setDailyGenerating] = useState(false);
  const [dailyStale, setDailyStale] = useState(false);

  const [activeTab, setActiveTab] = useState<InspireTab>("all");
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [dateSortDesc, setDateSortDesc] = useState(true);

  const hasRss = feedUrls.length > 0;
  const hasIg = igUrls.length > 0;
  const hasAnySources = hasRss || hasIg;

  // ── RSS fetching ──

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
      setRssRefreshed(new Date());
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

  // ── Daily prompts ──

  const fetchDailyPrompts = useCallback(async () => {
    setDailyLoading(true);
    try {
      const res = await fetch("/api/prompts/daily");
      if (!res.ok) throw new Error("Failed to load daily prompts");
      const data = await res.json();
      setDailyPrompts(data.prompts ?? []);
      setDailyStale(data.stale ?? false);
    } catch {
      // ignore — empty state will show
    } finally {
      setDailyLoading(false);
    }
  }, []);

  const generateDailyPrompts = useCallback(async () => {
    setDailyGenerating(true);
    try {
      const res = await fetch("/api/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boost: false }),
      });
      if (!res.ok) throw new Error("Failed to generate prompts");
      const data = await res.json();
      setDailyPrompts(data.prompts ?? []);
      setDailyStale(false);
    } catch {
      // keep existing
    } finally {
      setDailyGenerating(false);
    }
  }, []);

  // ── Load on mount ──

  useEffect(() => {
    fetchDailyPrompts();
  }, [fetchDailyPrompts]);

  useEffect(() => {
    if (!feedsLoaded || feedUrls.length === 0) return;
    fetchRssFeeds(feedUrls);
  }, [feedUrls, feedsLoaded, fetchRssFeeds]);

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

  // Collect all unique moods across RSS items and Instagram posts
  const allMoods = Array.from(
    new Set([
      ...allRssItems.map((i) => i.mood).filter((m): m is string => !!m && m !== "neutral"),
      ...igPosts.filter((p) => !p.error).map((p) => p.mood).filter((m) => m !== "neutral"),
    ])
  ).sort();

  // Apply mood filter to RSS items
  const filteredRssItems = moodFilter
    ? allRssItems.filter((i) => i.feedError || i.mood === moodFilter)
    : allRssItems;

  // Apply date sort to RSS items
  const sortedRssItems = [...filteredRssItems].sort((a, b) => {
    if (!a.pubDate || !b.pubDate) return 0;
    const diff = new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    return dateSortDesc ? diff : -diff;
  });

  // Apply mood filter to Instagram posts
  const filteredIgPosts = moodFilter
    ? igPosts.filter((p) => p.error || p.mood === moodFilter)
    : igPosts;

  const handleRssPrompt = (item: FeedItem) => {
    const parts: string[] = [];
    if (item.title) parts.push(item.title);
    if (item.description) parts.push(item.description.slice(0, 100));
    if (item.topics && item.topics.length > 0) parts.push(item.topics.join(", "));
    if (item.mood && item.mood !== "neutral") parts.push(`${item.mood} mood`);
    const prompt = parts.join(". ");
    router.push(`/generate?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleIgPrompt = (prompt: string) => {
    router.push(`/generate?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleDailyPrompt = (prompt: string) => {
    router.push(`/generate?prompt=${encodeURIComponent(prompt)}`);
  };

  const handleRefresh = () => {
    if (activeTab === "all") {
      fetchDailyPrompts();
    }
    if (hasRss && (activeTab === "all" || activeTab === "rss")) {
      fetchRssFeeds(feedUrls);
    }
    if (hasIg && (activeTab === "all" || activeTab === "instagram")) {
      fetchIgPosts(igUrls);
    }
  };

  const isLoading = rssLoading || igLoading || !feedsLoaded;

  const lastRefreshed = (() => {
    const times = [rssRefreshed, igRefreshed].filter(Boolean) as Date[];
    if (times.length === 0) return null;
    return new Date(Math.max(...times.map((d) => d.getTime())));
  })();

  // ── Empty state ──

  if (feedsLoaded && !hasAnySources) {
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

      {/* Filters */}
      {(allMoods.length > 0 || allRssItems.some((i) => i.pubDate)) && (
        <div className="flex flex-wrap items-center gap-2">
          {allMoods.length > 0 && (
            <>
              <FunnelIcon className="w-3.5 h-3.5 text-gray-400" />
              <button
                onClick={() => setMoodFilter(null)}
                className={`text-[11px] font-medium px-2 py-1 rounded-full transition-colors ${
                  moodFilter === null
                    ? "bg-violet-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                All moods
              </button>
              {allMoods.map((mood) => (
                <button
                  key={mood}
                  onClick={() => setMoodFilter(moodFilter === mood ? null : mood)}
                  className={`text-[11px] font-medium px-2 py-1 rounded-full transition-colors ${
                    moodFilter === mood
                      ? MOOD_COLORS[mood] ?? MOOD_COLORS.neutral
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {mood}
                </button>
              ))}
            </>
          )}
          {allRssItems.some((i) => i.pubDate) && (
            <button
              onClick={() => setDateSortDesc((v) => !v)}
              className="ml-auto text-[11px] font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Date: {dateSortDesc ? "Newest" : "Oldest"} first
            </button>
          )}
        </div>
      )}

      {/* Daily auto-generated prompts */}
      {(activeTab === "all") && (
        <DailyPrompts
          prompts={dailyPrompts}
          loading={dailyLoading}
          generating={dailyGenerating}
          stale={dailyStale}
          onGenerate={generateDailyPrompts}
          onUsePrompt={handleDailyPrompt}
        />
      )}

      {/* Instagram mood board */}
      {hasIg && (activeTab === "all" || activeTab === "instagram") && (
        <div className="space-y-3">
          {activeTab === "all" && (
            <h3 className="text-sm font-semibold text-pink-400">Instagram Mood Board</h3>
          )}
          <InstagramMoodBoard
            posts={filteredIgPosts}
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
            items={sortedRssItems}
            loading={rssLoading}
            onUseAsPrompt={handleRssPrompt}
          />
        </div>
      )}

      {/* No items in current tab */}
      {!isLoading && activeTab === "rss" && sortedRssItems.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No items found in your RSS feeds.</p>
        </div>
      )}
      {!isLoading && activeTab === "instagram" && filteredIgPosts.length === 0 && (
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
