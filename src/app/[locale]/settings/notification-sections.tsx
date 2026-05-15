"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@heroicons/react/24/outline";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { EMAIL_BOOL_NOTIF_TYPES, DIGEST_FREQUENCY_OPTIONS, HOUR_OPTIONS, PUSH_NOTIF_TYPES } from "./constants";
import { Toast } from "./ui";
import { useAutoDismissToast } from "./use-auto-dismiss-toast";

export function EmailNotificationsSection() {
  const [boolPrefs, setBoolPrefs] = useState<Record<string, boolean>>({});
  const [digestFrequency, setDigestFrequency] = useState<string>("off");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useAutoDismissToast();

  useEffect(() => {
    fetch("/api/profile/email-preferences")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          const { emailDigestFrequency, ...rest } = data;
          setBoolPrefs(rest);
          setDigestFrequency(emailDigestFrequency ?? "off");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = async (key: string) => {
    const updated = { ...boolPrefs, [key]: !boolPrefs[key] };
    setBoolPrefs(updated);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: updated[key] }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error ?? "Failed to update preference", "error");
        setBoolPrefs(boolPrefs);
      }
    } catch {
      showToast("Network error", "error");
      setBoolPrefs(boolPrefs);
    } finally {
      setSaving(false);
    }
  };

  const changeDigestFrequency = async (value: string) => {
    const prev = digestFrequency;
    setDigestFrequency(value);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDigestFrequency: value }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error ?? "Failed to update digest frequency", "error");
        setDigestFrequency(prev);
      }
    } catch {
      showToast("Network error", "error");
      setDigestFrequency(prev);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Email Notifications</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Choose which emails you want to receive. All emails include a one-click unsubscribe link.</p>
        </div>
        <div className="space-y-2">
          {EMAIL_BOOL_NOTIF_TYPES.map(({ key, label, description }) => (
            <label
              key={key}
              className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <input
                type="checkbox"
                checked={boolPrefs[key] === true}
                onChange={() => !saving && toggle(key)}
                disabled={saving}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 dark:bg-gray-800"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{description}</span>
              </div>
              <BellIcon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            </label>
          ))}

          <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Email digest</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">A digest of your top songs and activity</span>
            </div>
            <select
              value={digestFrequency}
              onChange={(e) => !saving && changeDigestFrequency(e.target.value)}
              disabled={saving}
              className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            >
              {DIGEST_FREQUENCY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </>
  );
}

export function QuietHoursSection() {
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState(22);
  const [end, setEnd] = useState(8);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useAutoDismissToast();

  useEffect(() => {
    fetch("/api/profile/email-preferences")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setEnabled(data.quietHoursEnabled ?? false);
          setStart(data.quietHoursStart ?? 22);
          setEnd(data.quietHoursEnd ?? 8);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const patch = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error ?? "Failed to update quiet hours", "error");
        return false;
      }
      return true;
    } catch {
      showToast("Network error", "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    const ok = await patch({ quietHoursEnabled: next });
    if (!ok) setEnabled(!next);
  };

  const changeStart = async (value: number) => {
    const prev = start;
    setStart(value);
    const ok = await patch({ quietHoursStart: value });
    if (!ok) setStart(prev);
  };

  const changeEnd = async (value: number) => {
    const prev = end;
    setEnd(value);
    const ok = await patch({ quietHoursEnd: value });
    if (!ok) setEnd(prev);
  };

  if (!loaded) return null;

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Quiet Hours</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Suppress push notifications during a time window each day.</p>
        </div>

        <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3">
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-white">Enable quiet hours</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">No push notifications during this window</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={toggleEnabled}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3">
            <div className="flex-1 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-700 dark:text-gray-300">From</span>
              <select
                value={start}
                onChange={(e) => !saving && changeStart(Number(e.target.value))}
                disabled={saving}
                className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              >
                {HOUR_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <span className="text-sm text-gray-700 dark:text-gray-300">to</span>
              <select
                value={end}
                onChange={(e) => !saving && changeEnd(Number(e.target.value))}
                disabled={saving}
                className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              >
                {HOUR_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export function PushNotificationsSection() {
  const { state, subscribe, unsubscribe } = usePushSubscription();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useAutoDismissToast();

  useEffect(() => {
    fetch("/api/push/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setPrefs(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = async (key: string) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    try {
      const res = await fetch("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: updated[key] }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error ?? "Failed to update preference", "error");
        setPrefs(prefs);
      }
    } catch {
      showToast("Network error", "error");
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  const handleSubscribeToggle = async () => {
    if (state === "subscribed") {
      const ok = await unsubscribe();
      if (!ok) showToast("Failed to disable push notifications", "error");
    } else {
      const ok = await subscribe();
      if (!ok && state !== "denied") showToast("Failed to enable push notifications", "error");
      if (state === "denied") showToast("Notifications are blocked. Enable them in your browser settings.", "error");
    }
  };

  if (state === "unsupported" || state === "not-configured") return null;

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}
      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Push Notifications</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Receive notifications even when the app is in the background.
          </p>
        </div>

        <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3">
          <div className="flex items-center gap-3">
            <BellIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {state === "subscribed" ? "Push notifications enabled" : "Enable push notifications"}
              </span>
              {state === "denied" && (
                <span className="block text-xs text-red-500 dark:text-red-400">
                  Blocked by browser — update in browser settings
                </span>
              )}
              {state === "loading" && (
                <span className="block text-xs text-gray-400">Checking…</span>
              )}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state === "subscribed"}
            onClick={handleSubscribeToggle}
            disabled={state === "loading" || state === "denied"}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              state === "subscribed" ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                state === "subscribed" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {state === "subscribed" && loaded && (
          <div className="space-y-2">
            {PUSH_NOTIF_TYPES.map(({ key, label, description }) => (
              <label
                key={key}
                className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={prefs[key] !== false}
                  onChange={() => !saving && toggle(key)}
                  disabled={saving}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 dark:bg-gray-800"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{description}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
