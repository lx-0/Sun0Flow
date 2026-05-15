"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Toast } from "./ui";

type SunoStatus =
  | { connected: false; error?: string }
  | { connected: true; credits: { remaining: number }; validatedAt: string };

function ApiKeySection() {
  const [apiKey, setApiKey] = useState("");
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [usePersonalApiKey, setUsePersonalApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingPersonal, setTogglingPersonal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [status, setStatus] = useState<SunoStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const checkStatus = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/suno/status");
      const data = await res.json();
      setStatus(data as SunoStatus);
    } catch {
      setStatus({ connected: false, error: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    fetch("/api/profile/api-key")
      .then((r) => r.json())
      .then((data) => {
        setHasKey(data.hasKey);
        setMaskedKey(data.maskedKey);
        setUsePersonalApiKey(data.usePersonalApiKey ?? false);
        if (data.hasKey) {
          checkStatus();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sunoApiKey: apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to save API key", "error");
      } else {
        setHasKey(data.hasKey);
        setMaskedKey(data.maskedKey);
        setApiKey("");
        showToast(data.hasKey ? "API key saved" : "API key removed", "success");
        if (data.hasKey) {
          checkStatus();
        } else {
          setStatus(null);
        }
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sunoApiKey: "", usePersonalApiKey: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to remove API key", "error");
      } else {
        setHasKey(false);
        setMaskedKey(null);
        setApiKey("");
        setStatus(null);
        setUsePersonalApiKey(false);
        showToast("API key removed", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePersonalKey = async (enabled: boolean) => {
    if (enabled && !hasKey) {
      showToast("Enter and save your API key first", "error");
      return;
    }
    setTogglingPersonal(true);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usePersonalApiKey: enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to update setting", "error");
      } else {
        setUsePersonalApiKey(data.usePersonalApiKey);
        showToast(data.usePersonalApiKey ? "Using personal API key" : "Using shared app key", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setTogglingPersonal(false);
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Suno API Key</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Set your personal <a href="https://sunoapi.org" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline">sunoapi.org</a> API key for music generation. Overrides the server default.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <>
            {hasKey && maskedKey && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                <KeyIcon className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-300 font-mono">{maskedKey}</span>
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="ml-auto text-xs text-red-500 hover:text-red-400 disabled:opacity-50 min-h-[44px] px-2"
                >
                  Remove
                </button>
              </div>
            )}

            {hasKey && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {testing ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                  ) : status?.connected ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  ) : (
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {testing ? "Checking..." : status?.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                {status?.connected && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Credits remaining: {status.credits.remaining}
                  </span>
                )}
                <button
                  onClick={checkStatus}
                  disabled={testing}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowPathIcon className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
                  Test Connection
                </button>
              </div>
            )}

            {hasKey && status && !status.connected && (
              <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
                <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">
                  {status.error === "Invalid API key"
                    ? "Your API key appears to be invalid. Please update it."
                    : (status.error ?? "Could not verify connection.")}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "Enter new key to replace" : "Paste your API key"}
                autoComplete="off"
                className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <button
                onClick={handleSave}
                disabled={saving || !apiKey.trim()}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${hasKey ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-60"}`}>
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Use personal API key</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {usePersonalApiKey && hasKey
                    ? "Using your personal API key — app rate limits and credits do not apply."
                    : "When enabled, uses your key instead of the shared app key."}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={usePersonalApiKey}
                onClick={() => handleTogglePersonalKey(!usePersonalApiKey)}
                disabled={togglingPersonal || (!hasKey && !usePersonalApiKey)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${usePersonalApiKey && hasKey ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${usePersonalApiKey && hasKey ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            {usePersonalApiKey && hasKey && (
              <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2">
                <KeyIcon className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  Using your personal Suno API key. App rate limits and credits do not apply.
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function PersonalApiKeysSection() {
  const [keys, setKeys] = useState<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchKeys = useCallback(() => {
    fetch("/api/profile/api-keys")
      .then((r) => r.json())
      .then((data) => setKeys(data.keys ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    const name = newKeyName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/profile/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to create API key", "error");
      } else {
        setCreatedKey(data.key);
        setCopied(false);
        setNewKeyName("");
        fetchKeys();
        showToast("API key created", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      const res = await fetch(`/api/profile/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to revoke key", "error");
      } else {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setConfirmRevoke(null);
        showToast("API key revoked", "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Failed to copy", "error");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Personal API Keys</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage API keys for programmatic access to your SunoFlow account. Max 5 active keys.
          </p>
        </div>

        {/* Created key banner — shown once after creation */}
        {createdKey && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Copy this key now. You won&apos;t be able to see it again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-900 dark:text-white break-all select-all">
                {createdKey}
              </code>
              <button
                onClick={() => handleCopy(createdKey)}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : (
          <>
            {/* Key list */}
            {keys.length > 0 && (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                  >
                    <KeyIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{k.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{k.prefix}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-xs text-gray-400 dark:text-gray-500">Used: {formatDate(k.lastUsedAt)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Created: {formatDate(k.createdAt)}</p>
                    </div>
                    {confirmRevoke === k.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          className="px-2 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors min-h-[44px]"
                        >
                          {revoking === k.id ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmRevoke(null)}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 min-h-[44px]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(k.id)}
                        className="text-red-500 hover:text-red-400 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
                        title="Revoke key"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Create form */}
            {keys.length < 5 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newKeyName.trim()) handleCreate(); }}
                  placeholder="Key name (e.g. CI/CD, Mobile app)"
                  maxLength={64}
                  className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newKeyName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                >
                  <PlusIcon className="w-4 h-4" />
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            )}

            {keys.length === 0 && !createdKey && (
              <p className="text-xs text-gray-400 dark:text-gray-500">No API keys yet. Create one to get started.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}


export { ApiKeySection, PersonalApiKeysSection };
