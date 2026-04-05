"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { PullToRefreshContainer } from "@/components/PullToRefreshContainer";
import {
  ArrowPathIcon,
  SparklesIcon,
  BoltIcon,
  MusicalNoteIcon,
  FunnelIcon,
  ClockIcon,
  CheckCircleIcon,
  XMarkIcon,
  RssIcon,
  NewspaperIcon,
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
  content?: string;
  link?: string;
  source?: string;
  pubDate?: string;
  mood?: string;
  topics?: string[];
  suggestedStyle?: string;
  excerpt?: string;
}

interface FeedResult {
  url: string;
  feedTitle: string;
  items: FeedItem[];
  error?: string;
}

interface PendingFeedGenerationItem {
  id: string;
  feedTitle?: string | null;
  itemTitle: string;
  itemLink?: string | null;
  prompt: string;
  style?: string | null;
  status: string;
  createdAt: string;
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

interface DigestItem {
  source: "rss";
  title: string;
  link?: string;
  mood: string;
  topics: string[];
  suggestedPrompt: string;
  feedTitle?: string;
}

interface InspirationDigest {
  id: string;
  title: string;
  items: DigestItem[];
  createdAt: string;
}

// Unified feed item that normalizes all source types
type SourceType = "rss" | "instagram" | "digest" | "daily" | "pending";

interface UnifiedFeedItem {
  id: string;
  sourceType: SourceType;
  title: string;
  subtitle?: string;
  excerpt?: string;
  mood?: string;
  topics?: string[];
  link?: string;
  imageUrl?: string;
  sourceName?: string;
  date?: Date;
  suggestedStyle?: string;
  // Original data for action handlers
  original: unknown;
}

// ─── Storage keys (Instagram still uses localStorage) ───

const IG_POSTS_KEY = "sunoflow_ig_posts";
const IG_CACHE_KEY = "sunoflow_ig_cache";

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

// ─── Source config ───

const SOURCE_CONFIG: Record<SourceType, { label: string; color: string; icon: string }> = {
  rss: { label: "RSS", color: "text-violet-400", icon: "rss" },
  instagram: { label: "Instagram", color: "text-pink-400", icon: "camera" },
  digest: { label: "Digest", color: "text-emerald-400", icon: "newspaper" },
  daily: { label: "Daily Prompts", color: "text-amber-400", icon: "bolt" },
  pending: { label: "Pending", color: "text-teal-400", icon: "clock" },
};

function SourceIcon({ type, className }: { type: SourceType; className?: string }) {
  const cn = className ?? "w-3.5 h-3.5";
  switch (type) {
    case "rss":
      return <RssIcon className={cn} />;
    case "instagram":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "digest":
      return <NewspaperIcon className={cn} />;
    case "daily":
      return <BoltIcon className={cn} />;
    case "pending":
      return <ClockIcon className={cn} />;
  }
}

// ─── Unified Feed Card ───

function UnifiedCard({
  item,
  onAction,
  onApprove,
  onDismiss,
}: {
  item: UnifiedFeedItem;
  onAction: (item: UnifiedFeedItem) => void;
  onApprove?: (item: UnifiedFeedItem) => void;
  onDismiss?: (item: UnifiedFeedItem) => void;
}) {
  const sourceConfig = SOURCE_CONFIG[item.sourceType];
  const moodColor = item.mood && item.mood !== "neutral"
    ? MOOD_COLORS[item.mood] ?? MOOD_COLORS.neutral
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Instagram image */}
      {item.imageUrl && (
        <div className="aspect-video relative overflow-hidden bg-gray-100 dark:bg-gray-800 max-h-48">
          <Image
            src={item.imageUrl}
            alt={item.title || "Post image"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 50vw"
            unoptimized
          />
        </div>
      )}

      <div className="p-4">
        {/* Source attribution */}
        <div className="flex items-center gap-2 mb-2 text-[11px]">
          <span className={`flex items-center gap-1 font-medium ${sourceConfig.color}`}>
            <SourceIcon type={item.sourceType} className="w-3 h-3" />
            {item.sourceName || sourceConfig.label}
          </span>
          {item.date && (
            <>
              <span className="text-gray-400 dark:text-gray-500">·</span>
              <span className="text-gray-400 dark:text-gray-500">
                {item.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </>
          )}
        </div>

        {/* Title */}
        {item.link ? (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-gray-900 dark:text-white leading-snug hover:text-violet-400 dark:hover:text-violet-400 transition-colors"
          >
            {item.title}
          </a>
        ) : (
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
            {item.title}
          </p>
        )}

        {/* Subtitle (e.g. Instagram author) */}
        {item.subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.subtitle}</p>
        )}

