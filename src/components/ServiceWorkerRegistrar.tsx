"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";

const UPDATE_CHECK_INTERVAL_MS = 60_000;
const SAFE_AUTO_RELOAD_DELAY_MS = 5_000;

function isAudioPlaying(): boolean {
  if (typeof navigator === "undefined") return false;
  if ("mediaSession" in navigator && navigator.mediaSession.playbackState === "playing") {
    return true;
  }
  if (typeof document !== "undefined") {
    const audio = document.querySelector("audio");
    if (audio && !audio.paused) return true;
  }
  return false;
}

export default function ServiceWorkerRegistrar() {
  const [showBanner, setShowBanner] = useState(false);
  const [autoReloadIn, setAutoReloadIn] = useState<number | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
    const swUrl = `/sw.js?v=${encodeURIComponent(buildId)}`;

    // Remember whether a SW was already controlling this page before
    // registration. controllerchange after a fresh first install is normal
    // and shouldn't prompt.
    const hadController = !!navigator.serviceWorker.controller;

    let registration: ServiceWorkerRegistration | null = null;
    let updateInterval: ReturnType<typeof setInterval> | null = null;

    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        registration = reg;
        // Poll the server every minute for a new SW. Browsers also re-check on
        // navigation but only after 24h — explicit polling makes updates land
        // for users with long-running PWA sessions.
        updateInterval = setInterval(() => {
          reg.update().catch(() => {});
        }, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch(() => {
        // SW registration failed — non-critical, ignore silently
      });

    const handleControllerChange = () => {
      if (!hadController) return;

      // A new SW has taken control. If audio is playing, reloading would be
      // disruptive — let the user choose. Otherwise auto-reload after a brief
      // grace window so the user can still cancel.
      if (isAudioPlaying()) {
        setShowBanner(true);
        return;
      }
      setAutoReloadIn(SAFE_AUTO_RELOAD_DELAY_MS / 1000);
      setShowBanner(true);

      let remaining = SAFE_AUTO_RELOAD_DELAY_MS / 1000;
      const tick = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(tick);
          setAutoReloadIn(0);
        } else {
          setAutoReloadIn(remaining);
        }
      }, 1000);

      reloadTimerRef.current = setTimeout(() => {
        clearInterval(tick);
        window.location.reload();
      }, SAFE_AUTO_RELOAD_DELAY_MS);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      if (updateInterval) clearInterval(updateInterval);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, []);

  if (!showBanner) return null;

  const cancelAutoReload = () => {
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    setAutoReloadIn(null);
    setShowBanner(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-violet-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg max-w-[calc(100vw-2rem)]"
    >
      <span className="truncate">
        {autoReloadIn !== null && autoReloadIn > 0
          ? `New version — refreshing in ${autoReloadIn}s…`
          : "A new version of SunoFlow is available."}
      </span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
      >
        <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
        Refresh
      </button>
      {autoReloadIn !== null && autoReloadIn > 0 && (
        <button
          onClick={cancelAutoReload}
          aria-label="Cancel auto refresh"
          className="opacity-70 hover:opacity-100 transition-opacity"
        >
          <XMarkIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
