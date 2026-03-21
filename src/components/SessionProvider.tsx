"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./Toast";
import { GlobalErrorHandler } from "./GlobalErrorHandler";
import { QueueProvider } from "./QueueContext";
import { OnboardingProvider } from "./OnboardingTour";
import { NotificationProvider } from "./NotificationContext";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <QueueProvider>
            <NotificationProvider>
              <GlobalErrorHandler />
              <OnboardingProvider>
                {children}
              </OnboardingProvider>
            </NotificationProvider>
          </QueueProvider>
        </ToastProvider>
      </ThemeProvider>
    </NextAuthSessionProvider>
  );
}
