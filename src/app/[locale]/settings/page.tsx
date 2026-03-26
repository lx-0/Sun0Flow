"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/AppShell";
import { useTheme } from "@/components/ThemeProvider";
import { PlusIcon, TrashIcon, SunIcon, MoonIcon, ComputerDesktopIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowPathIcon, KeyIcon, ArrowDownTrayIcon, UserCircleIcon, Cog6ToothIcon, ShieldCheckIcon, BellIcon, SpeakerWaveIcon, ChartBarIcon, ExclamationTriangleIcon, CommandLineIcon, ClipboardDocumentIcon, LockClosedIcon, CloudArrowDownIcon } from "@heroicons/react/24/outline";
import { useOnboarding } from "@/components/OnboardingTour";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { getCachedSongsMeta, formatBytes } from "@/lib/offline-cache";
import { canUseFeature, type SubscriptionTier } from "@/lib/feature-gates";

// RSS feeds are now stored in the database via /api/rss/feeds

const AVAILABLE_STYLES = ["pop", "rock", "electronic", "hip-hop", "jazz", "classical", "r&b", "country", "folk", "ambient", "metal", "latin", "instrumental", "lo-fi", "cinematic"];

type Tab = "profile" | "preferences" | "account";

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${
        type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      {message}
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>;
}

// ─── Profile Tab ───

interface ProfileSong {
  id: string;
  title: string | null;
}

function ProfileTab() {
  const { data: session, update: updateSession } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [featuredSongId, setFeaturedSongId] = useState("");
  const [songs, setSongs] = useState<ProfileSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/songs?limit=50").then((r) => r.json()).catch(() => ({ songs: [] })),
    ])
      .then(([profile, songsData]) => {
        setDisplayName(profile.name ?? "");
        setUsername(profile.username ?? "");
        setBio(profile.bio ?? "");
        setAvatarUrl(profile.avatarUrl ?? "");
        setBannerUrl(profile.bannerUrl ?? "");
        setFeaturedSongId(profile.featuredSongId ?? "");
        setSongs(songsData.songs ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!displayName.trim()) errs.displayName = "Display name is required";
    if (bio.length > 500) errs.bio = `Bio must be 500 characters or less (${bio.length}/500)`;
    if (avatarUrl && !avatarUrl.startsWith("http://") && !avatarUrl.startsWith("https://")) {
      errs.avatarUrl = "Must be a valid URL starting with http:// or https://";
    }
    if (bannerUrl && !bannerUrl.startsWith("http://") && !bannerUrl.startsWith("https://")) {
      errs.bannerUrl = "Must be a valid URL starting with http:// or https://";
    }
    if (username && !/^[a-z0-9_]+$/.test(username)) {
      errs.username = "Username may only contain lowercase letters, numbers, and underscores";
    }
    if (username && username.length > 30) {
      errs.username = "Username must be 30 characters or less";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [displayName, bio, avatarUrl, bannerUrl, username]);

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName.trim(),
          username: username.trim().toLowerCase() || null,
          bio: bio.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          bannerUrl: bannerUrl.trim() || null,
          featuredSongId: featuredSongId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to save profile", "error");
      } else {
        await updateSession({ name: data.name });
        showToast("Profile saved", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="space-y-6">
        {/* Avatar preview */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Profile Picture</h3>
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={64}
                height={64}
                className="rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                unoptimized
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <UserCircleIcon className="w-10 h-10 text-violet-400" />
              </div>
            )}
            <div className="flex-1 space-y-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Avatar URL</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => { setAvatarUrl(e.target.value); setErrors((p) => ({ ...p, avatarUrl: "" })); }}
                placeholder="https://example.com/avatar.jpg"
                className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                  errors.avatarUrl ? "border-red-500" : "border-gray-300 dark:border-gray-700"
                }`}
              />
              <FieldError error={errors.avatarUrl} />
            </div>
          </div>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Display name */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Display Name</h3>
          <div className="space-y-1">
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setErrors((p) => ({ ...p, displayName: "" })); }}
              placeholder="Your name"
              className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                errors.displayName ? "border-red-500" : "border-gray-300 dark:border-gray-700"
              }`}
            />
            <FieldError error={errors.displayName} />
          </div>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Username */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Username</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400 dark:text-gray-500 flex-shrink-0">/u/</span>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value.toLowerCase()); setErrors((p) => ({ ...p, username: "" })); }}
                placeholder="yourhandle"
                maxLength={30}
                className={`flex-1 bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                  errors.username ? "border-red-500" : "border-gray-300 dark:border-gray-700"
                }`}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Lowercase letters, numbers, and underscores only.</p>
            <FieldError error={errors.username} />
          </div>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Bio */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Bio</h3>
            <span className={`text-xs ${bio.length > 500 ? "text-red-500" : "text-gray-400 dark:text-gray-500"}`}>
              {bio.length}/500
            </span>
          </div>
          <div className="space-y-1">
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); setErrors((p) => ({ ...p, bio: "" })); }}
              placeholder="Tell others about yourself..."
              rows={3}
              className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none ${
                errors.bio ? "border-red-500" : "border-gray-300 dark:border-gray-700"
              }`}
            />
            <FieldError error={errors.bio} />
          </div>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Profile banner */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Profile Banner</h3>
          {bannerUrl && (
            <div className="w-full h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
              <Image
                src={bannerUrl}
                alt="Banner preview"
                width={600}
                height={80}
                className="w-full h-full object-cover"
                unoptimized
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Banner URL</label>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => { setBannerUrl(e.target.value); setErrors((p) => ({ ...p, bannerUrl: "" })); }}
              placeholder="https://example.com/banner.jpg"
              className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                errors.bannerUrl ? "border-red-500" : "border-gray-300 dark:border-gray-700"
              }`}
            />
            <FieldError error={errors.bannerUrl} />
          </div>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Featured song */}
        {songs.length > 0 && (
          <>
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Featured Song</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pin one of your public songs to the top of your profile.</p>
              <select
                value={featuredSongId}
                onChange={(e) => setFeaturedSongId(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                <option value="">None</option>
                {songs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title ?? "Untitled"}</option>
                ))}
              </select>
            </section>

            <div className="border-t border-gray-200 dark:border-gray-800" />
          </>
        )}

        {/* Email (read-only) */}
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Email</h3>
          <input
            type="email"
            value={session?.user?.email ?? ""}
            readOnly
            className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-500 dark:text-gray-400 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">Email cannot be changed.</p>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors min-h-[44px]"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>

        {username && (
          <div className="text-center">
            <Link
              href={`/u/${username}`}
              className="text-sm text-violet-500 hover:text-violet-400 transition-colors"
            >
              View public profile →
            </Link>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <ConnectedAccountsSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <SubscriptionSummarySection />
      </div>
    </>
  );
}

