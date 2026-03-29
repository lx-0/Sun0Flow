"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  ArrowUturnLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useQueue } from "./QueueContext";
import { useToast } from "./Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Timestamp {
  lineIndex: number;
  startTime: number;
}

interface Annotation {
  lineIndex: number;
  body: string;
}

export interface LyricsEditorProps {
  songId: string;
  originalLyrics: string | null;
  editedLyrics: string | null;
  /** Set to true when this song is the one currently loaded in the global player */
  isCurrentSong?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLines(text: string | null): string[] {
  if (!text) return [];
  return text.split("\n");
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Render inline markdown bold/italic as JSX */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Simple tokenizer for **bold** and *italic*
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[0].startsWith("**")) {
      parts.push(<strong key={key++}>{m[2]}</strong>);
    } else {
      parts.push(<em key={key++}>{m[3]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ─── LyricsEditor ─────────────────────────────────────────────────────────────

export function LyricsEditor({
  songId,
  originalLyrics,
  editedLyrics: initialEditedLyrics,
  isCurrentSong = false,
}: LyricsEditorProps) {
  const { currentTime, isPlaying } = useQueue();
  const { toast } = useToast();

  // ── editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(initialEditedLyrics ?? originalLyrics ?? "");
  const [savedEdited, setSavedEdited] = useState(initialEditedLyrics);
  const [saving, setSaving] = useState(false);

  // ── view controls
  const [showOriginal, setShowOriginal] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);

  // ── timestamps
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [isSettingTimestamps, setIsSettingTimestamps] = useState(false);
  const [pendingTimestamps, setPendingTimestamps] = useState<Map<number, number>>(new Map());

  // ── annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<number | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const activeLyrics = savedEdited ?? originalLyrics ?? "";
  const displayLines = parseLines(showOriginal ? originalLyrics : activeLyrics);

  // Build a map of lineIndex -> startTime for quick lookup
  const tsMap = useMemo(
    () => new Map<number, number>(timestamps.map((t) => [t.lineIndex, t.startTime])),
    [timestamps]
  );
  const annMap = useMemo(
    () => new Map<number, string>(annotations.map((a) => [a.lineIndex, a.body])),
    [annotations]
  );

  // Find the current active line based on playhead
  const activeLineIndex = (() => {
    if (!isCurrentSong || !isPlaying || timestamps.length === 0) return -1;
    let idx = -1;
    for (const t of timestamps) {
      if (t.startTime <= currentTime) idx = t.lineIndex;
      else break;
    }
    return idx;
  })();

  // Load timestamps and annotations on mount
  useEffect(() => {
    async function load() {
      const [tsRes, annRes] = await Promise.all([
        fetch(`/api/songs/${songId}/lyrics/timestamps`),
        fetch(`/api/songs/${songId}/lyrics/annotations`),
      ]);
      if (tsRes.ok) {
        const data = await tsRes.json();
        setTimestamps((data.timestamps as Timestamp[]).sort((a, b) => a.startTime - b.startTime));
      }
      if (annRes.ok) {
        const data = await annRes.json();
        setAnnotations(data.annotations as Annotation[]);
      }
    }
    load();
  }, [songId]);

  // Scroll active line into view
  useEffect(() => {
    if (activeLineRef.current && isPlaying) {
      activeLineRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeLineIndex, isPlaying]);

  // ── Save edited lyrics
  const handleSaveLyrics = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/songs/${songId}/lyrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited: editDraft || null }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setSavedEdited(data.edited);
      setIsEditing(false);
      toast("Lyrics saved");
    } catch {
      toast("Failed to save lyrics");
    } finally {
      setSaving(false);
    }
  }, [songId, editDraft, toast]);

