"use client";

import { useEffect, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export default function ServiceWorkerRegistrar() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Remember whether a SW was already controlling this page before registration.
    // If true, a subsequent controllerchange means a new SW version took over.
    // If false, it's the first install — no need to prompt.
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed — non-critical, ignore silently
    });

    const handleControllerChange = () => {
      if (hadController) {
        setShowUpdate(true);
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  if (!showUpdate) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-violet-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg"
    >
      <span>A new version of SunoFlow is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
      >
        <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}