// ─── Preferences Tab ───

const SEED_GENRES = ["pop", "rock", "electronic", "hip-hop", "jazz", "classical", "r&b", "country", "folk", "ambient", "metal", "latin", "instrumental", "lo-fi", "cinematic"];

// ─── Offline Cache Section ───

function OfflineCacheSection() {
  const { stats, saving, removeOffline, clearAll } = useOfflineCache();
  const [songs, setSongs] = useState(getCachedSongsMeta);

  // Re-read from storage whenever stats change (after save/remove)
  useEffect(() => {
    setSongs(getCachedSongsMeta());
  }, [stats]);

  const [confirming, setConfirming] = useState(false);

  async function handleClearAll() {
    await clearAll();
    setSongs([]);
    setConfirming(false);
  }

  const usedLabel = formatBytes(stats.totalBytes);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <CloudArrowDownIcon className="w-4 h-4 text-violet-500" />
          Offline Songs
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Songs saved for playback without a network connection.
        </p>
      </div>

      {/* Usage bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Cached songs</span>
          <span className="font-semibold text-gray-900 dark:text-white">{stats.count}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Storage used</span>
          <span className="font-semibold text-gray-900 dark:text-white">{usedLabel}</span>
        </div>

        {/* Song list */}
        {songs.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-800">
            {songs.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                  {s.title ?? "Untitled"}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {formatBytes(s.size)}
                </span>
                <button
                  onClick={() => {
                    removeOffline(s.id);
                    setSongs((prev) => prev.filter((m) => m.id !== s.id));
                  }}
                  disabled={saving.has(s.id)}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={`Remove "${s.title ?? "Untitled"}" from offline cache`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {songs.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
            No songs saved offline. Use the cloud icon on any song to save it.
          </p>
        )}
      </div>

      {/* Clear all */}
      {songs.length > 0 && (
        confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Remove all {stats.count} offline songs?</span>
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors min-h-[44px]"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-sm text-red-500 dark:text-red-400 hover:underline"
          >
            Clear All Offline Songs
          </button>
        )
      )}
    </section>
  );
}

