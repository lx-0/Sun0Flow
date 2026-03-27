"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ChatBubbleLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ClockIcon } from "@heroicons/react/24/solid";

interface CommentUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface Comment {
  id: string;
  body: string;
  timestamp: number | null;
  createdAt: string;
  user: CommentUser;
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

function fmtTimestamp(s: number): string {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function Avatar({ user }: { user: CommentUser }) {
  const initials = (user.name ?? "?").charAt(0).toUpperCase();
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? "User"}
        width={32}
        height={32}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-white">{initials}</span>
    </div>
  );
}

export function CommentsSection({
  songId,
  songOwnerId,
  currentTime,
  duration,
  onSeek,
}: {
  songId: string;
  songOwnerId?: string;
  currentTime?: number;
  duration?: number;
  onSeek?: (seconds: number) => void;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async (page: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/songs/${songId}/comments?page=${page}`);
      if (!res.ok) return;
      const data = await res.json();
      setComments((prev) => append ? [...prev, ...data.comments] : data.comments);
      setPagination(data.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [songId]);

  useEffect(() => {
    fetchComments(1);
  }, [fetchComments]);

  // Capture current playback position as the pending timestamp
  function captureTimestamp() {
    if (currentTime !== undefined && currentTime > 0) {
      setPendingTimestamp(currentTime);
    }
  }

  function clearTimestamp() {
    setPendingTimestamp(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, timestamp: pendingTimestamp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to post comment");
      } else {
        setComments((prev) => {
          // Insert comment in sorted position (by timestamp, then date)
          const next = [data, ...prev];
          return next.sort((a, b) => {
            if (a.timestamp !== null && b.timestamp !== null) return a.timestamp - b.timestamp;
            if (a.timestamp !== null) return -1;
            if (b.timestamp !== null) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
        setPagination((prev) => prev ? { ...prev, total: prev.total + 1 } : prev);
        setDraft("");
        setPendingTimestamp(null);
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(`/api/songs/${songId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setPagination((prev) => prev ? { ...prev, total: Math.max(0, prev.total - 1) } : prev);
      }
    } catch {
      // ignore
    }
  };

  const canAttachTimestamp = currentTime !== undefined && duration !== undefined && duration > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ChatBubbleLeftIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Comments{pagination ? ` (${pagination.total})` : ""}
        </h2>
      </div>

      {/* Post comment */}
      {session?.user ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            maxLength={500}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {pendingTimestamp !== null ? (
                <span className="flex items-center gap-1 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                  <ClockIcon className="w-3 h-3" />
                  {fmtTimestamp(pendingTimestamp)}
                  <button
                    type="button"
                    onClick={clearTimestamp}
                    className="ml-0.5 text-violet-400 hover:text-violet-600 dark:hover:text-violet-200"
                    aria-label="Remove timestamp"
                  >
                    ×
                  </button>
                </span>
              ) : canAttachTimestamp ? (
                <button
                  type="button"
                  onClick={captureTimestamp}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
                >
                  <ClockIcon className="w-3 h-3" />
                  {currentTime! > 0 ? `@ ${fmtTimestamp(currentTime!)}` : "Attach timestamp"}
                </button>
              ) : null}
              <span className="text-xs text-gray-400 dark:text-gray-600">{draft.length}/500</span>
            </div>
            {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <Link href="/login" className="text-violet-500 hover:underline">Sign in</Link> to leave a comment.
        </p>
      )}

      {/* Comment list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No comments yet. Be the first!</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 group">
              <Avatar user={comment.user} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {comment.user.name ?? "Anonymous"}
                  </span>
                  {comment.timestamp !== null && (
                    <button
                      type="button"
                      onClick={() => onSeek?.(comment.timestamp!)}
                      className="flex items-center gap-0.5 text-xs text-violet-500 hover:text-violet-400 font-medium transition-colors"
                      title="Jump to this moment"
                    >
                      <ClockIcon className="w-3 h-3" />
                      {fmtTimestamp(comment.timestamp)}
                    </button>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 break-words">
                  {comment.body}
                </p>
              </div>
              {(session?.user?.id === comment.user.id || session?.user?.id === songOwnerId) && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 flex-shrink-0 self-start mt-0.5"
                  aria-label="Delete comment"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Load more */}
      {pagination?.hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchComments(pagination.page + 1, true)}
            disabled={loadingMore}
            className="text-xs text-violet-500 hover:text-violet-400 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more comments"}
          </button>
        </div>
      )}
    </div>
  );
}
