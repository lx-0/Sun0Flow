"use client";

import { useEffect, useState } from "react";

interface ErrorReportItem {
  id: string;
  message: string;
  stack: string | null;
  url: string;
  userAgent: string | null;
  source: string;
  createdAt: string;
}

interface ErrorsResponse {
  errors: ErrorReportItem[];
  total: number;
  page: number;
  limit: number;
}

const SOURCE_COLORS: Record<string, string> = {
  "error-boundary": "bg-red-900/30 text-red-400",
  "unhandled-error": "bg-orange-900/30 text-orange-400",
  "unhandled-rejection": "bg-yellow-900/30 text-yellow-400",
};

export default function AdminErrorsPage() {
  const [data, setData] = useState<ErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/errors?page=${page}&limit=50`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-red-400">Failed to load error reports</p>;
  }

  const totalPages = Math.ceil(data.total / data.limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Client Errors</h1>
        <span className="text-sm text-gray-400">{data.total} total</span>
      </div>

      {data.errors.length === 0 ? (
        <p className="text-gray-500 text-sm">No client errors reported yet.</p>
      ) : (
        <div className="space-y-2">
          {data.errors.map((err) => (
            <div
              key={err.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${SOURCE_COLORS[err.source] ?? "bg-gray-800 text-gray-400"}`}
                    >
                      {err.source}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(err.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-red-300 truncate">
                    {err.message}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-1">
                    {err.url}
                  </p>
                </div>
                {err.stack && (
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === err.id ? null : err.id)
                    }
                    className="text-xs text-gray-400 hover:text-white shrink-0"
                  >
                    {expandedId === err.id ? "Hide" : "Stack"}
                  </button>
                )}
              </div>
              {expandedId === err.id && err.stack && (
                <pre className="mt-3 p-3 bg-gray-950 rounded text-xs text-gray-400 overflow-x-auto max-h-48 overflow-y-auto">
                  {err.stack}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
