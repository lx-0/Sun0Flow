"use client";

/**
 * OnboardingTour — context provider for the first-time user tour.
 *
 * The visual tour overlay (OnboardingTourUI) is lazy-loaded so it is NOT
 * included in the initial bundle for returning users who have already completed
 * or skipped onboarding.
 */

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const OnboardingTourUI = dynamic(
  () => import("./OnboardingTourUI").then((m) => m.OnboardingTourUI),
  { ssr: false }
);

type TourStep = {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  requiredPath: string;
  /** Optional URL to navigate to when entering this step (defaults to requiredPath). Use when query params are needed. */
  navigateTo?: string;
  position: "top" | "bottom" | "left" | "right";
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to SunoFlow!",
    description:
      "Create AI music easily. Let us show you around — it only takes a moment.",
    targetSelector: "[data-tour='welcome']",
    requiredPath: "/",
    position: "bottom",
  },
  {
    id: "nav-generate",
    title: "Generate Music",
    description:
      "This is where the magic happens. Click Generate to open the music creation studio.",
    targetSelector: "[data-tour='nav-generate']",
    requiredPath: "/",
    position: "right",
  },
  {
    id: "generate",
    title: "Create Your First Song",
    description:
      "We've pre-filled a suggestion for you — \"lo-fi hip hop, chill, relaxing\". Hit Generate to create your first AI track!",
    targetSelector: "[data-tour='generate-prompt']",
    requiredPath: "/generate",
    navigateTo: "/generate?tags=lo-fi+hip+hop%2C+chill%2C+relaxing",
    position: "bottom",
  },
  {
    id: "prompt-tips",
    title: "Tips for Better Results",
    description:
      "Get the most out of SunoFlow: (1) Add a genre + mood — \"upbeat jazz, happy\". (2) Include instruments — \"piano, drums, bass\". (3) Specify tempo — \"slow ballad\" or \"fast-paced\". (4) Avoid vague words — be specific about the feeling you want.",
    targetSelector: "[data-tour='generate-prompt']",
    requiredPath: "/generate",
    position: "bottom",
  },
  {
    id: "library",
    title: "Your Music Library",
    description:
      "All your generated songs appear here. Filter by status, rating, or tags. Download, remix, and manage your collection.",
    targetSelector: "[data-tour='library']",
    requiredPath: "/library",
    position: "bottom",
  },
  {
    id: "nav-favorites",
    title: "Save Your Favorites",
    description:
      "Tap the heart icon on any song to save it here. Quick access to the tracks you love most.",
    targetSelector: "[data-tour='nav-favorites']",
    requiredPath: "/library",
    position: "right",
  },
  {
    id: "inspire",
    title: "Get Inspired",
    description:
      "The Inspire page shows trending songs and creative ideas. Visit it whenever you need fresh style inspiration!",
    targetSelector: "[data-tour='nav-inspire']",
    requiredPath: "/library",
    position: "right",
  },
  {
    id: "playlists",
    title: "Organize into Playlists",
    description:
      "Create playlists to group songs by mood, project, or anything you like. Share them with others too!",
    targetSelector: "[data-tour='explore']",
    requiredPath: "/playlists",
    position: "bottom",
  },
  {
    id: "ready",
    title: "You're All Set!",
    description:
      "You know the basics. Make sure to set up your Suno API key in Settings if you haven't already — then start creating!",
    targetSelector: "[data-tour='welcome']",
    requiredPath: "/",
    position: "bottom",
  },
];

type OnboardingContextType = {
  restartTour: () => void;
};

