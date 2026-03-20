"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import {
  HomeIcon,
  HeartIcon,
  Cog6ToothIcon,
  BookOpenIcon,

  PlusCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

const navItems = [
  { label: "Home", href: "/", icon: HomeIcon },
  { label: "Library", href: "/library", icon: BookOpenIcon },
  { label: "Generate", href: "/generate", icon: PlusCircleIcon },
  { label: "History", href: "/history", icon: ClockIcon },
  { label: "Favorites", href: "/favorites", icon: HeartIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      {/* Top header */}
      <header className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
        {session?.user && (
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              aria-label="Settings"
              className={`transition-colors ${
                pathname === "/settings" ? "text-violet-400" : "text-gray-400 hover:text-white"
              }`}
            >
              <Cog6ToothIcon className="w-5 h-5" />
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 bg-gray-900 border-t border-gray-800 max-w-md mx-auto">
        <div className="flex items-center justify-around h-16">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  active
                    ? "text-violet-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
