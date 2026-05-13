"use client";

import { useEffect, useState } from "react";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";

export function ClientOnlyComponents() {
  // Keep prompt components client-only without next/dynamic SSR bailouts.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <PwaInstallPrompt />
      <PushNotificationPrompt />
    </>
  );
}
