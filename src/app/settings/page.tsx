"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { SessionProvider } from "@/components/SessionProvider";
import { AppShell } from "@/components/AppShell";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

const RSS_FEEDS_KEY = "sunoflow_rss_feeds";

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

function AccountSection() {
  const { data: session, update: updateSession } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (session?.user?.name) {
      setDisplayName(session.user.name);
    }
  }, [session?.user?.name]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleNameSave = async () => {
    if (!displayName.trim()) return;
    setNameLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to update name", "error");
      } else {
        await updateSession({ name: data.name });
        showToast("Display name updated", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setNameLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("All fields are required", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("New password must be at least 8 characters", "error");
      return;
    }
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
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-200">Account</h3>
          <p className="text-xs text-gray-500 mt-0.5">Manage your profile details.</p>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Email</label>
          <input
            type="email"
            value={session?.user?.email ?? ""}
            readOnly
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-gray-400 cursor-not-allowed"
          />
        </div>

        {/* Display name */}
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Display name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <button
              onClick={handleNameSave}
              disabled={nameLoading || !displayName.trim()}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {nameLoading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Change password */}
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-medium text-gray-300">Change password</h4>
          <form onSubmit={handlePasswordChange} className="space-y-2">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              autoComplete="new-password"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {pwLoading ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

function RssFeedsSection() {
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
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-200">RSS Feeds</h3>
        <p className="text-xs text-gray-500 mt-0.5">
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
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
                className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Remove feed"
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

function SettingsContent() {
  return (
    <div className="px-4 py-6 space-y-8">
      <h2 className="text-xl font-bold text-white">Settings</h2>
      <AccountSection />
      <div className="border-t border-gray-800" />
      <RssFeedsSection />
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
