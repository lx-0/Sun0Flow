"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChartBarIcon,
  ChartPieIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  FlagIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";

const adminNav = [
  { label: "Dashboard", href: "/admin", icon: ChartBarIcon },
  { label: "Analytics", href: "/admin/analytics", icon: ChartPieIcon },
  { label: "Users", href: "/admin/users", icon: UsersIcon },
  { label: "Content", href: "/admin/content", icon: MusicalNoteIcon },
  { label: "Reports", href: "/admin/reports", icon: FlagIcon, badge: "reports" as const },
  { label: "Errors", href: "/admin/errors", icon: ExclamationTriangleIcon },
  { label: "Audit Log", href: "/admin/logs", icon: ClipboardDocumentListIcon },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingReports, setPendingReports] = useState(0);

  useEffect(() => {
    fetch("/api/admin/reports/count")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.pending) setPendingReports(data.pending); })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen">
      <a href="#admin-main-content" className="skip-to-content">Skip to content</a>
      <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 bg-gray-900 border-r border-gray-800 z-20">
        <div className="flex items-center h-14 px-4 border-b border-gray-800">
          <span className="text-red-400 font-bold text-lg tracking-tight">Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {adminNav.map(({ label, href, icon: Icon, badge }) => {
            const active = pathname === href;
            const showBadge = badge === "reports" && pendingReports > 0;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? "bg-red-900/30 text-red-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {showBadge && (
                  <span className="text-xs font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                    {pendingReports > 99 ? "99+" : pendingReports}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-800 p-2">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors min-h-[44px]"
          >
            <ArrowLeftIcon className="w-5 h-5" aria-hidden="true" />
            Back to App
          </Link>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 md:ml-56">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between md:hidden">
          <span className="text-red-400 font-bold text-lg">Admin</span>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">
            Back to App
          </Link>
        </header>

        {/* Mobile nav */}
        <nav className="flex items-center gap-1 px-4 py-2 bg-gray-900 border-b border-gray-800 md:hidden overflow-x-auto">
          {adminNav.map(({ label, href, icon: Icon, badge }) => {
            const active = pathname === href;
            const showBadge = badge === "reports" && pendingReports > 0;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  active
                    ? "bg-red-900/30 text-red-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
                {showBadge && (
                  <span className="text-xs font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                    {pendingReports > 99 ? "99+" : pendingReports}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <main id="admin-main-content" className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-950 text-white">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
