"use client";

import { useEffect } from "react";
import { useToast } from "./Toast";
import { logError } from "@/lib/error-logger";

export function GlobalErrorHandler() {
  const { toast } = useToast();

  useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      logError("unhandled-rejection", event.reason);
      toast("Something went wrong. Please try again.", "error");
    }

    function handleError(event: ErrorEvent) {
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
