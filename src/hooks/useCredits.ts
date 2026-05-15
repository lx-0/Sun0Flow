"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

// Burst SSE events from batch generations would otherwise hammer /api/credits
// once per completed item. Coalesce into a single refetch per window.
const REFRESH_DEBOUNCE_MS = 400;

/**
 * Fetches the user's current credit balance and refreshes after generation events.
 */
export function useCredits(enabled = true) {
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchCredits();
    }, REFRESH_DEBOUNCE_MS);
  }, [fetchCredits]);

  useEffect(() => {
    if (!enabled) return;
    fetchCredits();
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, fetchCredits]);

  useSSE({
    enabled,
    handlers: {
      generation_update: (payload) => {
        if (payload.status === "complete" || payload.status === "failed") {
          scheduleRefresh();
        }
      },
      queue_item_complete: () => {
        scheduleRefresh();
      },
    },
  });

  return { data, loading };
}
