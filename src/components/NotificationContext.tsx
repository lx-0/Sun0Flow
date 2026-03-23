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
  browserPermission: NotificationPermission | "default";
  requestBrowserPermission: () => Promise<void>;
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

const MAX_DROPDOWN_NOTIFICATIONS = 20;
const POLL_INTERVAL_MS = 30_000;

// ─── Browser notification helper ──────────────────────────────────────────────

function sendBrowserNotification(title: string, body: string, href?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const notif = new Notification(title, {
    body,
    icon: "/icon-192x192.png",
  });

  if (href) {
    notif.onclick = () => {
      window.focus();
      window.location.href = href;
      notif.close();
    };
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [browserPermission, setBrowserPermission] =
    useState<NotificationPermission>("default");

  // Track previously-seen pending song IDs so we only notify on transitions
  const knownPendingRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Initialize browser notification permission state
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
  }, []);

  // Fetch notifications from DB
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/notifications?limit=${MAX_DROPDOWN_NOTIFICATIONS}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently ignore fetch errors
    }
  }, []);

  // Add a notification — persist to DB, then refresh local state
  const addNotification = useCallback(
    async (n: Omit<Notification, "id" | "read" | "createdAt">) => {
      try {
        // Create in DB via the generation poll endpoint (server-side)
        // We do an optimistic local add so the UI updates immediately
        const optimistic: Notification = {
          ...n,
          id: `temp-${Date.now()}`,
          read: false,
          createdAt: new Date().toISOString(),
        };
        setNotifications((prev) =>
          [optimistic, ...prev].slice(0, MAX_DROPDOWN_NOTIFICATIONS)
        );
        setUnreadCount((c) => c + 1);

        // Persist to DB
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n),
        });

        // Send browser notification
        sendBrowserNotification(n.title, n.message, n.href);

        // Refresh from DB to get real IDs
        await fetchNotifications();
      } catch {
        // Already added optimistically, fetch will correct on next poll
      }
    },
    [fetchNotifications]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      } catch {
        // Revert on error by refetching
        await fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    } catch {
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // ─── Initial fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    fetchNotifications();
  }, [session?.user, fetchNotifications]);

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
            { id: string; title: string | null; generationStatus: string; variationCount?: number }
          >();
          for (const s of allSongs) {
            songMap.set(s.id, s);
          }

          for (const id of resolvedIds) {
            if (!active) return;
            const song = songMap.get(id);
            if (!song) continue;

            if (song.generationStatus === "ready") {
              const vc = song.variationCount ?? 0;
              addNotification({
                type: "generation_complete",
                title: "Generation complete",
                message: vc > 0
                  ? `${vc + 1} versions ready — click to compare`
                  : `"${song.title || "Untitled"}" is ready to play`,
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

        // Also refresh notification list from DB (picks up any server-side notifications)
        if (active) await fetchNotifications();
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
  }, [session?.user, addNotification, fetchNotifications]);

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    browserPermission,
    requestBrowserPermission,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
