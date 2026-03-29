"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { BellIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { usePushSubscription } from "@/hooks/usePushSubscription";

const DISMISS_KEY = "sunoflow_push_prompt_dismissed_until";
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isDismissed(): boolean {
  try {
    const until = localStorage.getItem(DISMISS_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  } catch {
    return false;
  }
}

export function PushNotificationPrompt() {
  const { data: session, status } = useSession();
  const { state, subscribe } = usePushSubscription();
  const [show, setShow] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    const user = session?.user as unknown as Record<string, unknown> | undefined;
    if (!user?.onboardingCompleted) return;
    if (state !== "prompt") return;
    if (isDismissed()) return;

    // Short delay so it doesn't flash on mount
    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, [status, session, state]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
    } catch {
      // ignore
    }
    setShow(false);
  }

  async function handleEnable() {
    setSubscribing(true);
    const ok = await subscribe();
    setSubscribing(false);
    if (ok) {
      setShow(false);
    } else {
      // Permission denied or error — dismiss so we don't re-prompt
      dismiss();
    }
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Enable push notifications"
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 animate-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <BellIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Stay in the loop
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Get notified when your songs finish generating, someone follows you, or comments on your music.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={subscribing}
              className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-medium py-2 px-3 transition-colors"
            >
              {subscribing ? "Enabling…" : "Enable notifications"}
            </button>
            <button
              onClick={dismiss}
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-xs font-medium py-2 px-3 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss notification prompt"
          className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 -mt-1 -mr-1"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
