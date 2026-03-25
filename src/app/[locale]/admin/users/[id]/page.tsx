"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface UserDetail {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isDisabled: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  songCount: number;
  playlistCount: number;
  favoriteCount: number;
}

interface Song {
  id: string;
  title: string | null;
  prompt: string | null;
  generationStatus: string;
  audioUrl: string | null;
  duration: number | null;
  createdAt: string;
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toggling, setToggling] = useState(false);

  const fetchUser = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${id}`);
    if (res.ok) setUser(await res.json());
  }, [id]);

  const fetchHistory = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${id}/history?page=${page}&limit=20`);
    if (res.ok) {
      const data = await res.json();
      setSongs(data.songs);
      setTotalPages(data.totalPages);
    }
  }, [id, page]);

  useEffect(() => {
    Promise.all([fetchUser(), fetchHistory()]).finally(() => setLoading(false));
  }, [fetchUser, fetchHistory]);

  const handleToggle = async () => {
    setToggling(true);
    await fetch(`/api/admin/users/${id}/toggle`, { method: "POST" });
    await fetchUser();
    setToggling(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
      </div>
    );
  }

  if (!user) {
    return <p className="text-red-400">User not found</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm"
      >
        <ArrowLeftIcon className="w-4 h-4" /> Back to Users
      </Link>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {user.name || "Unnamed User"}
              {user.isAdmin && (
                <span className="ml-2 text-xs bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded">
                  Admin
                </span>
              )}
            </h1>
            <p className="text-gray-400 text-sm mt-1">{user.email}</p>
          </div>
          {!user.isAdmin && (
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`text-sm px-4 py-2 rounded-lg transition-colors ${
                user.isDisabled
                  ? "bg-green-900/30 text-green-400 hover:bg-green-900/50"
                  : "bg-red-900/30 text-red-400 hover:bg-red-900/50"
              } disabled:opacity-50`}
            >
              {toggling ? "..." : user.isDisabled ? "Enable Account" : "Disable Account"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
          <div>
            <span className="text-xs text-gray-500">Status</span>
            <p
              className={`font-medium ${
                user.isDisabled ? "text-red-400" : "text-green-400"
              }`}
            >
              {user.isDisabled ? "Disabled" : "Active"}
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Joined</span>
            <p>{new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Last Login</span>
            <p>
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleDateString()
                : "Never"}
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Onboarding</span>
            <p>{user.onboardingCompleted ? "Complete" : "Incomplete"}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-800">
          <div className="text-center">
            <div className="text-2xl font-bold">{user.songCount}</div>
            <div className="text-xs text-gray-500">Songs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{user.playlistCount}</div>
            <div className="text-xs text-gray-500">Playlists</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{user.favoriteCount}</div>
            <div className="text-xs text-gray-500">Favorites</div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Generation History</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Prompt</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {songs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500">
                    No generations yet
                  </td>
                </tr>
              ) : (
                songs.map((song) => (
                  <tr
                    key={song.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3 font-medium">
                      {song.title || "Untitled"}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-400 max-w-xs truncate">
                      {song.prompt || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          song.generationStatus === "ready"
                            ? "bg-green-900/30 text-green-400"
                            : song.generationStatus === "error"
                            ? "bg-red-900/30 text-red-400"
                            : "bg-yellow-900/30 text-yellow-400"
                        }`}
                      >
                        {song.generationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-400">
                      {new Date(song.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
