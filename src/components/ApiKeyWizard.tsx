"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { KeyIcon, ArrowRightIcon, XMarkIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export function ApiKeyWizard() {
  const { data: session, update: updateSession } = useSession();
  const user = session?.user as
    | (Record<string, unknown> & { id: string; hasSunoApiKey?: boolean; onboardingCompleted?: boolean })
    | undefined;

  const [step, setStep] = useState(0); // 0 = intro, 1 = paste key, 2 = done
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    // Read synchronously on first render to prevent the wizard from flashing
    // before the useEffect fires (which caused DOM detachment in E2E tests).
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("sunoflow-apikey-wizard-dismissed") === "true";
      } catch {
        // localStorage unavailable
      }
    }
    return false;
  });

  // Don't show if user already has a key, hasn't loaded yet, or wizard was dismissed
  if (!user || user.hasSunoApiKey || dismissed) return null;

  // Don't show during onboarding tour (let tour finish first)
  if (user.onboardingCompleted === false) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/api-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sunoApiKey: apiKey }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save API key");
        return;
      }
      await updateSession();
      setStep(2);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem("sunoflow-apikey-wizard-dismissed", "true");
    } catch {
      // localStorage unavailable
    }
    setDismissed(true);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden">
          {/* Close button */}
          <div className="flex justify-end p-3 pb-0">
            <button
              onClick={handleDismiss}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Dismiss wizard"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 pb-6">
            {step === 0 && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <KeyIcon className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Set Up Your API Key
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  To generate AI music, you need an API key from{" "}
                  <a
                    href="https://sunoapi.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline"
                  >
                    sunoapi.org
                  </a>
                  . It only takes a minute to get one.
                </p>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-left space-y-2.5">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Visit{" "}
                      <a href="https://sunoapi.org" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline font-medium">
                        sunoapi.org
                      </a>{" "}
                      and create an account
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Generate an API key from your dashboard
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Paste it here and start creating music
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    I have a key
                    <ArrowRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    Paste Your API Key
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Your key is encrypted and stored securely.
                  </p>
                </div>
                <div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your sunoapi.org API key"
                    autoComplete="off"
                    autoFocus
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-500">{error}</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep(0); setError(null); }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !apiKey.trim()}
                    className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {saving ? "Saving..." : "Save Key"}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircleIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  You&apos;re All Set!
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your API key is saved. Head to the Generate page to create your first song.
                </p>
                <button
                  onClick={handleDismiss}
                  className="w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Start Creating
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
