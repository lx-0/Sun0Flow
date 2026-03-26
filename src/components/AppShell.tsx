"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { TIER_LABELS, TIER_BADGE_COLORS, type SubscriptionTier } from "@/lib/feature-gates";

import {
  HomeIcon,
  HeartIcon,
  Cog6ToothIcon,
  BookOpenIcon,
  QueueListIcon,
  PlusCircleIcon,
  UserCircleIcon,
  Bars3Icon,
  XMarkIcon,
  ClockIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  PresentationChartLineIcon,
  LightBulbIcon,
  SparklesIcon,
  BookmarkIcon,
  UserGroupIcon,
  GlobeAltIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  RssIcon,
  ChatBubbleLeftEllipsisIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "./ThemeProvider";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "./ErrorBoundary";
const GlobalPlayer = dynamic(() => import("./GlobalPlayer").then((m) => m.GlobalPlayer), { ssr: false });
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
const KeyboardShortcutsModal = dynamic(() => import("./KeyboardShortcutsModal").then((m) => m.KeyboardShortcutsModal), { ssr: false });
import { NotificationBell } from "./NotificationBell";
import { SearchBar } from "./SearchBar";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
const ResumePlaybackPrompt = dynamic(
  () => import("./ResumePlaybackPrompt").then((m) => m.ResumePlaybackPrompt),
  { ssr: false }
);
import { LocaleSwitcher } from "./LocaleSwitcher";
const FeedbackModal = dynamic(() => import("./FeedbackModal").then((m) => m.FeedbackModal), { ssr: false });

// prefetch: true forces eager prefetch even before the link enters the viewport.
// Critical user-flow routes get this treatment so they load instantly on first click.
const NAV_ITEM_DEFS = [
  { key: "home" as const, href: "/", icon: HomeIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "library" as const, href: "/library", icon: BookOpenIcon, dataTour: undefined as string | undefined, prefetch: true },
  { key: "inspire" as const, href: "/inspire", icon: LightBulbIcon, dataTour: "nav-inspire" as string | undefined, prefetch: false },
  { key: "generate" as const, href: "/generate", icon: PlusCircleIcon, dataTour: "nav-generate" as string | undefined, prefetch: true },
  { key: "templates" as const, href: "/templates", icon: BookmarkIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "personas" as const, href: "/personas", icon: UserGroupIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "mashup" as const, href: "/mashup", icon: SparklesIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "feed" as const, href: "/feed", icon: RssIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "discover" as const, href: "/discover", icon: GlobeAltIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "playlists" as const, href: "/playlists", icon: QueueListIcon, dataTour: "explore" as string | undefined, prefetch: false },
  { key: "favorites" as const, href: "/favorites", icon: HeartIcon, dataTour: "nav-favorites" as string | undefined, prefetch: false },
  { key: "history" as const, href: "/history", icon: ClockIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "analytics" as const, href: "/analytics", icon: ChartBarIcon, dataTour: undefined as string | undefined, prefetch: false },
  { key: "stats" as const, href: "/stats", icon: PresentationChartLineIcon, dataTour: undefined as string | undefined, prefetch: false },
];

// ─── Focus trap for mobile drawer ────────────────────────────────────────────

function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [containerRef]
  );

  useEffect(() => {
    if (!active) return;
    document.addEventListener("keydown", handleKeyDown);
    // Focus the first focusable element when trap activates
    const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length > 0) focusable[0].focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, handleKeyDown, containerRef]);
}

// ─── Swipe-to-close hook for mobile drawer ─────────────────────────────────

function useSwipeToDismiss(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void
) {
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const swiping = useRef(false);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchCurrentX.current = e.touches[0].clientX;
      swiping.current = true;
      el!.style.transition = "none";
    }

    function handleTouchMove(e: TouchEvent) {
      if (!swiping.current) return;
      touchCurrentX.current = e.touches[0].clientX;
      const dx = touchCurrentX.current - touchStartX.current;
      // Only allow swiping left (closing)
      if (dx < 0) {
        el!.style.transform = `translateX(${dx}px)`;
      }
    }

    function handleTouchEnd() {
      if (!swiping.current) return;
      swiping.current = false;
      el!.style.transition = "";
      const dx = touchCurrentX.current - touchStartX.current;
      if (dx < -80) {
        // Threshold met — dismiss
        el!.style.transform = "";
        onDismiss();
      } else {
        el!.style.transform = "";
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [active, containerRef, onDismiss]);
}

const themeOrder = ["light", "dark", "system"] as const;
type ThemeOption = (typeof themeOrder)[number];

