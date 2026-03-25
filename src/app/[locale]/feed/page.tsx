"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { MusicalNoteIcon, UserGroupIcon } from "@heroicons/react/24/outline";

interface FeedUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface FeedSong {
  id: string;
  publicSlug: string | null;
  title: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
}

interface FeedItem {
  type: "new_song";
  id: string;
  createdAt: string;
  user: FeedUser;
  song: FeedSong;
}

interface Pagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ user }: { user: FeedUser }) {
  const initials = (user.name ?? "?").charAt(0).toUpperCase();
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? "User"}
        width={36}
        height={36}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-bold text-white">{initials}</span>
    </div>
  );
}

function FeedItemCard({ item }: { item: FeedItem }) {
  const href = item.song.publicSlug ? `/s/${item.song.publicSlug}` : null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex gap-3">
      <Avatar user={item.user} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {item.user.name ?? "Someone"}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">published a song</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>

        {href ? (
          <Link href={href} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors">
            <SongThumb song={item.song} />
          </Link>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <SongThumb song={item.song} />
          </div>
        )}
      </div>
    </div>
  );
}

function SongThumb({ song }: { song: FeedSong }) {
  return (
    <>
      <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Song"}
            width={48}
            height={48}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <MusicalNoteIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {song.title ?? "Untitled"}
        </p>
        {song.tags && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.tags}</p>
        )}
      </div>
    </>
  );
}

function FeedContent() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchFeed = useCallback(async (page: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/feed?page=${page}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setPagination(data.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed(1);
  }, [fetchFeed]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <UserGroupIcon className="w-12 h-12 text-gray-300 dark:text-gray-700" />
        <div className="space-y-1">
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">Your feed is empty</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Follow other creators to see their new songs here.
          </p>
        </div>
        <Link
          href="/discover"
          className="mt-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Discover creators
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FeedItemCard key={item.id} item={item} />
      ))}
      {pagination?.hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => fetchFeed(pagination.page + 1, true)}
            disabled={loadingMore}
            className="text-sm text-violet-500 hover:text-violet-400 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function FeedPage() {
  const { status } = useSession();

  if (status === "unauthenticated") {
    return (
      <AppShell>
        <div className="px-4 py-16 flex flex-col items-center gap-4 text-center">
          <UserGroupIcon className="w-12 h-12 text-gray-300 dark:text-gray-700" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">
            Sign in to see your feed
          </p>
          <Link
            href="/login"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Feed</h1>
        <FeedContent />
      </div>
    </AppShell>
  );
}
