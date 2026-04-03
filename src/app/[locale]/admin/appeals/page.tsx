"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

interface Appeal {
  id: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  song: {
    id: string;
    title: string | null;
    isHidden: boolean;
    reports: { reason: string; adminNote: string | null }[];
  };
  user: { id: string; name: string | null; email: string | null };
}

type StatusFilter = "pending" | "approved" | "rejected" | "all";

export default function AdminAppealsPage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [resolving, setResolving] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  const fetchAppeals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    const res = await fetch(`/api/admin/appeals?${params}`);
    const data = await res.json();
    setAppeals(data.appeals ?? []);
    setTotalPages(data.totalPages ?? 1);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [status, page]);

  useEffect(() => {
    fetchAppeals();
  }, [fetchAppeals]);

  const handleResolve = async (appealId: string, action: "approve" | "reject") => {
    setResolving(appealId);
    const res = await fetch(`/api/admin/appeals/${appealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote: noteInputs[appealId] || "" }),
    });
    if (res.ok) {
      await fetchAppeals();
    }
    setResolving(null);
  };

  const filters: { label: string; value: StatusFilter }[] = [
    { label: "Pending", value: "pending" },
    { label: "Approved", value: "approved" },
    { label: "Rejected", value: "rejected" },
    { label: "All", value: "all" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Appeals</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatus(f.value); setPage(1); }}
            className={`text-sm px-4 py-2 rounded-lg transition-colors ${
              status === f.value
                ? "bg-red-900/30 text-red-400"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">Loading…</div>
      ) : appeals.length === 0 ? (
        <div className="text-gray-500 text-sm py-8 text-center">No appeals found.</div>
      ) : (
        <div className="space-y-4">
          {appeals.map((appeal) => (
            <div key={appeal.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white truncate">
                    {appeal.song.title ?? "Untitled"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    By {appeal.user.name ?? "Unknown"} ({appeal.user.email})
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                    appeal.status === "pending"
                      ? "bg-yellow-900/30 text-yellow-400"
                      : appeal.status === "approved"
                      ? "bg-green-900/30 text-green-400"
                      : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {appeal.status}
                </span>
              </div>

              {/* Original flag reason */}
              {appeal.song.reports.length > 0 && (
                <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-300">Original flag: </span>
                  {appeal.song.reports[0].reason}
                  {appeal.song.reports[0].adminNote && (
                    <span className="ml-1 text-gray-500">— {appeal.song.reports[0].adminNote}</span>
                  )}
                </div>
              )}

              {/* Appeal reason */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Appeal reason</p>
                <p className="text-sm text-gray-300 whitespace-pre-line">{appeal.reason}</p>
              </div>

              {/* Admin note (resolved) */}
              {appeal.adminNote && (
                <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-300">Admin note: </span>
                  {appeal.adminNote}
                </div>
              )}

              {/* Actions (only for pending) */}
              {appeal.status === "pending" && (
                <div className="space-y-2 pt-1">
                  <textarea
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 text-gray-200 p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                    rows={2}
                    placeholder="Admin note (optional, sent to user on rejection)…"
                    value={noteInputs[appeal.id] ?? ""}
                    onChange={(e) =>
                      setNoteInputs((prev) => ({ ...prev, [appeal.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolve(appeal.id, "approve")}
                      disabled={resolving === appeal.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-800 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                      <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
                      Approve & restore
                    </button>
                    <button
                      onClick={() => handleResolve(appeal.id, "reject")}
                      disabled={resolving === appeal.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                    >
                      <XCircleIcon className="w-4 h-4" aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-600">
                Submitted {new Date(appeal.createdAt).toLocaleDateString()}
                {appeal.resolvedAt && ` · Resolved ${new Date(appeal.resolvedAt).toLocaleDateString()}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-sm disabled:opacity-40 hover:text-white transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-sm disabled:opacity-40 hover:text-white transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
