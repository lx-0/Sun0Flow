"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  MusicalNoteIcon,
  QueueListIcon,
  UserGroupIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeaturedSong {
  id: string;
  title: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
}

interface PublicProfile {
  id: string;
  name: string | null;
  username: string;
  image: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  publicSongsCount: number;
  totalPlays: number;
  featuredSong: FeaturedSong | null;
  isFollowing: boolean;
}

interface Milestone {
  type: string;
  label: string;
  description: string;
  emoji: string;
  earnedAt: string;
}

interface Song {
  id: string;
  title: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
  playCount: number;
  createdAt: string;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;
  songCount: number;
  coverImage: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  image,
  avatarUrl,
  size,
}: {
  name: string | null;
  image: string | null;
  avatarUrl: string | null;
  size: number;
}) {
  const src = avatarUrl || image;
  const initials = (name ?? "?").charAt(0).toUpperCase();
  if (src) {
    return (
      <Image
        src={src}
        alt={name ?? "User"}
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

// ─── Follow Button ─────────────────────────────────────────────────────────────

function FollowButton({
  userId,
  isFollowing: initialFollowing,
  onUpdate,
}: {
  userId: string;
  isFollowing: boolean;
  onUpdate: (following: boolean, delta: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(initialFollowing);
  const { status } = useSession();

  if (status !== "authenticated") return null;

  const toggle = async () => {
    setLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      const res = await fetch(`/api/users/${userId}/follow`, { method });
      if (res.ok) {
        const next = !following;
        setFollowing(next);
        onUpdate(next, next ? 1 : -1);
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
      className={`px-5 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
        following
          ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
          : "bg-violet-600 hover:bg-violet-500 text-white"
      }`}
    >
      {loading ? "…" : following ? "Unfollow" : "Follow"}
    </button>
  );
}

// ─── Share Button ──────────────────────────────────────────────────────────────

function ShareButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const url = `${window.location.origin}/u/${username}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors border border-gray-200 dark:border-gray-700 rounded-lg"
    >
      <LinkIcon className="w-3.5 h-3.5" />
      {copied ? "Copied!" : "Share profile"}
    </button>
  );
}

// ─── Featured Song ─────────────────────────────────────────────────────────────

function FeaturedSongCard({ song }: { song: FeaturedSong }) {
  const href = song.publicSlug ? `/s/${song.publicSlug}` : null;
  const inner = (
    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl p-3 transition-colors border border-gray-200 dark:border-gray-700">
      <div className="w-14 h-14 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Featured song"}
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        ) : (
          <MusicalNoteIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {song.title ?? "Untitled"}
        </p>
        {song.tags && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{song.tags}</p>
        )}
        {song.duration && (
          <p className="text-xs text-violet-500 mt-0.5">{formatDuration(song.duration)}</p>
        )}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Song Grid ─────────────────────────────────────────────────────────────────

function SongCard({ song }: { song: Song }) {
  const href = song.publicSlug ? `/s/${song.publicSlug}` : null;
  const inner = (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-violet-400 dark:hover:border-violet-600 transition-colors">
      <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Song"}
            width={200}
            height={200}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {song.title ?? "Untitled"}
        </p>
        {song.tags && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{song.tags}</p>
        )}
        <div className="flex items-center justify-between mt-1">
          {song.duration && (
            <span className="text-xs text-gray-400">{formatDuration(song.duration)}</span>
          )}
          {song.playCount > 0 && (
            <span className="text-xs text-gray-400">{formatCount(song.playCount)} plays</span>
          )}
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

function SongsTab({ username }: { username: string }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchSongs = useCallback(
    async (p: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await fetch(`/api/u/${username}/songs?page=${p}`);
        if (!res.ok) return;
        const data = await res.json();
        setSongs((prev) => (append ? [...prev, ...data.songs] : data.songs));
        setHasMore(data.pagination.hasMore);
        setPage(p);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [username]
  );

  useEffect(() => {
    fetchSongs(1);
  }, [fetchSongs]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl aspect-square animate-pulse" />
        ))}
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No public songs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {songs.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchSongs(page + 1, true)}
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

// ─── Playlists Tab ─────────────────────────────────────────────────────────────

function PlaylistsTab({ username }: { username: string }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPlaylists = useCallback(
    async (p: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await fetch(`/api/u/${username}/playlists?page=${p}`);
        if (!res.ok) return;
        const data = await res.json();
        setPlaylists((prev) => (append ? [...prev, ...data.playlists] : data.playlists));
        setHasMore(data.pagination.hasMore);
        setPage(p);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [username]
  );

  useEffect(() => {
    fetchPlaylists(1);
  }, [fetchPlaylists]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <QueueListIcon className="w-10 h-10 text-gray-300 dark:text-gray-700" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No public playlists yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {playlists.map((pl) => {
          const href = pl.slug ? `/p/${pl.slug}` : `/playlists/${pl.id}`;
          return (
            <li key={pl.id}>
              <Link
                href={href}
                className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {pl.coverImage ? (
                    <Image
                      src={pl.coverImage}
                      alt={pl.name}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <QueueListIcon className="w-5 h-5 text-violet-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{pl.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {pl.songCount} song{pl.songCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchPlaylists(page + 1, true)}
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

// ─── Liked Songs Tab ───────────────────────────────────────────────────────────

function LikedSongsTab({ username }: { username: string }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchSongs = useCallback(
    async (p: number, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await fetch(`/api/u/${username}/liked-songs?page=${p}`);
        if (!res.ok) return;
        const data = await res.json();
        setSongs((prev) => (append ? [...prev, ...data.songs] : data.songs));
        setHasMore(data.pagination.hasMore);
        setPage(p);
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [username]
  );

  useEffect(() => {
    fetchSongs(1);
  }, [fetchSongs]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl aspect-square animate-pulse" />
        ))}
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No liked songs yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {songs.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchSongs(page + 1, true)}
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

// ─── Milestone Badges ──────────────────────────────────────────────────────────

function MilestoneBadges({ username }: { username: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    fetch(`/api/u/${username}/milestones`)
      .then((r) => r.json())
      .then((d) => setMilestones(d.milestones ?? []))
      .catch(() => {});
  }, [username]);

  if (milestones.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Badges
      </p>
      <div className="flex flex-wrap gap-2">
        {milestones.map((m) => (
          <div
            key={m.type}
            title={m.description}
            className="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300"
          >
            <span>{m.emoji}</span>
            <span>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "songs" | "playlists" | "liked";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "songs", label: "Songs" },
    { key: "playlists", label: "Playlists" },
    { key: "liked", label: "Liked" },
  ];
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-800">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            active === key
              ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main View ─────────────────────────────────────────────────────────────────

export function PublicProfileView({ profile: initialProfile }: { profile: PublicProfile }) {
  const { data: session } = useSession();
  const [profile, setProfile] = useState(initialProfile);
  const [activeTab, setActiveTab] = useState<Tab>("songs");

  const isOwnProfile = session?.user?.id === profile.id;

  const handleFollowUpdate = (_following: boolean, delta: number) => {
    setProfile((prev) => ({ ...prev, followersCount: prev.followersCount + delta }));
  };

  const joinDate = new Date(profile.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Banner */}
      <div className="relative h-32 bg-gradient-to-br from-violet-600 to-purple-800 overflow-hidden">
        {profile.bannerUrl && (
          <Image
            src={profile.bannerUrl}
            alt="Profile banner"
            fill
            className="object-cover"
            priority
          />
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4">
        {/* Avatar — overlaps banner */}
        <div className="-mt-10 mb-3 flex items-end justify-between">
          <div className="ring-4 ring-white dark:ring-gray-950 rounded-full">
            <Avatar
              name={profile.name}
              image={profile.image}
              avatarUrl={profile.avatarUrl}
              size={80}
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <ShareButton username={profile.username} />
            {!isOwnProfile && (
              <FollowButton
                userId={profile.id}
                isFollowing={profile.isFollowing}
                onUpdate={handleFollowUpdate}
              />
            )}
            {isOwnProfile && (
              <Link
                href="/settings"
                className="px-4 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Edit profile
              </Link>
            )}
          </div>
        </div>

        {/* Name & bio */}
        <div className="space-y-1 mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {profile.name ?? profile.username}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
          {profile.bio && (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mt-2">
              {profile.bio}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 pt-1">
            <UserGroupIcon className="w-3.5 h-3.5" />
            Joined {joinDate}
          </p>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-4">
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {formatCount(profile.publicSongsCount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Songs</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {formatCount(profile.totalPlays)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Plays</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {formatCount(profile.followersCount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {formatCount(profile.followingCount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Following</p>
          </div>
        </div>

        {/* Featured song */}
        {profile.featuredSong && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Featured
            </p>
            <FeaturedSongCard song={profile.featuredSong} />
          </div>
        )}

        {/* Milestone badges */}
        <MilestoneBadges username={profile.username} />

        {/* Tabs */}
        <TabBar active={activeTab} onChange={setActiveTab} />
        <div className="py-4">
          {activeTab === "songs" && <SongsTab username={profile.username} />}
          {activeTab === "playlists" && <PlaylistsTab username={profile.username} />}
          {activeTab === "liked" && <LikedSongsTab username={profile.username} />}
        </div>
      </div>
    </div>
  );
}
