"use client";

import { useState, useCallback } from "react";
import {
  SparklesIcon,
  ChevronDownIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "./Toast";
import { fetchWithTimeout, clientFetchErrorMessage } from "@/lib/fetch-client";
import { track } from "@/lib/analytics";

const GENERATE_CREDIT_COST = 10;

interface Variation {
  id: string;
  style: string;
  title: string;
  model: string;
}

interface BatchGeneratePanelProps {
  basePrompt: string;
  baseTitle: string;
  baseStyle: string;
  isInstrumental: boolean;
  onBatchStarted: (batchId: string, songIds: string[]) => void;
  creditInfo: { creditsRemaining: number } | null;
}

const MODELS = [
  { value: "", label: "Default (V5.5)" },
  { value: "V5_5", label: "V5.5" },
  { value: "V5", label: "V5" },
  { value: "V4_5", label: "V4.5" },
  { value: "V4", label: "V4" },
];

let nextVarId = 0;
function makeVariation(baseStyle: string, baseTitle: string): Variation {
  return {
    id: `var-${++nextVarId}`,
    style: baseStyle,
    title: baseTitle,
    model: "",
  };
}

export function BatchGeneratePanel({
  basePrompt,
  baseTitle,
  baseStyle,
  isInstrumental,
  onBatchStarted,
  creditInfo,
}: BatchGeneratePanelProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [variations, setVariations] = useState<Variation[]>(() => [
    makeVariation(baseStyle, baseTitle),
    makeVariation(baseStyle, baseTitle),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const creditCostPerSong = GENERATE_CREDIT_COST;
  const totalCost = creditCostPerSong * variations.length;
  const hasEnoughCredits =
    creditInfo === null || creditInfo.creditsRemaining >= totalCost;

  const addVariation = useCallback(() => {
    if (variations.length >= 5) return;
    setVariations((v) => [...v, makeVariation(baseStyle, baseTitle)]);
  }, [variations.length, baseStyle, baseTitle]);

  const removeVariation = useCallback(
    (id: string) => {
      if (variations.length <= 2) return;
      setVariations((v) => v.filter((x) => x.id !== id));
    },
    [variations.length]
  );

  const updateVariation = useCallback(
    (id: string, field: keyof Omit<Variation, "id">, value: string) => {
      setVariations((v) =>
        v.map((x) => (x.id === id ? { ...x, [field]: value } : x))
      );
    },
    []
  );

  async function handleSubmit() {
    if (isSubmitting) return;
    if (!basePrompt.trim()) {
      toast("Enter a prompt before generating variations", "error");
      return;
    }
    if (!hasEnoughCredits) {
      toast(
        `Not enough credits. Need ${totalCost} but have ${creditInfo?.creditsRemaining ?? 0}.`,
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const configs = variations.map((v) => ({
        prompt: basePrompt,
        title: v.title || undefined,
        style: v.style || undefined,
        model: v.model || undefined,
        makeInstrumental: isInstrumental,
      }));

      let res: Response;
      try {
        res = await fetchWithTimeout(
          "/api/songs/batch-generate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ configs }),
          },
          30_000
        );
      } catch (fetchErr) {
        toast(clientFetchErrorMessage(fetchErr), "error");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        toast(data.error ?? "Batch generation failed", "error");
        return;
      }

      const songIds = (data.results as Array<{ songId: string }>).map(
        (r) => r.songId
      );
      onBatchStarted(data.batchId, songIds);
      track("batch_generation_requested", {
        count: configs.length,
        batchId: data.batchId,
      });
      toast(
        `Batch started: ${data.summary.succeeded} of ${data.summary.total} songs generating`,
        "success"
      );
    } catch {
      toast("Batch generation failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
          <SparklesIcon className="h-4 w-4" />
          Generate Variations
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 text-indigo-500 dark:text-indigo-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Generate {variations.length} variations of your prompt with
            different styles or models. Each costs {creditCostPerSong} credits.
          </p>

          {/* Variation rows */}
          <div className="space-y-3">
            {variations.map((v, i) => (
              <div
                key={v.id}
                className="flex gap-2 items-start p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"
              >
                <span className="flex-shrink-0 mt-2 text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={v.title}
                    onChange={(e) =>
                      updateVariation(v.id, "title", e.target.value)
                    }
                    placeholder="Title (optional)"
                    maxLength={200}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={v.style}
                    onChange={(e) =>
                      updateVariation(v.id, "style", e.target.value)
                    }
                    placeholder="Style / genre override"
                    maxLength={500}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <select
                    value={v.model}
                    onChange={(e) =>
                      updateVariation(v.id, "model", e.target.value)
                    }
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    {MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                {variations.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeVariation(v.id)}
                    className="flex-shrink-0 mt-2 p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    aria-label={`Remove variation ${i + 1}`}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add variation button */}
          {variations.length < 5 && (
            <button
              type="button"
              onClick={addVariation}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Add variation ({variations.length}/5)
            </button>
          )}

          {/* Cost preview + submit */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-white">
                {totalCost} credits
              </span>{" "}
              ({creditCostPerSong} x {variations.length})
              {!hasEnoughCredits && (
                <span className="text-red-500 dark:text-red-400 ml-2">
                  — not enough credits
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isSubmitting || !basePrompt.trim() || !hasEnoughCredits
              }
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Generating…
                </>
              ) : (
                <>
                  <SparklesIcon className="h-4 w-4" />
                  Generate {variations.length} variations
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
