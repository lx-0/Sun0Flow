"use client";

import { useState, useEffect, useRef } from "react";
import { XMarkIcon, HandThumbUpIcon, HandThumbDownIcon } from "@heroicons/react/24/outline";
import { HandThumbUpIcon as ThumbUpSolid, HandThumbDownIcon as ThumbDownSolid } from "@heroicons/react/24/solid";
import { track } from "@/lib/analytics";

export type FeedbackSource = "song_generation" | "playlist_creation";

interface InAppFeedbackWidgetProps {
  source: FeedbackSource;
  entityId: string;
  onClose: () => void;
}

const QUESTIONS: Record<FeedbackSource, string> = {
  song_generation: "How was this result?",
  playlist_creation: "How was this experience?",
};

const LS_KEY = (source: FeedbackSource, id: string) =>
  `sunoflow-widget-feedback-${source}-${id}`;

function storeFeedbackSubmitted(source: FeedbackSource, id: string) {
  try {
    localStorage.setItem(LS_KEY(source, id), "submitted");
  } catch {
    // localStorage unavailable
  }
}

export function hasFeedbackBeenSubmitted(source: FeedbackSource, id: string): boolean {
  try {
    return localStorage.getItem(LS_KEY(source, id)) !== null;
  } catch {
    return false;
  }
}

export function InAppFeedbackWidget({ source, entityId, onClose }: InAppFeedbackWidgetProps) {
  const [rating, setRating] = useState<"thumbs_up" | "thumbs_down" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleThumbClick(value: "thumbs_up" | "thumbs_down") {
    setRating(value);
    setExpanded(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating || submitting) return;

    setSubmitting(true);
    try {
      if (source === "song_generation") {
        await fetch(`/api/songs/${entityId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        });
      } else {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: "general",
            score: rating === "thumbs_up" ? 5 : 1,
            comment: comment.trim() || undefined,
            pageUrl: window.location.href,
          }),
        });
      }

      // Optional webhook – fire-and-forget
      const webhookUrl = process.env.NEXT_PUBLIC_FEEDBACK_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            entityId,
            rating,
            comment: comment.trim() || undefined,
          }),
        }).catch(() => {
          // Ignore webhook errors
        });
      }

      track("feedback_submitted", { source, rating });
      storeFeedbackSubmitted(source, entityId);
      setSubmitted(true);
      closeTimerRef.current = setTimeout(onClose, 1500);
    } catch {
      // Silently fail — non-critical
      setSubmitted(true);
      storeFeedbackSubmitted(source, entityId);
      closeTimerRef.current = setTimeout(onClose, 1500);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDismiss() {
    storeFeedbackSubmitted(source, entityId);
    onClose();
  }

  const question = QUESTIONS[source];

  return (
    <div
      role="region"
      aria-label="Feedback widget"
      className="fixed bottom-4 right-4 z-40 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl animate-slide-in"
    >
      {submitted ? (
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="text-green-500 text-lg" aria-hidden="true">✓</span>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Thanks for your feedback!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between px-4 pt-4 pb-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{question}</p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss feedback"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 ml-2 min-w-[32px] min-h-[32px] flex items-center justify-center"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3 px-4 pb-3" role="group" aria-label="Rating">
            <button
              type="button"
              onClick={() => handleThumbClick("thumbs_up")}
              aria-label="Thumbs up"
              aria-pressed={rating === "thumbs_up"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors min-h-[40px] ${
                rating === "thumbs_up"
                  ? "bg-green-50 dark:bg-green-900/30 border-green-400 text-green-700 dark:text-green-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {rating === "thumbs_up" ? (
                <ThumbUpSolid className="w-4 h-4" aria-hidden="true" />
              ) : (
                <HandThumbUpIcon className="w-4 h-4" aria-hidden="true" />
              )}
              Good
            </button>
            <button
              type="button"
              onClick={() => handleThumbClick("thumbs_down")}
              aria-label="Thumbs down"
              aria-pressed={rating === "thumbs_down"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors min-h-[40px] ${
                rating === "thumbs_down"
                  ? "bg-red-50 dark:bg-red-900/30 border-red-400 text-red-700 dark:text-red-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {rating === "thumbs_down" ? (
                <ThumbDownSolid className="w-4 h-4" aria-hidden="true" />
              ) : (
                <HandThumbDownIcon className="w-4 h-4" aria-hidden="true" />
              )}
              Poor
            </button>
          </div>

          {expanded && (
            <div className="px-4 pb-3 space-y-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more (optional)…"
                rows={2}
                maxLength={500}
                aria-label="Additional feedback"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!rating || submitting}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors min-h-[36px]"
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
