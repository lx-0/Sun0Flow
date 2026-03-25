"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MusicalNoteIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useToast } from "./Toast";

interface InviteInfo {
  id: string;
  status: string;
  expiresAt: string;
  playlist: {
    id: string;
    name: string;
    description: string | null;
    _count: { songs: number };
    user: { name: string | null };
  };
}

export function PlaylistInviteView({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/playlists/invite/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Invalid invite");
        } else {
          setInvite(data.invite);
        }
      } catch {
        setError("Failed to load invite");
      } finally {
        setLoading(false);
      }
    }
    fetchInvite();
  }, [token]);

  async function handleAccept() {
    if (accepting) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/playlists/invite/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to accept invite", "error");
        return;
      }
      toast("You joined the playlist!", "success");
      router.push(`/playlists/${data.playlistId}`);
    } catch {
      toast("Failed to accept invite", "error");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-gray-500">Loading invite…</span>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="px-4 py-12 max-w-md mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <MusicalNoteIcon className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Invite unavailable</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {error ?? "This invite link is invalid or has expired."}
        </p>
        <button
          onClick={() => router.push("/playlists")}
          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Go to playlists
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-12 max-w-md mx-auto space-y-6">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto">
          <UserGroupIcon className="w-8 h-8 text-violet-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          You&apos;ve been invited to collaborate
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {invite.playlist.user.name ?? "Someone"} invited you to add songs to their playlist.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
        <h2 className="font-semibold text-gray-900 dark:text-white">{invite.playlist.name}</h2>
        {invite.playlist.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{invite.playlist.description}</p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {invite.playlist._count.songs} song{invite.playlist._count.songs !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full px-5 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {accepting ? "Joining…" : "Join as collaborator"}
        </button>
        <button
          onClick={() => router.push("/playlists")}
          className="w-full px-5 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors"
        >
          Decline
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Expires {new Date(invite.expiresAt).toLocaleDateString()}
      </p>
    </div>
  );
}