        {/* Excerpt */}
        {item.excerpt && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mt-2 line-clamp-3">
            {item.excerpt}
          </p>
        )}

        {/* AI-generated style */}
        {item.suggestedStyle && (
          <p className="text-[11px] font-medium text-amber-400 mt-2">
            ♪ {item.suggestedStyle}
          </p>
        )}

        {/* Mood + topic badges */}
        <div className="flex flex-wrap gap-1 mt-2">
          {moodColor && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${moodColor}`}>
              {item.mood}
            </span>
          )}
          {item.topics?.map((topic) => (
            <span
              key={topic}
              className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded"
            >
              {topic}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          {item.sourceType === "pending" && onApprove && onDismiss ? (
            <>
              <button
                onClick={() => onApprove(item)}
                className="flex items-center gap-1.5 text-sm font-medium text-teal-400 hover:text-teal-300 transition-colors min-h-[44px]"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Generate
              </button>
              <button
                onClick={() => onDismiss(item)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-red-400 transition-colors min-h-[44px] ml-auto"
                aria-label="Dismiss"
              >
                <XMarkIcon className="w-4 h-4" />
                Dismiss
              </button>
            </>
          ) : (
            <button
              onClick={() => onAction(item)}
              className="flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors min-h-[44px]"
            >
              <SparklesIcon className="w-4 h-4" />
              {item.sourceType === "daily" ? "Generate song" : "Generate from this"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Filter Chips ───

function SourceFilterChips({
  sources,
  activeFilters,
  onToggle,
}: {
  sources: SourceType[];
  activeFilters: Set<SourceType>;
  onToggle: (source: SourceType) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {sources.map((source) => {
        const config = SOURCE_CONFIG[source];
        const active = activeFilters.has(source);
        return (
          <button
            key={source}
            onClick={() => onToggle(source)}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              active
                ? "bg-violet-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <SourceIcon type={source} className="w-3 h-3" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

function MoodFilterChips({
  moods,
  activeMood,
  onSelect,
}: {
  moods: string[];
  activeMood: string | null;
  onSelect: (mood: string | null) => void;
}) {
  if (moods.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <FunnelIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
      <button
        onClick={() => onSelect(null)}
        className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
          activeMood === null
            ? "bg-violet-600 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        }`}
      >
        All moods
      </button>
      {moods.map((mood) => (
        <button
          key={mood}
          onClick={() => onSelect(activeMood === mood ? null : mood)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
            activeMood === mood
              ? MOOD_COLORS[mood] ?? MOOD_COLORS.neutral
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {mood}
        </button>
      ))}
    </div>
  );
}

// ─── Empty prompts CTA (shown when no daily prompts exist) ───

function GeneratePromptsCTA({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-5 text-center">
      <MusicalNoteIcon className="w-8 h-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Generate music prompts from your feed content
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {generating ? "Generating…" : "Auto-generate prompts"}
      </button>
    </div>
  );
}

// ─── Digest CTA (shown when no digest exists) ───

function GenerateDigestCTA({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-5 text-center">
      <SparklesIcon className="w-8 h-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Auto-curate inspiration from your RSS feeds into a daily digest with suggested prompts.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate Today's Digest"}
      </button>
    </div>
  );
}

// ─── Sort toggle ───

type SortMode = "newest" | "bestmatch";

