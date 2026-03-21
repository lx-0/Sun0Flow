"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "generation_complete"
  | "generation_failed"
  | "rate_limit_reset"
  | "announcement";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  /** ISO timestamp */
  createdAt: string;
  /** Optional link to navigate to on click */
  href?: string;
  /** Song ID for generation notifications */
  songId?: string;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, "id" | "read" | "createdAt">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  return ctx;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 20;
const POLL_INTERVAL_MS = 30_000;

let nextNotifId = 0;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Track previously-seen pending song IDs so we only notify on transitions
  const knownPendingRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "read" | "createdAt">) => {
      const notification: Notification = {
        ...n,
        id: `notif-${++nextNotifId}`,
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) =>
        [notification, ...prev].slice(0, MAX_NOTIFICATIONS)
      );
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ─── Poll for generation status changes ─────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;

    let active = true;

    async function poll() {
      try {
        // Fetch pending songs
        const pendingRes = await fetch("/api/songs?status=pending");
        if (!pendingRes.ok) return;
        const { songs: pendingSongs } = await pendingRes.json();
        const pendingIds = new Set<string>(
          pendingSongs.map((s: { id: string }) => s.id)
        );

        if (!initializedRef.current) {
          // First poll — seed known pending set, don't fire notifications
          knownPendingRef.current = pendingIds;
          initializedRef.current = true;
          return;
        }

        // Check which previously-pending songs are no longer pending
        const previousPending = knownPendingRef.current;
        const resolvedIds = Array.from(previousPending).filter(
          (id) => !pendingIds.has(id)
        );

        if (resolvedIds.length > 0) {
          // Fetch all songs to check their final status
          const allRes = await fetch("/api/songs");
          if (!allRes.ok) return;
          const { songs: allSongs } = await allRes.json();
          const songMap = new Map<
            string,
            { id: string; title: string | null; generationStatus: string }
          >();
          for (const s of allSongs) {
            songMap.set(s.id, s);
          }

          for (const id of resolvedIds) {
            if (!active) return;
            const song = songMap.get(id);
            if (!song) continue;

            if (song.generationStatus === "ready") {
              addNotification({
                type: "generation_complete",
                title: "Generation complete",
                message: `"${song.title || "Untitled"}" is ready to play`,
                href: `/library`,
                songId: song.id,
              });
            } else if (song.generationStatus === "failed") {
              addNotification({
                type: "generation_failed",
                title: "Generation failed",
                message: `"${song.title || "Untitled"}" could not be generated`,
                href: `/library`,
                songId: song.id,
              });
            }
          }
        }

        // Update known pending set
        knownPendingRef.current = pendingIds;
      } catch {
        // Silently ignore poll errors
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session?.user, addNotification]);

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
