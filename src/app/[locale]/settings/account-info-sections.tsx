"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useOnboarding } from "@/components/OnboardingTour";
import { Toast } from "./ui";

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
      <div className="flex items-center gap-4">
        <Link
          href="/settings/billing"
          className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
        >
          Manage billing &amp; subscription
        </Link>
        {info.tier === "free" && (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
          >
            View plans →
          </Link>
        )}
      </div>
    </section>
  );
}


export { OnboardingSection, ExportDataSection, ConnectedAccountsSection, SubscriptionSummarySection };
