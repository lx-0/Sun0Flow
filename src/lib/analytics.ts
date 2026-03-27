/**
 * Analytics module — wraps PostHog for event tracking.
 *
 * Rules:
 * - Only initializes when NEXT_PUBLIC_POSTHOG_KEY is set (production gating)
 * - No PII: never include email, name, or user ID in event properties
 * - All calls are fire-and-forget; never await analytics
 *
 * posthog-js is loaded lazily via dynamic import so it is excluded from the
 * initial JS bundle. The library (~100 KB) only downloads after the app mounts
 * and only when NEXT_PUBLIC_POSTHOG_KEY is set.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let posthogInstance: any = null;
let initialized = false;

export async function initAnalytics() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!key) return;

  const { default: posthog } = await import("posthog-js");
  posthogInstance = posthog;

  posthog.init(key, {
    api_host: host,
    // Use localStorage persistence (no cookies) — avoids cookie consent requirement
    persistence: "localStorage",
    // Disable automatic session recording to keep payload minimal
    disable_session_recording: true,
    // Capture page views manually via PostHogPageView
    capture_pageview: false,
    // Respect Do Not Track header
    respect_dnt: true,
  });

  initialized = true;
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized || !posthogInstance) return;
  posthogInstance.capture(event, properties);
}

export function pageView(url: string) {
  if (!initialized || !posthogInstance) return;
  posthogInstance.capture("$pageview", { $current_url: url });
}
