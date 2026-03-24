"use client";

import { useState, useEffect } from "react";
import { DevicePhoneMobileIcon, XMarkIcon } from "@heroicons/react/24/outline";

const DISMISS_KEY = "sunoflow_pwa_prompt_dismissed";

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent);
}

function isMobile(): boolean {
  return isIos() || isAndroid() || window.innerWidth < 768;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
  );
}

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show on mobile, not already in PWA mode, and not previously dismissed
    if (
      isMobile() &&
      !isStandalone() &&
      localStorage.getItem(DISMISS_KEY) !== "1"
    ) {
      // Slight delay so it doesn't flash on initial load
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  const instructions = isIos()
    ? "Tap the Share button, then \"Add to Home Screen\"."
    : isAndroid()
      ? "Tap the menu (⋮), then \"Add to Home screen\" or \"Install app\"."
      : "Use your browser menu to add this site to your home screen.";

  return (
    <div
      role="dialog"
      aria-label="Install SunoFlow as an app"
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 animate-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
          <DevicePhoneMobileIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Install SunoFlow
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Get the full app experience with offline access and faster loading.{" "}
            {instructions}
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
