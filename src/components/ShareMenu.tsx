"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShareIcon,
  LinkIcon,
  CheckIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "./Toast";
import { track } from "@/lib/analytics";
import { useOutsideClick } from "@/hooks/useOutsideClick";

interface ShareMenuProps {
  /** The URL to share */
  url: string;
  /** Title for the native share sheet */
  title: string;
  /** Optional body text for the native share sheet */
  text?: string;
  /** Analytics source label */
  source?: string;
  /** Extra class names on the trigger button */
  className?: string;
  /** When provided, shows a "Copy Embed Code" option that copies an iframe snippet with this src */
  embedUrl?: string;
}

/**
 * Reusable share menu with three options:
 * - Native Web Share API (shown only when navigator.share is available)
 * - Copy link (always shown)
 * - Share on X / Twitter (always shown)
 *
 * On click the button opens a small dropdown.
 */
export function ShareMenu({
  url,
  title,
  text,
  source = "unknown",
  className = "",
  embedUrl,
}: ShareMenuProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Detect Web Share API after mount (SSR-safe)
  useEffect(() => {
    setHasNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useOutsideClick(menuRef, () => setOpen(false), open);

  async function handleNativeShare() {
    setOpen(false);
    try {
      await navigator.share({ title, text, url });
      track("shared", { source, method: "web_share_api" });
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        // Fall back to clipboard on unexpected errors
        await copyToClipboard();
      }
    }
  }

  async function copyToClipboard() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast("Link copied!", "success");
    track("shared", { source, method: "clipboard" });
  }

  function handleShareOnX() {
    setOpen(false);
    const tweetText = text ?? title;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, "_blank", "noopener,noreferrer");
    track("shared", { source, method: "twitter" });
  }

  async function copyEmbedCode() {
    if (!embedUrl) return;
    setOpen(false);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const src = embedUrl.startsWith("http") ? embedUrl : `${origin}${embedUrl}`;
    const snippet = `<iframe src="${src}" width="100%" height="180" frameborder="0" style="border:none;border-radius:12px;overflow:hidden;" allow="autoplay" title="${title} — SunoFlow"></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts
    }
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
    toast("Embed code copied!", "success");
    track("shared", { source, method: "embed_code" });
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={className}
      >
        {copied ? (
          <CheckIcon className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ShareIcon className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{copied ? "Copied!" : "Share"}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute z-50 mt-1 right-0 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden"
        >
          {hasNativeShare && (
            <button
              role="menuitem"
              onClick={handleNativeShare}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <ShareIcon className="w-4 h-4 flex-shrink-0 text-violet-500" aria-hidden="true" />
              Share
            </button>
          )}
          <button
            role="menuitem"
            onClick={copyToClipboard}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <LinkIcon className="w-4 h-4 flex-shrink-0 text-violet-500" aria-hidden="true" />
            Copy link
          </button>
          <button
            role="menuitem"
            onClick={handleShareOnX}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {/* X / Twitter logo */}
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </button>
          {embedUrl && (
            <button
              role="menuitem"
              onClick={copyEmbedCode}
              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {embedCopied ? (
                <CheckIcon className="w-4 h-4 flex-shrink-0 text-violet-500" aria-hidden="true" />
              ) : (
                <CodeBracketIcon className="w-4 h-4 flex-shrink-0 text-violet-500" aria-hidden="true" />
              )}
              {embedCopied ? "Copied!" : "Copy Embed Code"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
