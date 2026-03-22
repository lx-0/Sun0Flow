"use client";

import { useEffect, useRef, useCallback } from "react";

export type SSEEventHandler = (data: Record<string, unknown>) => void;

interface UseSSEOptions {
  /** Map of event types to handlers */
  handlers: Record<string, SSEEventHandler>;
  /** Whether the SSE connection should be active */
  enabled?: boolean;
}

/**
 * Connect to the SSE endpoint and dispatch events to handlers.
 * Automatically reconnects on disconnection with exponential backoff.
 */
export function useSSE({ handlers, enabled = true }: UseSSEOptions) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connectedRef = useRef(false);

  const getConnected = useCallback(() => connectedRef.current, []);

  useEffect(() => {
    if (!enabled) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let active = true;

    function connect() {
      if (!active) return;

      eventSource = new EventSource("/api/events");

      eventSource.onopen = () => {
        connectedRef.current = true;
        backoff = 1000; // Reset backoff on successful connection
      };

      eventSource.onerror = () => {
        connectedRef.current = false;
        eventSource?.close();
        eventSource = null;

        if (active) {
          reconnectTimer = setTimeout(() => {
            backoff = Math.min(backoff * 2, 30_000);
            connect();
          }, backoff);
        }
      };

      // Register event listeners for each handler type
      const types = Object.keys(handlersRef.current);
      for (const type of types) {
        eventSource.addEventListener(type, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handlersRef.current[type]?.(data);
          } catch {
            // Invalid JSON — ignore
          }
        });
      }
    }

    connect();

    return () => {
      active = false;
      connectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [enabled]);

  return { getConnected };
}
