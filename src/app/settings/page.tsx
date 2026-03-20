"use client";

import { useState, useEffect } from "react";
import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

const RSS_FEEDS_KEY = "sunoflow_rss_feeds";

function SettingsContent() {
  const [feedUrls, setFeedUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RSS_FEEDS_KEY);
      setFeedUrls(stored ? JSON.parse(stored) : []);
    } catch {
      setFeedUrls([]);
    }
  }, []);

  const persist = (urls: string[]) => {
    setFeedUrls(urls);
    try {
      localStorage.setItem(RSS_FEEDS_KEY, JSON.stringify(urls));
    } catch {
      // quota exceeded — ignore
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addFeed = () => {
    const url = newUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("URL must start with http:// or https://");
      return;
    }
    if (feedUrls.includes(url)) {
      setError("Feed already added");
      return;
    }
    setError("");
    setNewUrl("");
    persist([...feedUrls, url]);
  };

  const removeFeed = (url: string) => {
    persist(feedUrls.filter((u) => u !== url));
    // Clear cache so /inspire refreshes with the new list
    try {
      localStorage.removeItem("sunoflow_rss_cache");
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") addFeed();
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <h2 className="text-xl font-bold text-white">Settings</h2>

      {/* RSS Feeds section */}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-200">RSS Feeds</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Add RSS feed URLs to see inspiration on the Inspire page.
          </p>
        </div>

        {/* Add new feed */}
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
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <button
            onClick={addFeed}
            className="flex items-center gap-1 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {saved && <p className="text-xs text-green-400">Saved!</p>}

        {/* Feed list */}
        {feedUrls.length === 0 ? (
          <p className="text-sm text-gray-600">No feeds added yet.</p>
        ) : (
          <ul className="space-y-2">
            {feedUrls.map((url) => (
              <li
                key={url}
                className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2"
              >
                <span className="flex-1 text-xs text-gray-300 truncate">{url}</span>
                <button
                  onClick={() => removeFeed(url)}
                  className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                  aria-label="Remove feed"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <SessionProvider>
      <AppShell>
        <SettingsContent />
      </AppShell>
    </SessionProvider>
  );
}
