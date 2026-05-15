"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./Toast";
import { logError } from "@/lib/error-logger";

/**
 * Returns true for errors that are benign / non-actionable and should be
 * silently logged without surfacing a toast to the user.
 */
export function isBenignError(error: unknown, message?: string): boolean {
  // Some browser/library cancellation paths reject promises with no payload.
  // Treat these as non-actionable to avoid noisy runtime toasts.
  if (error == null && (message == null || message.trim() === "")) return true;

  const msg =
    (error instanceof Error ? error.message : undefined) ?? message ?? "";
  const name = error instanceof Error ? error.name : "";

  // ResizeObserver loop errors — fired by layout-measuring libraries
  // (react-virtual, auto-size textareas, etc.) when a resize callback
  // triggers another layout pass. Completely harmless.
  if (msg.includes("ResizeObserver loop")) return true;
  // Common expected cancellation paths in the app (search/audio/fetch aborts)
  // that should not surface as user-visible runtime errors.
  if (name === "AbortError") return true;
  if (msg.includes("The play() request was interrupted")) return true;
  // Browser cross-origin script errors often omit useful stack/message details.
  // They are tracked separately and are not actionable from client runtime patrol.
  if (msg === "Script error.") return true;

  return false;
}

/**
 * Returns true when a stale Next.js chunk failed to load, typically after a
 * new deployment while the browser still references old chunk hashes.
 */
export function isChunkLoadError(error: unknown, message?: string): boolean {
  const msg =
    (error instanceof Error ? error.message : undefined) ?? message ?? "";
  const name = error instanceof Error ? error.name : "";

  return (
    name === "ChunkLoadError" ||
    msg.includes("Loading chunk") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed")
  );
}

export function GlobalErrorHandler() {
  const { toast } = useToast();
  const reloadPromptedRef = useRef(false);

  useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;

      if (isBenignError(reason)) return;

      if (isChunkLoadError(reason) && !reloadPromptedRef.current) {
        reloadPromptedRef.current = true;
        logError("chunk-load-error", reason);
        toast(
          "A new version of SunoFlow is available. Tap to refresh.",
          "info",
          { label: "Refresh", onClick: () => window.location.reload() },
        );
        return;
      }

      logError("unhandled-rejection", reason);
      toast("Something went wrong. Please try again.", "error");
    }

    function handleError(event: ErrorEvent) {
      if (isBenignError(event.error, event.message)) return;

      if (isChunkLoadError(event.error, event.message) && !reloadPromptedRef.current) {
        reloadPromptedRef.current = true;
        logError("chunk-load-error", event.error);
        toast(
          "A new version of SunoFlow is available. Tap to refresh.",
          "info",
          { label: "Refresh", onClick: () => window.location.reload() },
        );
        return;
      }

      logError("unhandled-error", event.error);
      toast("An unexpected error occurred.", "error");
    }

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, [toast]);

  return null;
}
