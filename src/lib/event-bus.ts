/**
 * Simple in-process event bus for SSE broadcasting.
 * Each user gets a set of listener callbacks; events are pushed to all connected clients.
 */

export interface SSEEvent {
  type: "generation_update" | "notification";
  data: Record<string, unknown>;
}

type Listener = (event: SSEEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(userId: string, listener: Listener): () => void {
  if (!listeners.has(userId)) {
    listeners.set(userId, new Set());
  }
  listeners.get(userId)!.add(listener);

  return () => {
    const userListeners = listeners.get(userId);
    if (userListeners) {
      userListeners.delete(listener);
      if (userListeners.size === 0) {
        listeners.delete(userId);
      }
    }
  };
}

export function broadcast(userId: string, event: SSEEvent): void {
  const userListeners = listeners.get(userId);
  if (!userListeners) return;
  userListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  });
}
