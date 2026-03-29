"use client";

import dynamic from "next/dynamic";

// These components require browser APIs and must not be SSR'd.
// This Client Component wrapper lets layout.tsx (a Server Component) include
// them without triggering the "ssr: false not allowed in Server Components" error.

const PwaInstallPrompt = dynamic(
  () => import("@/components/PwaInstallPrompt").then((m) => m.PwaInstallPrompt),
  { ssr: false }
);

const PushNotificationPrompt = dynamic(
  () => import("@/components/PushNotificationPrompt").then((m) => m.PushNotificationPrompt),
  { ssr: false }
);

export function ClientOnlyComponents() {
  return (
    <>
      <PwaInstallPrompt />
      <PushNotificationPrompt />
    </>
  );
}
