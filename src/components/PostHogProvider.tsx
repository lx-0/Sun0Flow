"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initAnalytics, pageView } from "@/lib/analytics";

/**
 * Initializes PostHog and tracks page views on route changes.
 * Must be rendered inside a Suspense boundary (required for useSearchParams).
 */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize once on mount, deferred to idle so the analytics SDK doesn't
  // compete with first interactive paint on mobile. Safari has no
  // requestIdleCallback yet — fall back to setTimeout.
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const win = window as Window & {
      requestIdleCallback?: typeof requestIdleCallback;
      cancelIdleCallback?: typeof cancelIdleCallback;
    };
    if (typeof win.requestIdleCallback === "function") {
      const handle = win.requestIdleCallback(() => initAnalytics(), { timeout: 4000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(() => initAnalytics(), 1);
    return () => window.clearTimeout(handle);
  }, []);

  // Track page views on navigation
  useEffect(() => {
    const url = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    pageView(url);
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PostHogPageViewWrapper />
      {children}
    </>
  );
}

// Wrap in Suspense for useSearchParams (Next.js App Router requirement)
import { Suspense } from "react";
function PostHogPageViewWrapper() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}
