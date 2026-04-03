"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/Toast";

export function PublicProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