  // ── Discard edits
  const handleDiscardEdits = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/songs/${songId}/lyrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited: null }),
      });
      if (!res.ok) throw new Error("save failed");
      setSavedEdited(null);
      setEditDraft(originalLyrics ?? "");
      toast("Reverted to original lyrics");
    } catch {
      toast("Failed to revert");
    } finally {
      setSaving(false);
    }
  }, [songId, originalLyrics, toast]);

  // ── Timestamp tapping
  const handleLineTap = useCallback(
    (lineIndex: number) => {
      if (!isSettingTimestamps) return;
      if (!isCurrentSong) {
        toast("Play this song to set timestamps");
        return;
      }
      setPendingTimestamps((prev) => {
        const next = new Map(prev);
        next.set(lineIndex, currentTime);
        return next;
      });
    },
    [isSettingTimestamps, isCurrentSong, currentTime, toast]
  );

  // ── Save timestamps
  const handleSaveTimestamps = useCallback(async () => {
    const merged = new Map(tsMap);
    pendingTimestamps.forEach((v, k) => merged.set(k, v));
    const entries = Array.from(merged.entries()).map(([lineIndex, startTime]) => ({
      lineIndex,
      startTime,
    }));
    try {
      const res = await fetch(`/api/songs/${songId}/lyrics/timestamps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamps: entries }),
      });
      if (!res.ok) throw new Error("save failed");
      setTimestamps(entries.sort((a, b) => a.startTime - b.startTime));
      setPendingTimestamps(new Map());
      setIsSettingTimestamps(false);
      toast("Timestamps saved");
    } catch {
      toast("Failed to save timestamps");
    }
  }, [songId, tsMap, pendingTimestamps, toast]);

  // ── Save annotation
  const handleSaveAnnotation = useCallback(
    async (lineIndex: number, body: string) => {
      setSavingAnnotation(true);
      try {
        const res = await fetch(`/api/songs/${songId}/lyrics/annotations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineIndex, body }),
        });
        if (!res.ok) throw new Error("save failed");
        const data = await res.json();
        if (data.deleted) {
          setAnnotations((prev) => prev.filter((a) => a.lineIndex !== lineIndex));
        } else {
          setAnnotations((prev) => {
            const others = prev.filter((a) => a.lineIndex !== lineIndex);
            return [...others, { lineIndex, body }].sort((a, b) => a.lineIndex - b.lineIndex);
          });
        }
        setEditingAnnotation(null);
        setAnnotationDraft("");
        toast("Annotation saved");
      } catch {
        toast("Failed to save annotation");
      } finally {
        setSavingAnnotation(false);
      }
    },
    [songId, toast]
  );

  // ── Toolbar: bold / italic insert
  function insertFormat(marker: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = editDraft.slice(start, end);
    const replacement = selected ? `${marker}${selected}${marker}` : `${marker}${marker}`;
    const next =
      editDraft.slice(0, start) + replacement + editDraft.slice(end);
    setEditDraft(next);
    // Restore cursor
    setTimeout(() => {
      ta.focus();
      const cur = selected ? start + replacement.length : start + marker.length;
      ta.setSelectionRange(cur, cur);
    }, 0);
  }

  if (!originalLyrics && !savedEdited) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Lyrics</h2>
          <button
            onClick={() => { setIsEditing(true); setEditDraft(""); }}
            className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-400 transition-colors"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            Add lyrics
          </button>
        </div>
        {isEditing && (
          <EditingView
            draft={editDraft}
            onChange={setEditDraft}
            onSave={handleSaveLyrics}
            onCancel={() => setIsEditing(false)}
            saving={saving}
            textareaRef={textareaRef}
            onInsertFormat={insertFormat}
          />
        )}
        {!isEditing && (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">No lyrics yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Lyrics</h2>
        <div className="flex items-center gap-2">
          {savedEdited && (
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                showOriginal
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
              }`}
              title={showOriginal ? "Show edited version" : "Show original"}
            >
              {showOriginal ? "Original" : "Edited"}
            </button>
          )}
          {savedEdited && !showOriginal && !isEditing && (
            <button
              onClick={handleDiscardEdits}
              disabled={saving}
              title="Revert to original"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ArrowUturnLeftIcon className="w-4 h-4" />
            </button>
          )}
          {/* Timestamp mode toggle */}
          {!isEditing && (
            <button
              onClick={() => {
                if (isSettingTimestamps) {
                  setPendingTimestamps(new Map());
                  setIsSettingTimestamps(false);
                } else {
                  setIsSettingTimestamps(true);
                }
              }}
              title={isSettingTimestamps ? "Cancel timestamp setting" : "Set line timestamps"}
              className={`transition-colors ${
                isSettingTimestamps
                  ? "text-violet-500"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-400"
              }`}
            >
              <ClockIcon className="w-4 h-4" />
            </button>
          )}
          {/* Annotations toggle */}
          {!isEditing && annotations.length > 0 && (
            <button
              onClick={() => setAnnotationsOpen((v) => !v)}
              title="Toggle annotations sidebar"
              className={`transition-colors ${
                annotationsOpen
                  ? "text-violet-500"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-400"
              }`}
            >
              <ChatBubbleLeftIcon className="w-4 h-4" />
            </button>
          )}
          {/* Edit toggle */}
          {!isEditing && (
            <button
              onClick={() => {
                setEditDraft(activeLyrics);
                setIsEditing(true);
                setIsSettingTimestamps(false);
              }}
              title="Edit lyrics"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="p-4">
              <EditingView
                draft={editDraft}
                onChange={setEditDraft}
                onSave={handleSaveLyrics}
                onCancel={() => setIsEditing(false)}
                saving={saving}
                textareaRef={textareaRef}
                onInsertFormat={insertFormat}
              />
            </div>
          ) : (
            <div className="px-4 py-4 max-h-[60vh] overflow-y-auto space-y-0.5">
              {isSettingTimestamps && (
                <div className="mb-3 flex items-center gap-2 text-xs text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2">
                  <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {isCurrentSong
                      ? "Tap a line while playing to set its start time"
                      : "Play this song, then tap lines to sync timestamps"}
                  </span>
                </div>
              )}
              {displayLines.map((line, i) => {
                const isActive = i === activeLineIndex;
                const ts = tsMap.get(i) ?? pendingTimestamps.get(i);
                const hasPending = pendingTimestamps.has(i);
                const ann = annMap.get(i);

                return (
                  <div key={i} ref={isActive ? activeLineRef : undefined}>
                    <div
                      onClick={() => {
                        if (isSettingTimestamps) {
                          handleLineTap(i);
                        } else if (!isEditing) {
                          // Open annotation editor inline
                          setAnnotationsOpen(true);
                          setEditingAnnotation(i);
                          setAnnotationDraft(ann ?? "");
                        }
                      }}
                      className={`group flex items-start gap-2 px-2 py-1 rounded-lg transition-colors cursor-pointer select-none ${
                        isActive
                          ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      } ${isSettingTimestamps ? "hover:bg-violet-50 dark:hover:bg-violet-900/20" : ""}`}
                    >
                      <span className="flex-1 text-sm leading-relaxed">
                        {line === "" ? <span className="opacity-0 select-none">·</span> : renderInline(line)}
                      </span>
                      <span className="flex-shrink-0 flex items-center gap-1">
                        {ts !== undefined && (
                          <span
                            className={`text-xs tabular-nums ${
                              hasPending
                                ? "text-violet-500"
                                : "text-gray-400 dark:text-gray-500"
                            }`}
                          >
                            {formatTime(ts)}
                          </span>
                        )}
                        {ann && !annotationsOpen && (
                          <ChatBubbleLeftIcon className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        )}
                      </span>
                    </div>

                    {/* Inline annotation editor */}
                    {editingAnnotation === i && (
                      <div className="ml-2 mt-1 mb-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-2 space-y-2">
                        <textarea
                          autoFocus
                          value={annotationDraft}
                          onChange={(e) => setAnnotationDraft(e.target.value)}
                          placeholder="Add a note about this line…"
                          aria-label="Line annotation"
                          rows={2}
                          className="w-full bg-transparent text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveAnnotation(i, annotationDraft)}
                            disabled={savingAnnotation}
                            className="flex items-center gap-1 text-xs px-2 py-1 bg-amber-500 hover:bg-amber-400 text-white rounded-md transition-colors"
                          >
                            <CheckIcon className="w-3 h-3" />
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingAnnotation(null); setAnnotationDraft(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                          {ann && (
                            <button
                              onClick={() => handleSaveAnnotation(i, "")}
                              className="text-xs text-red-400 hover:text-red-500 transition-colors ml-auto"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isSettingTimestamps && pendingTimestamps.size > 0 && (
                <div className="pt-3 flex items-center gap-2">
                  <button
                    onClick={handleSaveTimestamps}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                    Save {pendingTimestamps.size} timestamp{pendingTimestamps.size !== 1 ? "s" : ""}
                  </button>
                  <button
                    onClick={() => setPendingTimestamps(new Map())}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Annotations sidebar */}
        {annotationsOpen && annotations.length > 0 && !isEditing && (
          <div className="w-48 border-l border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Annotations</span>
              <button
                onClick={() => setAnnotationsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[55vh] p-2 space-y-2">
              {annotations.map((ann) => (
                <button
                  key={ann.lineIndex}
                  onClick={() => {
                    setEditingAnnotation(ann.lineIndex);
                    setAnnotationDraft(ann.body);
                  }}
                  className="w-full text-left p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    Line {ann.lineIndex + 1}
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                    {ann.body}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Version history indicator */}
      {savedEdited && !isEditing && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {showOriginal ? "Viewing original" : "Showing your edited version"}
          </span>
          <ChevronRightIcon className="w-3 h-3 text-gray-300 dark:text-gray-600" />
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="text-xs text-violet-500 hover:text-violet-400 transition-colors"
          >
            {showOriginal ? "View edited" : "Compare with original"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── EditingView sub-component ────────────────────────────────────────────────

function EditingView({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  textareaRef,
  onInsertFormat,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInsertFormat: (marker: string) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Formatting toolbar */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onInsertFormat("**"); }}
          className="px-2 py-1 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Bold (**text**)"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onInsertFormat("*"); }}
          className="px-2 py-1 text-xs italic text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Italic (*text*)"
        >
          I
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
        autoFocus
        placeholder="Enter lyrics…"
        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-colors font-mono leading-relaxed"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors min-h-[32px]"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors min-h-[32px]"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}
