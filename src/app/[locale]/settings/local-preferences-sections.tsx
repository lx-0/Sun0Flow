"use client";

import { useEffect, useState } from "react";
import { BellIcon, PlusIcon, SpeakerWaveIcon, TrashIcon } from "@heroicons/react/24/outline";
import { FieldError } from "./ui";
import { IG_POSTS_KEY, NOTIF_PREFS_KEY, NOTIFICATION_TYPES, PLAYBACK_PREFS_KEY } from "./constants";

export function InstagramPostsSection() {
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
              <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{shortId(url)}</span>
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

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIF_PREFS_KEY);
      if (stored) {
        setPrefs(JSON.parse(stored));
      } else {
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

export function PlaybackDefaultsSection() {
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
