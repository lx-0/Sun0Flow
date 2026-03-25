"use client";

import { useState, useEffect, useRef } from "react";
import { XMarkIcon, StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { useToast } from "./Toast";

const CATEGORIES = [
  { value: "bug_report", label: "Bug report" },
  { value: "feature_request", label: "Feature request" },
  { value: "general", label: "General feedback" },
];

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { toast } = useToast();
  const [category, setCategory] = useState("general");
  const [score, setScore] = useState<number | null>(null);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!dialogRef.current) return;
    const first = dialogRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (category === "bug_report" && !comment.trim()) {
      toast("Please describe the bug you encountered.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          score: score ?? undefined,
          comment: comment.trim() || undefined,
          pageUrl: window.location.href,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to submit feedback", "error");
        return;
      }

      toast("Thanks for your feedback!", "success");
      onClose();
    } catch {
      toast("Failed to submit feedback", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const displayScore = hoverScore ?? score;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="feedback-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Share Feedback
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </legend>
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors min-h-[44px] ${
                    category === c.value
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={c.value}
                    checked={category === c.value}
                    onChange={() => setCategory(c.value)}
                    className="accent-violet-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Satisfaction score */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Satisfaction <span className="font-normal text-gray-400">(optional)</span>
            </p>
            <div
              className="flex gap-1"
              onMouseLeave={() => setHoverScore(null)}
              role="group"
              aria-label="Satisfaction score"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                  aria-pressed={score === star}
                  onClick={() => setScore(score === star ? null : star)}
                  onMouseEnter={() => setHoverScore(star)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-yellow-400 hover:scale-110 transition-transform"
                >
                  {displayScore !== null && star <= displayScore ? (
                    <StarSolid className="w-6 h-6" aria-hidden="true" />
                  ) : (
                    <StarIcon className="w-6 h-6" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label
              htmlFor="feedback-comment"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1"
            >
              Comment{category === "bug_report" ? "" : " (optional)"}
            </label>
            <textarea
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                category === "bug_report"
                  ? "Describe what happened and how to reproduce it…"
                  : category === "feature_request"
                  ? "What would you like to see in SunoFlow?"
                  : "Tell us what you think…"
              }
              rows={4}
              maxLength={5000}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors min-h-[44px]"
            >
              {submitting ? "Sending…" : "Send Feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
