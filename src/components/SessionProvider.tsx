"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import dynamic from "next/dynamic";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./Toast";
import { GlobalErrorHandler } from "./GlobalErrorHandler";
import { QueueProvider } from "./QueueContext";
import { AudioEQProvider } from "./AudioEQContext";
import { OnboardingProvider } from "./OnboardingTour";
import { NotificationProvider, useNotifications } from "./NotificationContext";
// Lazy-load heavy modals that are only shown on demand
const ApiKeyWizard = dynamic(() => import("./ApiKeyWizard").then((m) => m.ApiKeyWizard));
const Confetti = dynamic(() => import("./Confetti").then((m) => m.Confetti));

function ConfettiBridge() {
  const { showConfetti, dismissConfetti } = useNotifications();
  if (!showConfetti) return null;
  return <Confetti onDone={dismissConfetti} />;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <ThemeProvider>
        <ToastProvider>
          <QueueProvider>
            <AudioEQProvider>
            <NotificationProvider>
              <GlobalErrorHandler />
              <OnboardingProvider>
                {children}
                <ApiKeyWizard />
                <ConfettiBridge />
              </OnboardingProvider>
            </NotificationProvider>
            </AudioEQProvider>
          </QueueProvider>
        </ToastProvider>
      </ThemeProvider>
    </NextAuthSessionProvider>
  );
}