const OnboardingContext = createContext<OnboardingContextType>({
  restartTour: () => {},
});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update: updateSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const [showWelcome, setShowWelcome] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1); // -1 = inactive
  const [completing, setCompleting] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    arrowSide: "top" | "bottom" | "left" | "right";
  } | null>(null);

  const user = session?.user as
    | (Record<string, unknown> & { id: string; onboardingCompleted?: boolean })
    | undefined;

  // Never show tour on public/auth pages
  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];
  const isPublicPage = publicPaths.some((p) => pathname.startsWith(p));

  // Auto-start welcome modal for new users
  useEffect(() => {
    if (isPublicPage) return;
    if (status !== "authenticated") return;
    if (user && user.onboardingCompleted === false && !showWelcome && currentStep === -1 && !completing) {
      // Check localStorage fallback — skip may have been persisted even if API call failed
      try {
        if (localStorage.getItem("sunoflow-tour-completed") === "true") return;
      } catch {
        // localStorage unavailable
      }
      setShowWelcome(true);
    }
  }, [user, showWelcome, currentStep, completing, isPublicPage, status]);

  const step = currentStep >= 0 ? TOUR_STEPS[currentStep] : null;

  // Navigate to the step's required path if needed
  useEffect(() => {
    if (!step) return;
    if (pathname !== step.requiredPath) {
      router.push(step.navigateTo ?? step.requiredPath);
    }
  }, [step, pathname, router]);

  // Position the tooltip relative to the target element
  useEffect(() => {
    if (!step || pathname !== step.requiredPath) {
      setTooltipPos(null);
      return;
    }

    const positionTooltip = () => {
      const el = document.querySelector(step.targetSelector);
      if (!el) {
        // Target not found — show tooltip centered
        setTooltipPos(null);
        return;
      }

      const rect = el.getBoundingClientRect();
      const OFFSET = 12;

      let top = 0;
      let left = 0;
      let arrowSide: "top" | "bottom" | "left" | "right" = "top";

      switch (step.position) {
        case "bottom":
          top = rect.bottom + OFFSET;
          left = rect.left + rect.width / 2;
          arrowSide = "top";
          break;
        case "top":
          top = rect.top - OFFSET;
          left = rect.left + rect.width / 2;
          arrowSide = "bottom";
          break;
        case "right":
          top = rect.top + rect.height / 2;
          left = rect.right + OFFSET;
          arrowSide = "left";
          break;
        case "left":
          top = rect.top + rect.height / 2;
          left = rect.left - OFFSET;
          arrowSide = "right";
          break;
      }

      setTooltipPos({ top, left, arrowSide });

      // Highlight the target
      el.classList.add("ring-2", "ring-violet-500", "ring-offset-2", "rounded-lg", "z-[60]", "relative");
    };

    // Delay to let page render
    const timer = setTimeout(positionTooltip, 300);
    window.addEventListener("resize", positionTooltip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", positionTooltip);
      // Clean up highlight
      const el = document.querySelector(step.targetSelector);
      if (el) {
        el.classList.remove("ring-2", "ring-violet-500", "ring-offset-2", "rounded-lg", "z-[60]", "relative");
      }
    };
  }, [step, pathname]);

  const completeTour = useCallback(async () => {
    setCompleting(true);
    setShowWelcome(false);
    setCurrentStep(-1);
    setTooltipPos(null);
    // Persist skip immediately in localStorage as a fallback
    try {
      localStorage.setItem("sunoflow-tour-completed", "true");
    } catch {
      // localStorage unavailable
    }
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
      await updateSession();
    } catch {
      // API call failed — localStorage fallback ensures tour stays dismissed
    }
  }, [updateSession]);

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      // Clean up current highlight
      if (step) {
        const el = document.querySelector(step.targetSelector);
        if (el) {
          el.classList.remove("ring-2", "ring-violet-500", "ring-offset-2", "rounded-lg", "z-[60]", "relative");
        }
      }
      setCurrentStep((s) => s + 1);
    } else {
      completeTour();
    }
  }, [currentStep, step, completeTour]);

  const skipTour = useCallback(() => {
    // Clean up highlight
    if (step) {
      const el = document.querySelector(step.targetSelector);
      if (el) {
        el.classList.remove("ring-2", "ring-violet-500", "ring-offset-2", "rounded-lg", "z-[60]", "relative");
      }
    }
    completeTour();
  }, [step, completeTour]);

  const restartTour = useCallback(async () => {
    try {
      localStorage.removeItem("sunoflow-tour-completed");
    } catch {
      // localStorage unavailable
    }
    try {
      await fetch("/api/onboarding/reset", { method: "POST" });
      await updateSession();
      setCompleting(false);
      setShowWelcome(true);
    } catch {
      // silent fail
    }
  }, [updateSession]);

  const tourVisible = showWelcome || currentStep >= 0;

  return (
    <OnboardingContext.Provider value={{ restartTour }}>
      {children}

      {/* Lazy-loaded tour UI — only fetched when a new user triggers it */}
      {tourVisible && (
        <OnboardingTourUI
          showWelcome={showWelcome}
          step={step}
          currentStep={currentStep}
          totalSteps={TOUR_STEPS.length}
          tooltipPos={tooltipPos}
          onComplete={completeTour}
          onNext={nextStep}
          onSkip={skipTour}
          onStartTour={() => {
            setShowWelcome(false);
            setCurrentStep(0);
          }}
        />
      )}
    </OnboardingContext.Provider>
  );
}
