"use client";

/**
 * OnboardingTourUI — the visual overlay (welcome modal + step tooltip).
 *
 * This component is intentionally split from OnboardingTour.tsx and loaded
 * lazily so it does NOT inflate the initial bundle for returning users who
 * have already completed (or skipped) onboarding.
 */

import Link from "next/link";
import { XMarkIcon, MusicalNoteIcon, BookOpenIcon, QueueListIcon } from "@heroicons/react/24/outline";

type TourStep = {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  requiredPath: string;
  navigateTo?: string;
  position: "top" | "bottom" | "left" | "right";
};

interface TooltipPos {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourUIProps {
  showWelcome: boolean;
  step: TourStep | null;
  currentStep: number;
  totalSteps: number;
  tooltipPos: TooltipPos | null;
  onComplete: () => void;
  onNext: () => void;
  onSkip: () => void;
  onStartTour: () => void;
}

export function OnboardingTourUI({
  showWelcome,
  step,
  currentStep,
  totalSteps,
  tooltipPos,
  onComplete,
  onNext,
  onSkip,
  onStartTour,
}: OnboardingTourUIProps) {
  const isActive = step !== null;

  return (
    <>
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
            onClick={onComplete}
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
                  onClick={onStartTour}
                  className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Take a quick tour
                </button>
                <Link
                  href="/generate"
                  onClick={onComplete}
                  className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-xl transition-colors text-center"
                >
                  Start generating now
                </Link>
                <button
                  onClick={onComplete}
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
                  {step!.title}
                </h3>
                <button
                  onClick={onSkip}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors -mr-1 -mt-1"
                  aria-label="Skip tour"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {step!.description}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between">
                {/* Progress dots */}
                <div className="flex gap-1.5">
                  {Array.from({ length: totalSteps }).map((_, i) => (
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
                    onClick={onSkip}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-2 py-1"
                  >
                    Skip tour
                  </button>
                  <button
                    onClick={onNext}
                    className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {currentStep === totalSteps - 1 ? "Finish" : "Next"}
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
    </>
  );
}
