"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BellIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline";
import { BellAlertIcon } from "@heroicons/react/24/solid";
import {
  useNotifications,
  type NotificationType,
} from "./NotificationContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const typeIcons: Record<NotificationType, typeof CheckCircleIcon> = {
  generation_complete: CheckCircleIcon,
  generation_failed: ExclamationCircleIcon,
  rate_limit_reset: ClockIcon,
  announcement: MegaphoneIcon,
};

const typeColors: Record<NotificationType, string> = {
  generation_complete: "text-green-500",
  generation_failed: "text-red-500",
  rate_limit_reset: "text-amber-500",
  announcement: "text-violet-500",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleNotificationClick = useCallback(
    (id: string, href?: string) => {
      markAsRead(id);
      if (href) {
        router.push(href);
        setOpen(false);
      }
    },
    [markAsRead, router]
  );

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors relative"
      >
        {unreadCount > 0 ? (
          <BellAlertIcon className="w-5 h-5 text-violet-500" />
        ) : (
          <BellIcon className="w-5 h-5" />
        )}
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-violet-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Notifications
            </h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No notifications yet
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {notifications.map((n) => {
                const Icon = typeIcons[n.type];
                const color = typeColors[n.type];
                return (
                  <li key={n.id}>
                    <button
                      role="menuitem"
                      onClick={() => handleNotificationClick(n.id, n.href)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        !n.read
                          ? "bg-violet-50/50 dark:bg-violet-900/10"
                          : ""
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${color}`}
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            !n.read
                              ? "font-semibold text-gray-900 dark:text-white"
                              : "font-medium text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 mt-2" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* View all link */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium transition-colors"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
