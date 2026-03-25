"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import {
  MusicalNoteIcon,
  UserGroupIcon,
  QueueListIcon,
  HeartIcon,
} from "@heroicons/react/24/outline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  publicSongsCount: number;
  isFollowing: boolean;
}

interface ActivitySong {
  id: string;
  publicSlug: string | null;
  title: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
}

interface ActivityPlaylist {
  id: string;
  name: string;
  slug: string | null;
  songCount: number;
}

interface ActivityItem {
  id: string;
  type: "song_created" | "playlist_created" | "song_favorited";
  createdAt: string;
  song: ActivitySong | null;
  playlist: ActivityPlaylist | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 20 }: { user: Pick<UserProfile, "name" | "image">; size?: number }) {
  const initials = (user.name ?? "?").charAt(0).toUpperCase();
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? "User"}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-white" style={{ fontSize: size * 0.4 }}>
        {initials}
      </span>
    </div>
  );
}

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({ item }: { item: ActivityItem }) {
  if (item.type === "song_created" && item.song) {
    const href = item.song.publicSlug ? `/s/${item.song.publicSlug}` : null;
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400">published a song</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        {href ? (
          <Link href={href} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors">
            <SongThumbnail song={item.song} />
          </Link>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <SongThumbnail song={item.song} />
          </div>
        )}
      </div>
    );
  }

  if (item.type === "playlist_created" && item.playlist) {
    const href = item.playlist.slug
      ? `/playlists/${item.playlist.slug}`
      : `/playlists/${item.playlist.id}`;
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400">created a playlist</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        <Link href={href} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
            <QueueListIcon className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.playlist.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {item.playlist.songCount} song{item.playlist.songCount !== 1 ? "s" : ""}
            </p>
          </div>
        </Link>
      </div>
    );
  }

  if (item.type === "song_favorited" && item.song) {
    const href = item.song.publicSlug ? `/s/${item.song.publicSlug}` : null;
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <HeartIcon className="w-3.5 h-3.5 text-pink-500 inline" /> favorited a song
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">
            {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        {href ? (
          <Link href={href} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors">
            <SongThumbnail song={item.song} />
          </Link>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <SongThumbnail song={item.song} />
          </div>
        )}
      </div>
    );
  }

  return null;
}

function SongThumbnail({ song }: { song: ActivitySong }) {
  return (
    <>
      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Song"}
            width={40}
            height={40}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
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

// ─── Follow Button ─────────────────────────────────────────────────────────────

function FollowButton({
  userId,
  isFollowing: initialFollowing,
  onUpdate,
}: {
  userId: string;
  isFollowing: boolean;
  onUpdate: (following: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(initialFollowing);

  const toggle = async () => {
    setLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${userId}/follow`, { method });
      if (res.ok) {
        const next = !following;
        setFollowing(next);
        onUpdate(next);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
        following
          ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          : "bg-violet-600 hover:bg-violet-500 text-white"
      }`}
    >
      {loading ? "…" : following ? "Unfollow" : "Follow"}
    </button>
  );
}

// ─── Profile Header ────────────────────────────────────────────────────────────

function ProfileHeader({
  profile,
  onFollowChange,
}: {
  profile: UserProfile;
  onFollowChange: (following: boolean) => void;
}) {
  const { data: session, status } = useSession();
  const isOwnProfile = session?.user?.id === profile.id;

  return (
    <section className="flex flex-col items-center gap-3 pt-2">
      <UserAvatar user={profile} size={72} />
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
        {profile.name ?? "Anonymous"}
      </h2>

      {/* Stats row */}
      <div className="flex items-center gap-6 text-center">
        <div>
          <p className="text-base font-bold text-gray-900 dark:text-white">{profile.publicSongsCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Songs</p>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900 dark:text-white">{profile.followersCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Followers</p>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900 dark:text-white">{profile.followingCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Following</p>
        </div>
      </div>

      {/* Follow button */}
      {status === "authenticated" && !isOwnProfile && (
        <FollowButton
          userId={profile.id}
          isFollowing={profile.isFollowing}
          onUpdate={onFollowChange}
        />
      )}
      {isOwnProfile && (
        <Link
          href="/profile"
          className="text-xs text-violet-500 hover:text-violet-400 transition-colors"
        >
          Edit profile
        </Link>
      )}
    </section>
  );
}

// ─── Activity Feed ─────────────────────────────────────────────────────────────

function UserActivityFeed({ userId }: { userId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchActivity = useCallback(async (p: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/activity?page=${p}`);
      if (!res.ok) return;
      const data = await res.json();
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setHasMore(data.pagination.hasMore);
      setPage(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchActivity(1);
  }, [fetchActivity]);

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
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No public activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <ActivityCard key={item.id} item={item} />
      ))}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => fetchActivity(page + 1, true)}
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/users/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setProfile(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleFollowChange = (following: boolean) => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: following,
            followersCount: following ? prev.followersCount + 1 : prev.followersCount - 1,
          }
        : prev
    );
  };

  if (loading) {
    return (
      <AppShell>
        <div className="px-4 py-6 space-y-6">
          <div className="flex flex-col items-center gap-3 pt-2 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (notFound || !profile) {
    return (
      <AppShell>
        <div className="px-4 py-16 flex flex-col items-center gap-4 text-center">
          <UserGroupIcon className="w-12 h-12 text-gray-300 dark:text-gray-700" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">User not found</p>
          <Link href="/discover" className="text-sm text-violet-500 hover:text-violet-400">
            Discover creators
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 py-6 space-y-6">
        <ProfileHeader profile={profile} onFollowChange={handleFollowChange} />
        <div className="border-t border-gray-200 dark:border-gray-800" />
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Activity</h3>
          <UserActivityFeed userId={profile.id} />
        </section>
      </div>
    </AppShell>
  );
}