function PreferencesTab() {
  const [defaultStyle, setDefaultStyle] = useState<string | null>(null);
  const [preferredGenres, setPreferredGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [genreInput, setGenreInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch("/api/profile/preferences")
      .then((r) => r.json())
      .then((data) => {
        setDefaultStyle(data.defaultStyle ?? null);
        const genres = data.preferredGenres ?? [];
        setPreferredGenres(genres);
        if (genres.length === 0) {
          setSuggestions(SEED_GENRES.slice(0, 8));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchSuggestions = useCallback(async (genres: string[], partial?: string) => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/profile/genres/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentGenres: genres, partial }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  const addGenre = (genre: string) => {
    const normalized = genre.trim().toLowerCase().slice(0, 50);
    if (!normalized) return;
    if (preferredGenres.length >= 10) return;
    if (preferredGenres.includes(normalized)) return;
    const next = [...preferredGenres, normalized];
    setPreferredGenres(next);
    setGenreInput("");
    fetchSuggestions(next);
  };

  const removeGenre = (genre: string) => {
    const next = preferredGenres.filter((g) => g !== genre);
    setPreferredGenres(next);
    if (next.length === 0) {
      setSuggestions(SEED_GENRES.slice(0, 8));
    } else {
      fetchSuggestions(next);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGenre(genreInput);
    } else if (e.key === "Backspace" && !genreInput && preferredGenres.length > 0) {
      removeGenre(preferredGenres[preferredGenres.length - 1]);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultStyle, preferredGenres }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to save preferences", "error");
      } else {
        showToast("Preferences saved", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <div className="space-y-6">
        {/* Default generation style */}
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Default Generation Style</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Pre-fill the style field when generating new music.</p>
          </div>
          <select
            value={defaultStyle ?? ""}
            onChange={(e) => setDefaultStyle(e.target.value || null)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          >
            <option value="">No default</option>
            {AVAILABLE_STYLES.map((style) => (
              <option key={style} value={style}>
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </option>
            ))}
          </select>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Preferred genres */}
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Preferred Genres</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Type a genre and press Enter to add. Up to 10. ({preferredGenres.length}/10)
            </p>
          </div>

          {/* Tag input box */}
          <div
            className="flex flex-wrap gap-2 min-h-[44px] w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-violet-500 focus-within:border-transparent cursor-text"
            onClick={() => inputRef.current?.focus()}
          >
            {preferredGenres.map((genre) => (
              <span
                key={genre}
                className="flex items-center gap-1 px-2.5 py-1 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200 rounded-full text-sm font-medium"
              >
                {genre.charAt(0).toUpperCase() + genre.slice(1)}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeGenre(genre); }}
                  className="text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 leading-none"
                  aria-label={`Remove ${genre}`}
                >
                  ×
                </button>
              </span>
            ))}
            {preferredGenres.length < 10 && (
              <input
                ref={inputRef}
                type="text"
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={preferredGenres.length === 0 ? "e.g. dream pop, afrobeat, dark jazz…" : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
              />
            )}
          </div>

          {/* AI suggestions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {preferredGenres.length === 0 ? "Popular genres — click to add:" : "Suggested for you — click to add:"}
              </p>
              {preferredGenres.length > 0 && (
                <button
                  type="button"
                  onClick={() => fetchSuggestions(preferredGenres)}
                  disabled={loadingSuggestions}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
                >
                  {loadingSuggestions ? "Loading…" : "Refresh suggestions"}
                </button>
              )}
            </div>
            {loadingSuggestions ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                ))}
              </div>
            ) : suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addGenre(s)}
                    disabled={preferredGenres.includes(s) || preferredGenres.length >= 10}
                    className="px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    + {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <button
          onClick={handleSavePreferences}
          disabled={saving}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors min-h-[44px]"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <ThemeSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <NotificationPreferencesSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <EmailNotificationsSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <PlaybackDefaultsSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <RssFeedsSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <InstagramPostsSection />

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <OfflineCacheSection />
      </div>
    </>
  );
}

// ─── Account Tab ───

function PersonalApiKeysSectionGated() {
  const { data: session } = useSession();
  const tier = ((session?.user as unknown as Record<string, unknown>)?.subscriptionTier as SubscriptionTier) ?? "free";
  const allowed = canUseFeature("apiKeys", tier);

  if (!allowed) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <LockClosedIcon className="w-4 h-4 text-violet-500" />
          Personal API Keys
          <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Studio</span>
        </h3>
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm">
          <p className="text-gray-600 dark:text-gray-400">
            Generate API keys to integrate SunoFlow into your own applications.
            Available on the <span className="font-semibold text-gray-900 dark:text-white">Studio</span> plan.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors"
          >
            Upgrade to Studio
          </Link>
        </div>
      </div>
    );
  }

  return <PersonalApiKeysSection />;
}

function AccountTab() {
  return (
    <div className="space-y-6">
      <PasswordSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <ApiKeySection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <PersonalApiKeysSectionGated />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <AgentSkillSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <RateLimitSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <OnboardingSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <ExportDataSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <TagManagementSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <DeleteAccountSection />
    </div>
  );
}

// ─── Shared Sections ───

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  const options: { value: "light" | "dark" | "system"; label: string; icon: typeof SunIcon }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: ComputerDesktopIcon },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Appearance</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Choose your preferred theme.</p>
      </div>
      <div className="flex gap-2">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-colors min-h-[44px] border ${
              theme === value
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!currentPassword) errs.currentPassword = "Current password is required";
    if (!newPassword) errs.newPassword = "New password is required";
    else if (newPassword.length < 8) errs.newPassword = "Must be at least 8 characters";
    if (!confirmPassword) errs.confirmPassword = "Please confirm your password";
    else if (newPassword !== confirmPassword) errs.confirmPassword = "Passwords do not match";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setPwLoading(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to change password", "error");
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setErrors({});
        showToast("Password changed successfully", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Change Password</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Update your account password.</p>
        </div>
        <form onSubmit={handlePasswordChange} className="space-y-2">
          <div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setErrors((p) => ({ ...p, currentPassword: "" })); }}
              placeholder="Current password"
              autoComplete="current-password"
              className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                errors.currentPassword ? "border-red-500" : "border-gray-300 dark:border-gray-700"
              }`}
            />
            <FieldError error={errors.currentPassword} />
          </div>
          <div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setErrors((p) => ({ ...p, newPassword: "" })); }}
              placeholder="New password (min 8 chars)"
              autoComplete="new-password"
              className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                errors.newPassword ? "border-red-500" : "border-gray-300 dark:border-gray-700"
              }`}
            />
            <FieldError error={errors.newPassword} />
          </div>
          <div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirmPassword: "" })); }}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                errors.confirmPassword ? "border-red-500" : "border-gray-300 dark:border-gray-700"
              }`}
            />
            <FieldError error={errors.confirmPassword} />
          </div>
          <button
            type="submit"
            disabled={pwLoading}
            className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {pwLoading ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>
    </>
  );
}

function RssFeedsSection() {
  const [feeds, setFeeds] = useState<{ id: string; url: string; title: string | null; autoGenerate: boolean }[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rss/feeds")
      .then((r) => r.json())
      .then((data) => setFeeds(data.feeds ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addFeed = async () => {
    const url = newUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("URL must start with http:// or https://");
      return;
    }
    setError("");
    setAdding(true);
    try {
      const res = await fetch("/api/rss/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add feed");
        return;
      }
      setFeeds((prev) => [...prev, data.feed]);
      setNewUrl("");
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  };

  const removeFeed = async (id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    try {
      await fetch(`/api/rss/feeds?id=${id}`, { method: "DELETE" });
    } catch {
      // ignore — optimistic removal
    }
  };

  const toggleAutoGenerate = async (id: string, current: boolean) => {
    setTogglingId(id);
    setFeeds((prev) =>
      prev.map((f) => (f.id === id ? { ...f, autoGenerate: !current } : f))
    );
    try {
      await fetch(`/api/rss/feeds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGenerate: !current }),
      });
    } catch {
      // revert on error
      setFeeds((prev) =>
        prev.map((f) => (f.id === id ? { ...f, autoGenerate: current } : f))
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") addFeed();
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">RSS Feeds</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Add RSS feed URLs to see inspiration on the Inspire page.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => {
            setNewUrl(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com/feed.xml"
          className={`flex-1 bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
            error ? "border-red-500" : "border-gray-300 dark:border-gray-700"
          }`}
        />
        <button
          onClick={addFeed}
          disabled={adding}
          className="flex items-center gap-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <PlusIcon className="w-4 h-4" />
          {adding ? "Adding..." : "Add"}
        </button>
      </div>

      <FieldError error={error} />

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading feeds...</p>
      ) : feeds.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No feeds added yet.</p>
      ) : (
        <ul className="space-y-2">
          {feeds.map((feed) => (
            <li
              key={feed.id}
              className="flex flex-col gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{feed.url}</span>
                <button
                  onClick={() => removeFeed(feed.id)}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Remove feed"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  role="switch"
                  aria-checked={feed.autoGenerate}
                  disabled={togglingId === feed.id}
                  onClick={() => toggleAutoGenerate(feed.id, feed.autoGenerate)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 disabled:opacity-50 ${
                    feed.autoGenerate ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                      feed.autoGenerate ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Auto-generate when new items arrive
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const IG_POSTS_KEY = "sunoflow_ig_posts";

function InstagramPostsSection() {
  const [postUrls, setPostUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(IG_POSTS_KEY);
      setPostUrls(stored ? JSON.parse(stored) : []);
    } catch {
      setPostUrls([]);
    }
  }, []);

  const persist = (urls: string[]) => {
    setPostUrls(urls);
    try {
      localStorage.setItem(IG_POSTS_KEY, JSON.stringify(urls));
    } catch {
      // quota exceeded — ignore
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addPost = () => {
    const url = newUrl.trim();
    if (!url) return;
    const igRegex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/?/;
    if (!igRegex.test(url)) {
      setError("Paste a link to an Instagram post, reel, or IGTV video");
      return;
    }
    if (postUrls.includes(url)) {
      setError("Post already added");
      return;
    }
    setError("");
    setNewUrl("");
    persist([...postUrls, url]);
  };

  const removePost = (url: string) => {
    persist(postUrls.filter((u) => u !== url));
    try {
      localStorage.removeItem("sunoflow_ig_cache");
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") addPost();
  };

  // Extract short ID from URL for display
  const shortId = (url: string) => {
    const match = url.match(/\/(p|reel|tv)\/([\w-]+)/);
    return match ? `/${match[1]}/${match[2]}` : url;
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Instagram Posts</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Paste Instagram post URLs to build a visual mood board on the Inspire page.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => {
            setNewUrl(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://instagram.com/p/ABC123..."
          className={`flex-1 bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
            error ? "border-red-500" : "border-gray-300 dark:border-gray-700"
          }`}
        />
        <button
          onClick={addPost}
          className="flex items-center gap-1 px-3 py-2 bg-pink-600 hover:bg-pink-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add
        </button>
      </div>

      <FieldError error={error} />
      {saved && <p className="text-xs text-green-400">Saved!</p>}

      {postUrls.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No Instagram posts added yet.</p>
      ) : (
        <ul className="space-y-2">
          {postUrls.map((url) => (
            <li
              key={url}
              className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2"
            >
              <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">
                {shortId(url)}
              </span>
              <button
                onClick={() => removePost(url)}
                className="text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Remove post"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const EMAIL_NOTIF_TYPES = [
  { key: "emailWelcome", label: "Welcome & tips", description: "Onboarding emails and feature announcements" },
  { key: "emailGenerationComplete", label: "Generation complete", description: "Email me when a song finishes generating (opt-in)" },
  { key: "emailWeeklyHighlights", label: "Weekly highlights", description: "A weekly digest of your top songs and activity" },
];

function EmailNotificationsSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch("/api/profile/email-preferences")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setPrefs(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = async (key: string) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: updated[key] }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error ?? "Failed to update preference", "error");
        setPrefs(prefs); // revert
      }
    } catch {
      showToast("Network error", "error");
      setPrefs(prefs); // revert
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Email Notifications</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Choose which emails you want to receive. All emails include a one-click unsubscribe link.</p>
        </div>
        <div className="space-y-2">
          {EMAIL_NOTIF_TYPES.map(({ key, label, description }) => (
            <label
              key={key}
              className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={prefs[key] === true}
                onChange={() => !saving && toggle(key)}
                disabled={saving}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 dark:bg-gray-800"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{description}</span>
              </div>
              <BellIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            </label>
          ))}
        </div>
      </section>
    </>
  );
}

const NOTIF_PREFS_KEY = "sunoflow_notif_prefs";
const NOTIFICATION_TYPES = [
  { key: "generation_complete", label: "Generation complete", description: "When a song finishes generating" },
  { key: "generation_failed", label: "Generation failed", description: "When a generation encounters an error" },
  { key: "rate_limit_reset", label: "Rate limit reset", description: "When your rate limit resets" },
  { key: "announcement", label: "Announcements", description: "Product updates and news" },
];

function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIF_PREFS_KEY);
      if (stored) {
        setPrefs(JSON.parse(stored));
      } else {
        // Default: all enabled
        const defaults: Record<string, boolean> = {};
        NOTIFICATION_TYPES.forEach((t) => { defaults[t.key] = true; });
        setPrefs(defaults);
      }
    } catch {
      const defaults: Record<string, boolean> = {};
      NOTIFICATION_TYPES.forEach((t) => { defaults[t.key] = true; });
      setPrefs(defaults);
    }
    setLoaded(true);
  }, []);

  const toggle = (key: string) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));
    } catch {
      // quota exceeded
    }
  };

  if (!loaded) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Notifications</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Choose which notifications you want to receive.</p>
      </div>
      <div className="space-y-2">
        {NOTIFICATION_TYPES.map(({ key, label, description }) => (
          <label
            key={key}
            className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <input
              type="checkbox"
              checked={prefs[key] !== false}
              onChange={() => toggle(key)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 dark:bg-gray-800"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{description}</span>
            </div>
            <BellIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          </label>
        ))}
      </div>
    </section>
  );
}

const PLAYBACK_PREFS_KEY = "sunoflow_playback_prefs";

function PlaybackDefaultsSection() {
  const [autoplay, setAutoplay] = useState(true);
  const [quality, setQuality] = useState<"high" | "standard">("high");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PLAYBACK_PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setAutoplay(parsed.autoplay ?? true);
        setQuality(parsed.quality ?? "high");
      }
    } catch {
      // use defaults
    }
    setLoaded(true);
  }, []);

  const persist = (updates: { autoplay?: boolean; quality?: string }) => {
    const next = { autoplay, quality, ...updates };
    if (updates.autoplay !== undefined) setAutoplay(updates.autoplay);
    if (updates.quality !== undefined) setQuality(updates.quality as "high" | "standard");
    try {
      localStorage.setItem(PLAYBACK_PREFS_KEY, JSON.stringify(next));
    } catch {
      // quota exceeded
    }
  };

  if (!loaded) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Playback</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configure default playback behavior.</p>
      </div>

      <label className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <div className="flex items-center gap-3">
          <SpeakerWaveIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Autoplay</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">Automatically play the next song in queue</span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoplay}
          onClick={() => persist({ autoplay: !autoplay })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            autoplay ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              autoplay ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </label>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3">
        <div className="flex items-center gap-3 mb-2">
          <SpeakerWaveIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Default Quality</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">Audio quality for playback and downloads</span>
          </div>
        </div>
        <div className="flex gap-2 ml-7">
          {(["high", "standard"] as const).map((q) => (
            <button
              key={q}
              onClick={() => persist({ quality: q })}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] border ${
                quality === q
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {q.charAt(0).toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentSkillSection() {
  const [copied, setCopied] = useState(false);

  const installCommand = "claude skill add --url /api/agent-skill";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  };

  const handleDownload = () => {
    window.location.href = "/api/agent-skill";
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <CommandLineIcon className="w-5 h-5 text-violet-500" />
          Connect Your Agent
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Let AI agents (like Claude Code) manage your music library, generate songs, and organize playlists using the SunoFlow API.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-3 border border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">1. Download the Claude Code skill file</p>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Download Claude Skill
          </button>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">2. Or install directly via CLI</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900 dark:bg-gray-950 text-green-400 text-xs px-3 py-2.5 rounded-lg font-mono overflow-x-auto">
              {installCommand}
            </code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-2.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-4 h-4 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Make sure you have an API key created above. See the{" "}
          <a
            href="https://docs.anthropic.com/en/docs/claude-code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-600 dark:text-violet-400 hover:underline"
          >
            Claude Code docs
          </a>{" "}
          for setup help.
        </p>
      </div>
    </section>
  );
}

function RateLimitSection() {
  const [data, setData] = useState<{
    remaining: number;
    limit: number;
    used: number;
    percentUsed: number;
    resetAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rate-limit/status")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="space-y-3">
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
      </section>
    );
  }

  if (!data) return null;

  const resetDate = data.resetAt ? new Date(data.resetAt) : null;
  const barColor = data.percentUsed >= 90 ? "bg-red-500" : data.percentUsed >= 70 ? "bg-yellow-500" : "bg-violet-500";

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Rate Limits</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Your current API usage and limits.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Generations</span>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {data.used} / {data.limit}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(data.percentUsed, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{data.remaining} remaining</span>
          {resetDate && (
            <span>Resets {resetDate.toLocaleDateString()} {resetDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>

        {data.percentUsed >= 90 && (
          <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
            <span>You&apos;re running low on generations. Consider waiting for the reset.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function DeleteAccountSection() {
  const { data: session } = useSession();
  const [showForm, setShowForm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!password) errs.password = "Password is required";
    if (!confirmEmail) errs.confirmEmail = "Please confirm your email";
    else if (confirmEmail !== session?.user?.email) errs.confirmEmail = "Email does not match your account";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to delete account", "error");
      } else {
        // Redirect to home after deletion
        window.location.href = "/";
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-red-600 dark:text-red-400">Delete Account</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
        </div>

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
          >
            Delete my account
          </button>
        ) : (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300 font-medium">
              <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
              This will permanently delete all your songs, playlists, and data.
            </div>
            <form onSubmit={handleDelete} className="space-y-2">
              <div>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => { setConfirmEmail(e.target.value); setErrors((p) => ({ ...p, confirmEmail: "" })); }}
                  placeholder="Type your email to confirm"
                  autoComplete="off"
                  className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                    errors.confirmEmail ? "border-red-500" : "border-gray-300 dark:border-gray-700"
                  }`}
                />
                <FieldError error={errors.confirmEmail} />
              </div>
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: "" })); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={`w-full bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                    errors.password ? "border-red-500" : "border-gray-300 dark:border-gray-700"
                  }`}
                />
                <FieldError error={errors.password} />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={deleting}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {deleting ? "Deleting..." : "Permanently delete account"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setPassword(""); setConfirmEmail(""); setErrors({}); }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </>
  );
}

interface TagItem {
  id: string;
  name: string;
  color: string;
  _count: { songTags: number };
}

function TagManagementSection() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => { if (data.tags) setTags(data.tags); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(tag: TagItem) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  async function saveEdit(tagId: string) {
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error ?? "Failed to update tag", "error");
        return;
      }
      const data = await res.json();
      setTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, name: data.tag.name, color: data.tag.color } : t)));
      setEditingId(null);
      showToast("Tag updated", "success");
    } catch {
      showToast("Network error", "error");
    }
  }

  async function deleteTag(tagId: string) {
    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Failed to delete tag", "error");
        return;
      }
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      setDeleteConfirm(null);
      showToast("Tag deleted", "success");
    } catch {
      showToast("Network error", "error");
    }
  }

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Tags</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage your song tags. Rename, recolor, or delete tags here.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No tags yet. Add tags from any song detail page.</p>
        ) : (
          <ul className="space-y-2">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2"
              >
                {editingId === tag.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-6 h-6 rounded border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(tag.id); if (e.key === "Escape") setEditingId(null); }}
                      className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                      autoFocus
                    />
                    <button onClick={() => saveEdit(tag.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-green-500 hover:text-green-400" aria-label="Save">
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Cancel">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 text-sm text-gray-900 dark:text-white">{tag.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{tag._count.songTags} song{tag._count.songTags !== 1 ? "s" : ""}</span>
                    <button onClick={() => startEdit(tag)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-violet-400 transition-colors" aria-label="Edit tag">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    {deleteConfirm === tag.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteTag(tag.id)} className="text-xs text-red-500 hover:text-red-400 min-h-[44px] px-2">Delete</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 min-h-[44px] px-2">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(tag.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors" aria-label="Delete tag">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

type SunoStatus =
  | { connected: false; error?: string }
  | { connected: true; credits: { remaining: number }; validatedAt: string };

function ApiKeySection() {
  const [apiKey, setApiKey] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [usePersonalApiKey, setUsePersonalApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingPersonal, setTogglingPersonal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [status, setStatus] = useState<SunoStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const checkStatus = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/suno/status");
      const data = await res.json();
      setStatus(data as SunoStatus);
    } catch {
      setStatus({ connected: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    fetch("/api/profile/api-key")
      .then((r) => r.json())
      .then((data) => {
        setHasKey(data.hasKey);
        setMaskedKey(data.maskedKey);
        setUsePersonalApiKey(data.usePersonalApiKey ?? false);
        if (data.hasKey) {
          checkStatus();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sunoApiKey: apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to save API key", "error");
      } else {
        setHasKey(data.hasKey);
        setMaskedKey(data.maskedKey);
        setApiKey("");
        showToast(data.hasKey ? "API key saved" : "API key removed", "success");
        if (data.hasKey) {
          checkStatus();
        } else {
          setStatus(null);
        }
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sunoApiKey: "", usePersonalApiKey: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to remove API key", "error");
      } else {
        setHasKey(false);
        setMaskedKey(null);
        setApiKey("");
        setStatus(null);
        setUsePersonalApiKey(false);
        showToast("API key removed", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePersonalKey = async (enabled: boolean) => {
    if (enabled && !hasKey) {
      showToast("Enter and save your API key first", "error");
      return;
    }
    setTogglingPersonal(true);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usePersonalApiKey: enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to update setting", "error");
      } else {
        setUsePersonalApiKey(data.usePersonalApiKey);
        showToast(data.usePersonalApiKey ? "Using personal API key" : "Using shared app key", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setTogglingPersonal(false);
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Suno API Key</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Set your personal <a href="https://sunoapi.org" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline">sunoapi.org</a> API key for music generation. Overrides the server default.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <>
            {hasKey && maskedKey && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                <KeyIcon className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-300 font-mono">{maskedKey}</span>
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="ml-auto text-xs text-red-500 hover:text-red-400 disabled:opacity-50 min-h-[44px] px-2"
                >
                  Remove
                </button>
              </div>
            )}

            {hasKey && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {testing ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                  ) : status?.connected ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  ) : (
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {testing ? "Checking..." : status?.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                {status?.connected && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Credits remaining: {status.credits.remaining}
                  </span>
                )}
                <button
                  onClick={checkStatus}
                  disabled={testing}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowPathIcon className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
                  Test Connection
                </button>
              </div>
            )}

            {hasKey && status && !status.connected && (
              <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">
                  {status.error === "Invalid API key"
                    ? "Your API key appears to be invalid. Please update it."
                    : (status.error ?? "Could not verify connection.")}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "Enter new key to replace" : "Paste your API key"}
                autoComplete="off"
                className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                onClick={handleSave}
                disabled={saving || !apiKey.trim()}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${hasKey ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-60"}`}>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Use personal API key</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {usePersonalApiKey && hasKey
                    ? "Using your personal API key — app rate limits and credits do not apply."
                    : "When enabled, uses your key instead of the shared app key."}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={usePersonalApiKey}
                onClick={() => handleTogglePersonalKey(!usePersonalApiKey)}
                disabled={togglingPersonal || (!hasKey && !usePersonalApiKey)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${usePersonalApiKey && hasKey ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${usePersonalApiKey && hasKey ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            {usePersonalApiKey && hasKey && (
              <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2">
                <KeyIcon className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  Using your personal Suno API key. App rate limits and credits do not apply.
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function PersonalApiKeysSection() {
  const [keys, setKeys] = useState<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchKeys = useCallback(() => {
    fetch("/api/profile/api-keys")
      .then((r) => r.json())
      .then((data) => setKeys(data.keys ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/profile/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to create API key", "error");
      } else {
        setCreatedKey(data.key);
        setCopied(false);
        setNewKeyName("");
        fetchKeys();
        showToast("API key created", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      const res = await fetch(`/api/profile/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to revoke key", "error");
      } else {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setConfirmRevoke(null);
        showToast("API key revoked", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Personal API Keys</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage API keys for programmatic access to your SunoFlow account. Max 5 active keys.
          </p>
        </div>

        {/* Created key banner — shown once after creation */}
        {createdKey && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Copy this key now. You won&apos;t be able to see it again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-white break-all select-all">
                {createdKey}
              </code>
              <button
                onClick={() => handleCopy(createdKey)}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <>
            {/* Key list */}
            {keys.length > 0 && (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                  >
                    <KeyIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{k.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{k.prefix}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-xs text-gray-400 dark:text-gray-500">Used: {formatDate(k.lastUsedAt)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Created: {formatDate(k.createdAt)}</p>
                    </div>
                    {confirmRevoke === k.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          className="px-2 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors min-h-[44px]"
                        >
                          {revoking === k.id ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmRevoke(null)}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(k.id)}
                        className="text-red-500 hover:text-red-400 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
                        title="Revoke key"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Create form */}
            {keys.length < 5 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newKeyName.trim()) handleCreate(); }}
                  placeholder="Key name (e.g. CI/CD, Mobile app)"
                  maxLength={64}
                  className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newKeyName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  <PlusIcon className="w-4 h-4" />
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            )}

            {keys.length === 0 && !createdKey && (
              <p className="text-xs text-gray-400 dark:text-gray-500">No API keys yet. Create one to get started.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function OnboardingSection() {
  const { restartTour } = useOnboarding();
  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    await restartTour();
    setRestarting(false);
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Onboarding</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Replay the getting-started walkthrough.</p>
      </div>
      <button
        onClick={handleRestart}
        disabled={restarting}
        className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
      >
        <ArrowPathIcon className="w-4 h-4" />
        {restarting ? "Restarting..." : "Restart tour"}
      </button>
    </section>
  );
}

function ExportDataSection() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleExport = async (format: string, type: string, label: string) => {
    setExporting(label);
    try {
      const res = await fetch(`/api/export?format=${format}&type=${type}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        showToast(data.error ?? "Export failed", "error");
        return;
      }

      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] ?? `sunoflow-export.${format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Export downloaded", "success");
    } catch {
      showToast("Network error", "error");
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Export Data</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Download your data for backup or portability. Exports include metadata only — no audio files.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleExport("json", "all", "json-all")}
            disabled={exporting !== null}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-5 h-5 text-violet-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Export all as JSON</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Songs, playlists, tags, and ratings</span>
            </div>
            {exporting === "json-all" && <span className="text-xs text-violet-500 animate-pulse">Exporting...</span>}
          </button>

          <button
            onClick={() => handleExport("csv", "songs", "csv-songs")}
            disabled={exporting !== null}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Export songs as CSV</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Spreadsheet-friendly format (RFC 4180)</span>
            </div>
            {exporting === "csv-songs" && <span className="text-xs text-violet-500 animate-pulse">Exporting...</span>}
          </button>

          <button
            onClick={() => handleExport("json", "playlists", "json-playlists")}
            disabled={exporting !== null}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Export playlists as JSON</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Playlist names and song references</span>
            </div>
            {exporting === "json-playlists" && <span className="text-xs text-violet-500 animate-pulse">Exporting...</span>}
          </button>
        </div>
      </section>
    </>
  );
}

// ─── Connected Accounts Section ───

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  credentials: "Email & Password",
};

function ConnectedAccountsSection() {
  const [providers, setProviders] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.connectedProviders)) {
          setProviders(data.connectedProviders.filter((p: string) => p !== "credentials"));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Connected Accounts</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Auth providers linked to your account.</p>
      </div>
      {providers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No OAuth providers connected.</p>
      ) : (
        <ul className="space-y-2">
          {providers.map((provider) => (
            <li
              key={provider}
              className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                {PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1)}
              </span>
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Connected</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Subscription Summary Section ───

interface SubscriptionInfo {
  tier: string;
  status: string;
  creditsRemaining: number;
  budget: number;
}

function SubscriptionSummarySection() {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/subscription").then((r) => r.json()),
      fetch("/api/credits").then((r) => r.json()),
    ])
      .then(([sub, credits]) => {
        setInfo({
          tier: sub.tier ?? "free",
          status: sub.status ?? "active",
          creditsRemaining: credits.creditsRemaining ?? 0,
          budget: credits.budget ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return (
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Subscription</h3>
        <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
      </section>
    );
  }

  if (!info) return null;

  const tierLabel = info.tier.charAt(0).toUpperCase() + info.tier.slice(1);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Subscription</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Your current plan and credit balance.</p>
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Plan</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{tierLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Credits remaining</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {info.creditsRemaining} / {info.budget}
          </span>
        </div>
        {info.budget > 0 && (
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full"
              style={{ width: `${Math.min(100, (info.creditsRemaining / info.budget) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <Link
        href="/settings/billing"
        className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
      >
        Manage billing &amp; subscription
      </Link>
    </section>
  );
}

// ─── Main Settings Page ───

const tabs: { key: Tab; label: string; icon: typeof UserCircleIcon }[] = [
  { key: "profile", label: "Profile", icon: UserCircleIcon },
  { key: "preferences", label: "Preferences", icon: Cog6ToothIcon },
  { key: "account", label: "Account", icon: ShieldCheckIcon },
];

function SettingsContent() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  return (
    <div className="px-4 py-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>

      {/* Tab navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors min-h-[44px] ${
              activeTab === key
                ? "border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "preferences" && <PreferencesTab />}
        {activeTab === "account" && <AccountTab />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}