function SortToggle({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  return (
    <button
      onClick={() => onChange(mode === "newest" ? "bestmatch" : "newest")}
      className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors whitespace-nowrap"
    >
      {mode === "newest" ? "↓ Newest" : "★ Best match"}
    </button>
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

  const [pendingGenerations, setPendingGenerations] = useState<PendingFeedGenerationItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const [digest, setDigest] = useState<InspirationDigest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestGenerating, setDigestGenerating] = useState(false);

  // Unified filter state
  const [sourceFilters, setSourceFilters] = useState<Set<SourceType>>(
    new Set(["rss", "instagram", "digest", "daily", "pending"])
  );
  const [moodFilter, setMoodFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

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

  // ── Pending feed generations ──

  const fetchPendingGenerations = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch("/api/feed-generations");
      if (!res.ok) return;
      const data = await res.json();
      setPendingGenerations(data.items ?? []);
    } catch {
      // ignore
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const handleApprovePending = useCallback(
    async (item: PendingFeedGenerationItem) => {
      try {
        const res = await fetch(`/api/feed-generations/${item.id}/approve`, { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        setPendingGenerations((prev) => prev.filter((p) => p.id !== item.id));
        const params = new URLSearchParams();
        if (data.prompt) params.set("prompt", data.prompt);
        if (data.style) params.set("tags", data.style);
        router.push(`/generate?${params.toString()}`);
      } catch {
        // ignore
      }
    },
    [router]
  );

  const handleDismissPending = useCallback(async (id: string) => {
    setPendingGenerations((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/feed-generations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
    } catch {
      // ignore — optimistic removal
    }
  }, []);

  // ── Digest ──

  const fetchLatestDigest = useCallback(async () => {
    setDigestLoading(true);
    try {
      const res = await fetch("/api/digests?limit=1");
      if (!res.ok) return;
      const data = await res.json();
      setDigest(data.digests?.[0] ?? null);
    } catch {
      // ignore
    } finally {
      setDigestLoading(false);
    }
  }, []);

  const generateDigest = useCallback(async () => {
    setDigestGenerating(true);
    try {
      const res = await fetch("/api/digests/generate", { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setDigest(data.digest ?? null);
    } catch {
      // ignore
    } finally {
      setDigestGenerating(false);
    }
  }, []);

  // ── Load on mount ──

  useEffect(() => {
    fetchDailyPrompts();
    fetchPendingGenerations();
    fetchLatestDigest();
  }, [fetchDailyPrompts, fetchPendingGenerations, fetchLatestDigest]);

  useEffect(() => {
    if (!feedsLoaded || feedUrls.length === 0) return;
    fetchRssFeeds(feedUrls);
  }, [feedUrls, feedsLoaded, fetchRssFeeds]);

  useEffect(() => {
    if (igUrls.length === 0) return;
    loadIgCache();
    fetchIgPosts(igUrls);
  }, [igUrls, loadIgCache, fetchIgPosts]);

  // ── Build unified feed ──

  const unifiedFeed = useMemo(() => {
    const items: UnifiedFeedItem[] = [];

    // RSS items
    for (const feed of feeds) {
      if (feed.error) continue;
      for (const item of feed.items) {
        items.push({
          id: `rss-${item.link || item.title}-${feed.feedTitle}`,
          sourceType: "rss",
          title: item.title,
          excerpt: item.excerpt || item.description,
          mood: item.mood,
          topics: item.topics,
          link: item.link,
          sourceName: item.source || feed.feedTitle,
          date: item.pubDate ? new Date(item.pubDate) : undefined,
          suggestedStyle: item.suggestedStyle,
          original: item,
        });
      }
    }

    // Instagram posts
    for (let i = 0; i < igPosts.length; i++) {
      const post = igPosts[i];
      if (post.error) continue;
      items.push({
        id: `ig-${post.url}-${i}`,
        sourceType: "instagram",
        title: post.title || "Instagram post",
        subtitle: `@${post.authorName}`,
        mood: post.mood,
        topics: post.hashtags?.slice(0, 4),
        link: post.url,
        imageUrl: post.thumbnailUrl,
        sourceName: `@${post.authorName}`,
        date: undefined,
        original: post,
      });
    }

    // Digest items
    if (digest) {
      for (let i = 0; i < digest.items.length; i++) {
        const item = digest.items[i];
        items.push({
          id: `digest-${digest.id}-${i}`,
          sourceType: "digest",
          title: item.title,
          excerpt: item.suggestedPrompt,
          mood: item.mood,
          topics: item.topics,
          link: item.link,
          sourceName: item.feedTitle || "Daily Digest",
          date: new Date(digest.createdAt),
          original: item,
        });
      }
    }

    // Daily prompts
    for (const p of dailyPrompts) {
      const styleParts = p.style?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const moodKey = styleParts[0]?.toLowerCase();
      items.push({
        id: `daily-${p.id}`,
        sourceType: "daily",
        title: p.name,
        excerpt: p.prompt,
        mood: moodKey,
        topics: styleParts.slice(1),
        sourceName: "Daily Prompts",
        date: new Date(p.createdAt),
        suggestedStyle: p.style ?? undefined,
        original: p,
      });
    }

    // Pending feed generations
    for (const item of pendingGenerations) {
      const styleParts = item.style?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      const moodKey = styleParts[0]?.toLowerCase();
      items.push({
        id: `pending-${item.id}`,
        sourceType: "pending",
        title: item.itemTitle,
        excerpt: item.prompt,
        mood: moodKey,
        sourceName: item.feedTitle || "Auto-generated",
        date: new Date(item.createdAt),
        original: item,
      });
    }

    return items;
  }, [feeds, igPosts, digest, dailyPrompts, pendingGenerations]);

  // ── Available sources (only show chips for sources that have data) ──

  const availableSources = useMemo(() => {
    const sources: SourceType[] = [];
    if (feeds.some((f) => !f.error && f.items.length > 0)) sources.push("rss");
    if (igPosts.some((p) => !p.error)) sources.push("instagram");
    if (digest && digest.items.length > 0) sources.push("digest");
    if (dailyPrompts.length > 0) sources.push("daily");
    if (pendingGenerations.length > 0) sources.push("pending");
    return sources;
  }, [feeds, igPosts, digest, dailyPrompts, pendingGenerations]);

  // ── Collect all moods ──

  const allMoods = useMemo(() => {
    return Array.from(
      new Set(
        unifiedFeed
          .map((i) => i.mood)
          .filter((m): m is string => !!m && m !== "neutral")
      )
    ).sort();
  }, [unifiedFeed]);

  // ── Filter and sort ──

  const filteredFeed = useMemo(() => {
    let items = unifiedFeed.filter((item) => sourceFilters.has(item.sourceType));
    if (moodFilter) {
      items = items.filter((item) => item.mood === moodFilter);
    }
    if (sortMode === "newest") {
      items.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.getTime() - a.date.getTime();
      });
    }
    // "bestmatch" keeps the natural order (grouped by source, most relevant first)
    return items;
  }, [unifiedFeed, sourceFilters, moodFilter, sortMode]);

  // ── Action handlers ──

  const handleCardAction = useCallback(
    (item: UnifiedFeedItem) => {
      switch (item.sourceType) {
        case "rss": {
          const rssItem = item.original as FeedItem;
          const parts: string[] = [];
          if (rssItem.title) parts.push(rssItem.title);
          const body = rssItem.content || rssItem.description || "";
          if (body) parts.push(body.slice(0, 800));
          if (rssItem.topics && rssItem.topics.length > 0) parts.push(`Themes: ${rssItem.topics.join(", ")}`);
          if (rssItem.mood && rssItem.mood !== "neutral") parts.push(`Mood: ${rssItem.mood}`);
          const lyricsPrompt = parts.join("\n\n");
          const params = new URLSearchParams();
          params.set("lyricsprompt", lyricsPrompt);
          const style = rssItem.suggestedStyle || (rssItem.mood !== "neutral" ? rssItem.mood : "");
          if (style) params.set("tags", style);
          router.push(`/generate?${params.toString()}`);
          break;
        }
        case "instagram": {
          const post = item.original as InstagramPost;
          router.push(`/generate?prompt=${encodeURIComponent(post.promptSuggestion)}`);
          break;
        }
        case "digest": {
          const digestItem = item.original as DigestItem;
          router.push(`/generate?prompt=${encodeURIComponent(digestItem.suggestedPrompt)}`);
          break;
        }
        case "daily": {
          const prompt = item.original as DailyPrompt;
          router.push(`/generate?prompt=${encodeURIComponent(prompt.prompt)}`);
          break;
        }
        case "pending":
          // Handled by onApprove
          break;
      }
    },
    [router]
  );

  const handleApproveCard = useCallback(
    (item: UnifiedFeedItem) => {
      if (item.sourceType === "pending") {
        handleApprovePending(item.original as PendingFeedGenerationItem);
      }
    },
    [handleApprovePending]
  );

  const handleDismissCard = useCallback(
    (item: UnifiedFeedItem) => {
      if (item.sourceType === "pending") {
        handleDismissPending((item.original as PendingFeedGenerationItem).id);
      }
    },
    [handleDismissPending]
  );

  const toggleSourceFilter = useCallback((source: SourceType) => {
    setSourceFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        // Don't allow deselecting all
        if (next.size > 1) next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    const promises: Promise<void>[] = [];
    promises.push(fetchDailyPrompts());
    promises.push(fetchLatestDigest());
    promises.push(fetchPendingGenerations());
    if (hasRss) promises.push(fetchRssFeeds(feedUrls));
    if (hasIg) promises.push(fetchIgPosts(igUrls));
    await Promise.all(promises);
  }, [hasRss, hasIg, feedUrls, igUrls, fetchDailyPrompts, fetchLatestDigest, fetchPendingGenerations, fetchRssFeeds, fetchIgPosts]);

  const isLoading = rssLoading || igLoading || dailyLoading || pendingLoading || digestLoading || !feedsLoaded;

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

  // Show generate CTAs when daily prompts or digest are empty and their sources are active
  const showDailyPromptsCTA =
    sourceFilters.has("daily") && dailyPrompts.length === 0 && !dailyLoading && !dailyGenerating;
  const showDigestCTA =
    sourceFilters.has("digest") && !digest && !digestLoading && !digestGenerating && hasRss;

  return (
    <PullToRefreshContainer onRefresh={handleRefresh}>
      <div className="px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inspire</h2>
          <div className="flex items-center gap-3">
            {dailyStale && dailyPrompts.length > 0 && (
              <button
                onClick={generateDailyPrompts}
                disabled={dailyGenerating}
                className="flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
              >
                <BoltIcon className={`w-3.5 h-3.5 ${dailyGenerating ? "animate-spin" : ""}`} />
                Refresh prompts
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {lastRefreshed && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Updated {lastRefreshed.toLocaleTimeString()}
          </p>
        )}

        {/* Source filter chips */}
        {availableSources.length > 1 && (
          <SourceFilterChips
            sources={availableSources}
            activeFilters={sourceFilters}
            onToggle={toggleSourceFilter}
          />
        )}

        {/* Mood filter + sort toggle */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <MoodFilterChips moods={allMoods} activeMood={moodFilter} onSelect={setMoodFilter} />
          </div>
          <SortToggle mode={sortMode} onChange={setSortMode} />
        </div>

        {/* Generate CTAs */}
        {showDailyPromptsCTA && (
          <GeneratePromptsCTA generating={dailyGenerating} onGenerate={generateDailyPrompts} />
        )}
        {showDigestCTA && (
          <GenerateDigestCTA generating={digestGenerating} onGenerate={generateDigest} />
        )}

        {/* Digest refresh button */}
        {digest && sourceFilters.has("digest") && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <SparklesIcon className="w-3.5 h-3.5" />
              Digest: {digest.title}
            </span>
            <button
              onClick={generateDigest}
              disabled={digestGenerating}
              className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${digestGenerating ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && filteredFeed.length === 0 && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse"
              >
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4 mb-3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-full mb-1" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Unified feed */}
        <div className="space-y-3">
          {filteredFeed.map((item) => (
            <UnifiedCard
              key={item.id}
              item={item}
              onAction={handleCardAction}
              onApprove={item.sourceType === "pending" ? handleApproveCard : undefined}
              onDismiss={item.sourceType === "pending" ? handleDismissCard : undefined}
            />
          ))}
        </div>

        {/* Empty filtered state */}
        {!isLoading && filteredFeed.length === 0 && !showDailyPromptsCTA && !showDigestCTA && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No items match your current filters. Try adjusting the source or mood filters.
            </p>
          </div>
        )}
      </div>
    </PullToRefreshContainer>
  );
}

export default function InspirePage() {
  return (
    <AppShell>
      <InspireContent />
    </AppShell>
  );
}
