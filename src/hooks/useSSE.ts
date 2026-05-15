"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  subscribe,
  isStreamConnected,
  type EventsHandler,
} from "@/lib/realtime/events-stream";

export type SSEEventHandler = EventsHandler;

interface UseSSEOptions {
  /** Map of event types to handlers */
  handlers: Record<string, SSEEventHandler>;
  /** Whether the SSE subscription should be active */
  enabled?: boolean;
}

/**
 * Subscribe to the shared `/api/events` stream. Connection is multiplexed
 * across all useSSE callers and paused while the document is hidden.
 */
export function useSSE({ handlers, enabled = true }: UseSSEOptions) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const getConnected = useCallback(() => isStreamConnected(), []);

  useEffect(() => {
    if (!enabled) return;
    const unsubs: Array<() => void> = [];
    for (const type of Object.keys(handlersRef.current)) {
      unsubs.push(
        subscribe(type, (data) => {
          handlersRef.current[type]?.(data);
        })
      );
    }
    return () => {
      for (const u of unsubs) u();
    };
  }, [enabled]);

  return { getConnected };
}
