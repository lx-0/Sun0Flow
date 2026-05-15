"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSSE } from "./useSSE";
import { HttpError } from "@/components/QueryProvider";

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

export const creditsQueryKey = ["credits"] as const;

async function fetchCredits(): Promise<CreditsData> {
  const res = await fetch("/api/credits");
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

/**
 * Fetches the user's current credit balance and refreshes after generation events.
 *
 * Burst SSE events from batch generations are coalesced by React Query's
 * built-in in-flight deduplication — concurrent invalidations collapse into
 * a single network request, so no manual debounce is needed.
 */
export function useCredits(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: creditsQueryKey,
    queryFn: fetchCredits,
    enabled,
  });

  useSSE({
    enabled,
    handlers: {
      generation_update: (payload) => {
        if (payload.status === "complete" || payload.status === "failed") {
          queryClient.invalidateQueries({ queryKey: creditsQueryKey });
        }
      },
      queue_item_complete: () => {
        queryClient.invalidateQueries({ queryKey: creditsQueryKey });
      },
    },
  });

  return { data: query.data ?? null, loading: query.isPending };
}
