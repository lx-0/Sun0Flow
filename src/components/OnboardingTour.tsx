"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { XMarkIcon, MusicalNoteIcon, BookOpenIcon, QueueListIcon } from "@heroicons/react/24/outline";

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

  const isActive = step !== null;

  return (
    <OnboardingContext.Provider value={{ restartTour }}>
      {children}

      {/* Welcome Modal — shown on first login before the tooltip tour */}
      {showWelcome && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-modal-title"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={completeTour}
            aria-hidden="true"
          />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header gradient */}
            <div className="bg-gradient-to-br from-violet-600 to-violet-800 px-6 py-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white/20 mb-4">
                <MusicalNoteIcon className="w-7 h-7 text-white" aria-hidden="true" />
              </div>
              <h2 id="welcome-modal-title" className="text-2xl font-bold text-white mb-1">
                Welcome to SunoFlow!
              </h2>
              <p className="text-violet-200 text-sm">Your personal AI music studio</p>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-gray-600 dark:text-gray-400 text-sm text-center mb-5">
                SunoFlow lets you create, manage, and enjoy AI-generated music — all in one place.
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mt-0.5">
                    <MusicalNoteIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Generate music</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Describe a mood or genre and create songs instantly</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mt-0.5">
                    <BookOpenIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Manage your library</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Browse, rate, and organize all your generated songs</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mt-0.5">
                    <QueueListIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Build playlists</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Group your favorites and share them with others</p>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowWelcome(false);
                    setCurrentStep(0);
                  }}
                  className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Take a quick tour
                </button>
                <Link
                  href="/generate"
                  onClick={completeTour}
                  className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-xl transition-colors text-center"
                >
                  Start generating now
                </Link>
                <button
                  onClick={completeTour}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isActive && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-[1px]" />

          {/* Tooltip */}
          <div
            className="fixed z-[60] w-80 max-w-[calc(100vw-2rem)]"
            style={
              tooltipPos
                ? {
                    top: `${tooltipPos.top}px`,
                    left: `${tooltipPos.left}px`,
                    transform:
                      tooltipPos.arrowSide === "top" || tooltipPos.arrowSide === "bottom"
                        ? "translateX(-50%)"
                        : "translateY(-50%)",
                  }
                : {
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }
            }
          >
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {step.title}
                </h3>
                <button
                  onClick={skipTour}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors -mr-1 -mt-1"
                  aria-label="Skip tour"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {step.description}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between">
                {/* Progress dots */}
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === currentStep
                          ? "bg-violet-600"
                          : i < currentStep
                            ? "bg-violet-300 dark:bg-violet-700"
                            : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={skipTour}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-2 py-1"
                  >
                    Skip tour
                  </button>
                  <button
                    onClick={nextStep}
                    className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {currentStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                  </button>
                </div>
              </div>
            </div>

            {/* Arrow */}
            {tooltipPos && (
              <div
                className={`absolute w-3 h-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rotate-45 ${
                  tooltipPos.arrowSide === "top"
                    ? "-top-1.5 left-1/2 -translate-x-1/2 border-b-0 border-r-0"
                    : tooltipPos.arrowSide === "bottom"
                      ? "-bottom-1.5 left-1/2 -translate-x-1/2 border-t-0 border-l-0"
                      : tooltipPos.arrowSide === "left"
                        ? "-left-1.5 top-1/2 -translate-y-1/2 border-t-0 border-r-0"
                        : "-right-1.5 top-1/2 -translate-y-1/2 border-b-0 border-l-0"
                }`}
              />
            )}
          </div>
        </>
      )}
    </OnboardingContext.Provider>
  );
}
