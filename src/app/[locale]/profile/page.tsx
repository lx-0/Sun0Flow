"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import {
  MusicalNoteIcon,
  HeartIcon,
  QueueListIcon,
  SparklesIcon,
  CalendarDaysIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileStats {
  totalSongs: number;
  totalFavorites: number;
  totalPlaylists: number;
  totalTemplates: number;
  followersCount: number;
  followingCount: number;
  memberSince: string;
  lastLoginAt: string | null;
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MusicalNoteIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <Icon className="w-5 h-5 text-violet-400" />
      <span className="text-lg font-bold text-gray-900 dark:text-white">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

// ─── Profile Header ───────────────────────────────────────────────────────────

function ProfileHeader() {
  const { data: session, update: updateSession } = useSession();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user?.name) {
      setDisplayName(session.user.name);
    }
  }, [session?.user?.name]);

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to update name", "error");
      } else {
        await updateSession({ name: data.name });
        toast("Display name updated", "success");
        setEditing(false);
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDisplayName(session?.user?.name ?? "");
    setEditing(false);
  };

  const initials = (session?.user?.name ?? session?.user?.email ?? "?")
    .charAt(0)
    .toUpperCase();

  return (
    <section className="flex flex-col items-center gap-3 pt-2">
      {/* Avatar */}
      <div className="w-20 h-20 rounded-full bg-violet-600 flex items-center justify-center">
        <span className="text-2xl font-bold text-white">{initials}</span>
      </div>

      {/* Name (inline edit) */}
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
            className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-green-500 hover:text-green-400 disabled:opacity-50"
            aria-label="Save name"
          >
            <CheckIcon className="w-5 h-5" />
          </button>
          <button
            onClick={handleCancel}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Cancel editing"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {session?.user?.name || "No name set"}
          </h2>
          <button
            onClick={() => setEditing(true)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-violet-400 transition-colors"
            aria-label="Edit display name"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Email */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {session?.user?.email}
      </p>
    </section>
  );
}

// ─── Account Stats ────────────────────────────────────────────────────────────

function AccountStats() {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Account Stats
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!stats) return null;

  const memberDate = new Date(stats.memberSince).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
        Account Stats
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={MusicalNoteIcon} label="Songs" value={stats.totalSongs} />
        <StatCard icon={HeartIcon} label="Favorites" value={stats.totalFavorites} />
        <StatCard icon={QueueListIcon} label="Playlists" value={stats.totalPlaylists} />
        <StatCard icon={SparklesIcon} label="Templates" value={stats.totalTemplates} />
      </div>
      <div className="flex justify-center gap-8 pt-1">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.followersCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Followers</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.followingCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Following</p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4" />
          <span>Member since {memberDate}</span>
        </div>
        {stats.lastLoginAt && (
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />
            <span>
              Last login{" "}
              {new Date(stats.lastLoginAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── My Playlists ────────────────────────────────────────────────────────────

interface PlaylistPreview {
  id: string;
  name: string;
  _count: { songs: number };
}

function MyPlaylistsSection() {
  const [playlists, setPlaylists] = useState<PlaylistPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => res.json())
      .then((data) => setPlaylists(data.playlists ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          My Playlists
        </h3>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          My Playlists
        </h3>
        <Link
          href="/playlists"
          className="text-xs text-violet-500 hover:text-violet-400 transition-colors"
        >
          View all
        </Link>
      </div>
      {playlists.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
          <QueueListIcon className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No playlists yet.
          </p>
          <Link
            href="/playlists"
            className="inline-block mt-2 text-sm text-violet-500 hover:text-violet-400 transition-colors"
          >
            Create one
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {playlists.slice(0, 5).map((pl) => (
            <li key={pl.id}>
              <Link
                href={`/playlists/${pl.id}`}
                className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
              >
                <QueueListIcon className="w-5 h-5 text-violet-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">
                  {pl.name}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {pl._count.songs} song{pl._count.songs !== 1 ? "s" : ""}
                </span>
              </Link>
            </li>
          ))}
          {playlists.length > 5 && (
            <li className="text-center">
              <Link
                href="/playlists"
                className="text-xs text-violet-500 hover:text-violet-400 transition-colors"
              >
                +{playlists.length - 5} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast("All fields are required", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }
    if (newPassword.length < 8) {
      toast("New password must be at least 8 characters", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to change password", "error");
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast("Password changed successfully", "success");
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Change Password
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Update your account password.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 chars)"
          autoComplete="new-password"
          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          autoComplete="new-password"
          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}

// ─── Delete Account ───────────────────────────────────────────────────────────

function DeleteAccountSection() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!password) {
      toast("Password is required", "error");
      return;
    }
    if (confirmEmail !== session?.user?.email) {
      toast("Email does not match your account", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to delete account", "error");
      } else {
        toast("Account deleted", "success");
        signOut({ callbackUrl: "/login" });
      }
    } catch {
      toast("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-red-600 dark:text-red-400">
          Delete Account
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>
      </div>

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              This will permanently delete your account, songs, playlists, and
              templates. Type your email to confirm.
            </p>
          </div>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={session?.user?.email ?? "Type your email"}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowConfirm(false);
                setConfirmEmail("");
                setPassword("");
              }}
              className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={
                loading ||
                !password ||
                confirmEmail !== session?.user?.email
              }
              className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Deleting…" : "Permanently delete"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Profile Content ──────────────────────────────────────────────────────────

function ProfileContent() {
  return (
    <div className="px-4 py-6 space-y-8">
      <ProfileHeader />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <AccountStats />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <MyPlaylistsSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <ChangePasswordSection />
      <div className="border-t border-gray-200 dark:border-gray-800" />
      <DeleteAccountSection />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  );
}