const themeIcons: Record<ThemeOption, React.ElementType> = {
  light: SunIcon,
  dark: MoonIcon,
  system: ComputerDesktopIcon,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const navItems = NAV_ITEM_DEFS.map((item) => ({
    ...item,
    label: t(item.key),
  }));

  const themeLabels: Record<ThemeOption, string> = {
    light: tCommon("theme.light"),
    dark: tCommon("theme.dark"),
    system: tCommon("theme.system"),
  };

  const cycleTheme = useCallback(() => {
    const idx = themeOrder.indexOf(theme as ThemeOption);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  }, [theme, setTheme]);

  const ThemeIcon = themeIcons[(theme as ThemeOption) ?? "system"];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [kbFeedback, setKbFeedback] = useState<string | null>(null);
  const kbFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const showKbFeedback = useCallback((message: string) => {
    if (kbFeedbackTimerRef.current) clearTimeout(kbFeedbackTimerRef.current);
    setKbFeedback(message);
    kbFeedbackTimerRef.current = setTimeout(() => setKbFeedback(null), 1000);
  }, []);

  useFocusTrap(drawerRef, sidebarOpen);
  useSwipeToDismiss(drawerRef, sidebarOpen, closeSidebar);
  useKeyboardShortcuts(useCallback(() => setShortcutsOpen(true), []), showKbFeedback);

  // Load collapsed preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setSidebarCollapsed(true);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  // Close drawer on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Invisible prefetch hints for high-conversion routes not in the primary nav */}
      <Link href="/pricing" prefetch={true} className="sr-only" tabIndex={-1} aria-hidden="true">{""}</Link>
      {/* Skip-to-content link */}
      <a href="#main-content" className="skip-to-content">
        {t("skipToMain")}
      </a>
      {/* ── Desktop sidebar (md+) ── */}
      <aside aria-label="Main navigation" className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-20 transition-all duration-200 ${sidebarCollapsed ? "md:w-16" : "md:w-56"}`}>
        {/* Logo + collapse toggle */}
        <div className={`flex items-center h-14 border-b border-gray-200 dark:border-gray-800 ${sidebarCollapsed ? "justify-center px-2" : "px-4 justify-between"}`}>
          {!sidebarCollapsed && (
            <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
          )}
          <button
            onClick={toggleSidebarCollapsed}
            aria-label={t("toggleSidebar")}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Primary" className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(({ label, href, icon: Icon, dataTour, prefetch }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                prefetch={prefetch}
                aria-current={active ? "page" : undefined}
                title={sidebarCollapsed ? label : undefined}
                {...(dataTour ? { "data-tour": dataTour } : {})}
                className={`flex items-center rounded-lg text-sm font-medium transition-colors min-h-[44px] ${sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"} ${
                  active
                    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                {!sidebarCollapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section — profile/settings/signout */}
        {session?.user && (
          <div className="border-t border-gray-200 dark:border-gray-800 p-2 space-y-1">
            {/* Tier badge — visible when sidebar is expanded and user is on paid tier */}
            {!sidebarCollapsed && (() => {
              const tier = ((session.user as unknown as Record<string, unknown>).subscriptionTier as SubscriptionTier) ?? "free";
              if (tier === "free") return null;
              return (
                <Link href="/settings/billing" className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Plan</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${TIER_BADGE_COLORS[tier]}`}>
                    {TIER_LABELS[tier]}
                  </span>
                </Link>
              );
            })()}
            {!!(session.user as unknown as Record<string, unknown>).isAdmin && (
              <Link
                href="/admin"
                aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                title={sidebarCollapsed ? "Admin" : undefined}
                className={`flex items-center rounded-lg text-sm font-medium transition-colors min-h-[44px] ${sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"} ${
                  pathname.startsWith("/admin")
                    ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <ShieldCheckIcon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                {!sidebarCollapsed && t("admin")}
              </Link>
            )}
            <Link
              href="/profile"
              aria-current={pathname === "/profile" ? "page" : undefined}
              title={sidebarCollapsed ? tCommon("profile") : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors min-h-[44px] ${sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"} ${
                pathname === "/profile"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <UserCircleIcon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!sidebarCollapsed && tCommon("profile")}
            </Link>
            <Link
              href="/settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              title={sidebarCollapsed ? t("settings") : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors min-h-[44px] ${sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"} ${
                pathname === "/settings"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Cog6ToothIcon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!sidebarCollapsed && t("settings")}
            </Link>
            {!sidebarCollapsed && (
              <div className="px-2 py-1">
                <LocaleSwitcher />
              </div>
            )}
            <button
              onClick={() => setFeedbackOpen(true)}
              aria-label="Send feedback"
              title={sidebarCollapsed ? "Send feedback" : undefined}
              className={`w-full flex items-center rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] ${sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}`}
            >
              <ChatBubbleLeftEllipsisIcon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!sidebarCollapsed && "Feedback"}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label={tCommon("logout")}
              title={sidebarCollapsed ? tCommon("logout") : undefined}
              className={`w-full flex items-center rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] ${sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}`}
            >
              {sidebarCollapsed ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              ) : tCommon("logout")}
            </button>
          </div>
        )}
      </aside>

      {/* ── Mobile sidebar drawer overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ── */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 ease-in-out md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-800">
          <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label={t("closeMenu")}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Primary" className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        {session?.user && (
          <div className="border-t border-gray-200 dark:border-gray-800 p-2 space-y-1">
            {/* Tier badge for mobile drawer */}
            {(() => {
              const tier = ((session.user as unknown as Record<string, unknown>).subscriptionTier as SubscriptionTier) ?? "free";
              if (tier === "free") return null;
              return (
                <Link
                  href="/settings/billing"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-xs text-gray-500 dark:text-gray-400">Plan</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${TIER_BADGE_COLORS[tier]}`}>
                    {TIER_LABELS[tier]}
                  </span>
                </Link>
              );
            })()}
            <Link
              href="/profile"
              onClick={() => setSidebarOpen(false)}
              aria-current={pathname === "/profile" ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                pathname === "/profile"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <UserCircleIcon className="w-5 h-5" aria-hidden="true" />
              {tCommon("profile")}
            </Link>
            <Link
              href="/settings"
              onClick={() => setSidebarOpen(false)}
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                pathname === "/settings"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Cog6ToothIcon className="w-5 h-5" aria-hidden="true" />
              {t("settings")}
            </Link>
            <div className="px-2 py-1">
              <LocaleSwitcher compact />
            </div>
            <button
              onClick={() => { setSidebarOpen(false); setFeedbackOpen(true); }}
              aria-label="Send feedback"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px]"
            >
              <ChatBubbleLeftEllipsisIcon className="w-5 h-5" aria-hidden="true" />
              Feedback
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label={tCommon("logout")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px]"
            >
              {tCommon("logout")}
            </button>
          </div>
        )}
      </aside>

      {/* ── Main content area ── */}
      <div className={`flex flex-col flex-1 min-w-0 transition-all duration-200 ${sidebarCollapsed ? "md:ml-16" : "md:ml-56"}`}>
        {/* Top header */}
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label={t("openMenu")}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors md:hidden"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          <span className="text-violet-400 font-bold text-lg tracking-tight md:hidden">SunoFlow</span>

          {/* Search bar (visible when authenticated) */}
          {session?.user && (
            <div className="flex-1 max-w-md mx-2 sm:mx-4">
              <SearchBar />
            </div>
          )}

          {session?.user && (
            <div className="flex items-center gap-3">
              <button
                onClick={cycleTheme}
                aria-label={themeLabels[(theme as ThemeOption) ?? "system"]}
                title={themeLabels[(theme as ThemeOption) ?? "system"]}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ThemeIcon className="w-5 h-5" aria-hidden="true" />
              </button>
              <NotificationBell />
              <Link
                href="/profile"
                aria-label={tCommon("profile")}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors md:hidden ${
                  pathname === "/profile" ? "text-violet-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <UserCircleIcon className="w-5 h-5" />
              </Link>
              <Link
                href="/settings"
                aria-label={t("settings")}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors md:hidden ${
                  pathname === "/settings" ? "text-violet-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Cog6ToothIcon className="w-5 h-5" />
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                aria-label={tCommon("logout")}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] px-2 hidden md:block"
              >
                {tCommon("logout")}
              </button>
            </div>
          )}
        </header>

        {/* Email verification banner */}
        <EmailVerificationBanner />

        {/* Resume playback prompt — shown on load when a saved state exists */}
        <ResumePlaybackPrompt />

        {/* Page content */}
        <main id="main-content" className="flex-1 overflow-y-auto pb-36 md:pb-24">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>

        {/* Global audio player */}
        <ErrorBoundary source="global-player" fallback={null}>
          <GlobalPlayer sidebarCollapsed={sidebarCollapsed} />
        </ErrorBoundary>

        {/* Keyboard shortcuts help modal */}
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        {/* Feedback button — bottom-right floating, visible when authenticated */}
        {session?.user && (
          <button
            onClick={() => setFeedbackOpen(true)}
            aria-label="Send feedback"
            className="fixed bottom-20 right-4 md:bottom-6 z-30 flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-full shadow-lg transition-colors"
          >
            <ChatBubbleLeftEllipsisIcon className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Feedback</span>
          </button>
        )}

        {/* Feedback modal */}
        {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}

        {/* Keyboard action feedback overlay */}
        {kbFeedback && (
          <div
            aria-live="polite"
            aria-atomic="true"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] pointer-events-none"
          >
            <div className="bg-black/75 text-white text-sm font-medium px-4 py-2 rounded-full whitespace-nowrap">
              {kbFeedback}
            </div>
          </div>
        )}

        {/* Bottom nav (mobile only) */}
        <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 md:hidden">
          <div className="flex items-center justify-around h-16">
            {navItems.slice(0, 5).map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={`flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] ${
                    active
                      ? "text-violet-400"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <Icon className="w-6 h-6" aria-hidden="true" />
                  <span className="text-[10px]" aria-hidden="true">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
