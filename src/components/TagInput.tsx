"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";

interface Tag {
  id: string;
  name: string;
  color: string;
}

// ─── Tag colors ──────────────────────────────────────────────────────────────

const TAG_COLORS = [
  "#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706",
  "#dc2626", "#db2777", "#7c2d12", "#4338ca", "#0d9488",
];

export function getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length];
}

// ─── Tag chip (shared) ──────────────────────────────────────────────────────

export function TagChip({
  tag,
  onRemove,
  onClick,
  size = "sm",
}: {
  tag: Tag;
  onRemove?: () => void;
  onClick?: () => void;
  size?: "sm" | "xs";
}) {
  const sizeClasses = size === "xs"
    ? "text-[10px] px-1.5 py-0.5 gap-0.5"
    : "text-xs px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${
        onClick ? "cursor-pointer hover:opacity-80" : ""
      }`}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
      onClick={onClick}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hover:opacity-70 min-w-[16px] min-h-[16px] flex items-center justify-center"
          aria-label={`Remove tag ${tag.name}`}
        >
          <XMarkIcon className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// ─── Tag input with auto-suggest ─────────────────────────────────────────────

interface TagInputProps {
  songId: string;
  initialTags?: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
}

export function TagInput({ songId, initialTags = [], onTagsChange }: TagInputProps) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all user tags for auto-suggest
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => {
        if (data.tags) setAllTags(data.tags);
      })
      .catch(() => {});
  }, []);

  // Update suggestions when input changes
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    const q = input.toLowerCase();
    const tagIds = new Set(tags.map((t) => t.id));
    const filtered = allTags.filter(
      (t) => t.name.includes(q) && !tagIds.has(t.id)
    );
    setSuggestions(filtered);
    setHighlightIndex(-1);
  }, [input, allTags, tags]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const updateTags = useCallback((newTags: Tag[]) => {
    setTags(newTags);
    onTagsChange?.(newTags);
  }, [onTagsChange]);

  async function addTag(tagName: string, existingTag?: Tag) {
    const name = tagName.trim().toLowerCase();
    if (!name) return;
    if (tags.some((t) => t.name === name)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/songs/${songId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existingTag ? { tagId: existingTag.id } : { name }),
      });
      if (res.ok) {
        const data = await res.json();
        const newTag = data.tag as Tag;
        updateTags([...tags, newTag]);
        // Update allTags if this is a new tag
        if (!allTags.some((t) => t.id === newTag.id)) {
          setAllTags((prev) => [...prev, newTag]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setInput("");
      setShowSuggestions(false);
    }
  }

  async function removeTag(tagId: string) {
    try {
      const res = await fetch(`/api/songs/${songId}/tags/${tagId}`, { method: "DELETE" });
      if (res.ok) {
        updateTags(tags.filter((t) => t.id !== tagId));
      }
    } catch {
      // ignore
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        addTag(suggestions[highlightIndex].name, suggestions[highlightIndex]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1].id);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex flex-wrap gap-1.5 items-center p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg min-h-[40px]">
        {tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          disabled={loading || tags.length >= 10}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => addTag(s.name, s)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  i === highlightIndex
                    ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                    : "text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showSuggestions && input.trim() && suggestions.length === 0 && !tags.some((t) => t.name === input.trim().toLowerCase()) && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg z-20 px-3 py-2 text-sm text-gray-500">
          Press Enter to create &quot;{input.trim().toLowerCase()}&quot;
        </div>
      )}
    </div>
  );
}
