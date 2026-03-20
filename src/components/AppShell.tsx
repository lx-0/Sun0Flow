"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

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
} from "@heroicons/react/24/outline";
import { GlobalPlayer } from "./GlobalPlayer";

const navItems = [
  { label: "Home", href: "/", icon: HomeIcon },
  { label: "Library", href: "/library", icon: BookOpenIcon },
  { label: "Generate", href: "/generate", icon: PlusCircleIcon },
  { label: "Playlists", href: "/playlists", icon: QueueListIcon },
  { label: "Favorites", href: "/favorites", icon: HeartIcon },
  { label: "History", href: "/history", icon: ClockIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar (md+) ── */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-20">
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-gray-200 dark:border-gray-800">
          <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section — profile/settings/signout */}
        {session?.user && (
          <div className="border-t border-gray-200 dark:border-gray-800 p-2 space-y-1">
            <Link
              href="/profile"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                pathname === "/profile"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <UserCircleIcon className="w-5 h-5" />
              Profile
            </Link>
            <Link
              href="/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                pathname === "/settings"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Cog6ToothIcon className="w-5 h-5" />
              Settings
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px]"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* ── Mobile sidebar drawer overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-200 ease-in-out md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-800">
          <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        {session?.user && (
          <div className="border-t border-gray-200 dark:border-gray-800 p-2 space-y-1">
            <Link
              href="/profile"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                pathname === "/profile"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <UserCircleIcon className="w-5 h-5" />
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                pathname === "/settings"
                  ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <Cog6ToothIcon className="w-5 h-5" />
              Settings
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px]"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* ── Main content area ── */}
      <div className="flex flex-col flex-1 min-w-0 md:ml-56">
        {/* Top header */}
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors md:hidden"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          <span className="text-violet-400 font-bold text-lg tracking-tight md:hidden">SunoFlow</span>

          {/* Spacer for desktop (logo is in sidebar) */}
          <div className="hidden md:block" />

          {session?.user && (
            <div className="flex items-center gap-3">
              <Link
                href="/profile"
                aria-label="Profile"
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors md:hidden ${
                  pathname === "/profile" ? "text-violet-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <UserCircleIcon className="w-5 h-5" />
              </Link>
              <Link
                href="/settings"
                aria-label="Settings"
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors md:hidden ${
                  pathname === "/settings" ? "text-violet-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Cog6ToothIcon className="w-5 h-5" />
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] px-2 hidden md:block"
              >
                Sign out
              </button>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-36 md:pb-24">
          <div className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>

        {/* Global audio player */}
        <GlobalPlayer />

        {/* Bottom nav (mobile only) */}
        <nav className="fixed bottom-0 left-0 right-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 md:hidden">
          <div className="flex items-center justify-around h-16">
            {navItems.slice(0, 5).map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] ${
                    active
                      ? "text-violet-400"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-[10px]">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
