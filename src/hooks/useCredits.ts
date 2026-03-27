"use client";

import { useState, useEffect, useCallback } from "react";
import { useSSE } from "./useSSE";

export interface CreditsData {
  budget: number;
  creditsUsedThisMonth: number;
  creditsRemaining: number;
  generationsThisMonth: number;
  usagePercent: number;
  isLow: boolean;
  totalCreditsAllTime: number;
  totalGenerationsAllTime: number;
}

/**
 * Fetches the user's current credit balance and refreshes after generation events.
 */
export function useCredits(enabled = true) {
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
      // Ignore fetch errors silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchCredits();
  }, [enabled, fetchCredits]);

  // Refresh credits after a generation completes
  useSSE({
    enabled,
    handlers: {
      generation_update: (payload) => {
        if (payload.status === "complete" || payload.status === "failed") {
          fetchCredits();
        }
      },
      queue_item_complete: () => {
        fetchCredits();
      },
    },
  });

  return { data, loading };
}
