"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { SparklesIcon, BookmarkIcon, TrashIcon } from "@heroicons/react/24/solid";
import { BookmarkIcon as BookmarkOutline, ClockIcon, BoltIcon, UserCircleIcon, PencilSquareIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useToast } from "./Toast";
import { useGenerationPoller } from "@/hooks/useGenerationPoller";
import { GenerationProgress } from "./GenerationProgress";

interface PersonaOption {
  id: string;
  personaId: string;
  name: string;
  description: string | null;
  style: string | null;
}

interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  style: string | null;
  category: string | null;
  isInstrumental: boolean;
  isBuiltIn: boolean;
}

export function GenerateForm() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { songs: trackedSongs, trackSong, clearAll } = useGenerationPoller();

  const [title, setTitle] = useState(searchParams.get("title") ?? "");
  const [stylePrompt, setStylePrompt] = useState(searchParams.get("tags") ?? "");
  const [customMode, setCustomMode] = useState(Boolean(searchParams.get("prompt") && !searchParams.get("tags")));
  const [lyrics, setLyrics] = useState(searchParams.get("prompt") ?? "");
  const [instrumental, setInstrumental] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);

  // Template state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Persona state
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");

  // Style boost state
  const [isBoosting, setIsBoosting] = useState(false);

  // Lyrics generator state
  const [showLyricsGenerator, setShowLyricsGenerator] = useState(false);
  const [lyricsPrompt, setLyricsPrompt] = useState("");
  const [generatedLyrics, setGeneratedLyrics] = useState("");
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);

  // Track whether we've already shown the 80% toast this session
  const shownLimitToast = useRef(false);

  const fetchRateLimit = useCallback(async () => {
    try {
      const res = await fetch("/api/rate-limit");
      if (res.ok) {
        const data: RateLimitStatus = await res.json();
        setRateLimit(data);
        const used = data.limit - data.remaining;
        const pct = data.limit > 0 ? used / data.limit : 0;
        if (pct >= 0.8 && data.remaining > 0 && !shownLimitToast.current) {
          shownLimitToast.current = true;
          toast(`${data.remaining} generation${data.remaining === 1 ? "" : "s"} remaining this hour`, "info");
        }
      }
    } catch {
      // Silently fail — quota display is non-critical
    }
  }, [toast]);

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/personas");
      if (res.ok) {
        const data = await res.json();
        setPersonas(data.personas);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/prompt-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
        if (data.categories) setCategories(data.categories);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchRateLimit();
    fetchTemplates();
    fetchPersonas();
  }, [fetchRateLimit, fetchTemplates, fetchPersonas]);

  async function handleBoostStyle() {
    if (isBoosting || !stylePrompt.trim()) return;
    setIsBoosting(true);
    try {
      const res = await fetch("/api/style-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: stylePrompt.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setStylePrompt(data.result);
        toast("Style enhanced!", "success");
      } else {
        toast(data.error ?? "Style boost failed", "error");
      }
    } catch {
      toast("Style boost failed", "error");
    } finally {
      setIsBoosting(false);
    }
  }

  async function handleGenerateLyrics() {
    if (isGeneratingLyrics || !lyricsPrompt.trim()) return;
    setIsGeneratingLyrics(true);
    try {
      const res = await fetch("/api/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: lyricsPrompt.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.lyrics) {
        setGeneratedLyrics(data.lyrics);
        toast("Lyrics generated!", "success");
      } else {
        toast(data.error ?? "Lyrics generation failed", "error");
      }
    } catch {
      toast("Lyrics generation failed", "error");
    } finally {
      setIsGeneratingLyrics(false);
    }
  }

  function handleUseLyrics() {
    if (!generatedLyrics.trim()) return;
    setLyrics(generatedLyrics);
    setCustomMode(true);
    toast("Lyrics applied!", "success");
  }

  function applyTemplate(template: PromptTemplate) {
    setStylePrompt(template.style ?? "");
    setLyrics(template.prompt);
    setInstrumental(template.isInstrumental);
    if (template.style) {
      setCustomMode(false);
    } else {
      setCustomMode(true);
    }
    setShowTemplatePicker(false);
    toast(`Loaded "${template.name}" template`, "success");
  }

  async function deleteTemplate(templateId: string) {
    try {
      const res = await fetch(`/api/prompt-templates/${templateId}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        toast("Template deleted", "success");
      } else {
        const data = await res.json();
        toast(data.error ?? "Failed to delete template", "error");
      }
    } catch {
      toast("Failed to delete template", "error");
    }
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) {
      toast("Please enter a template name", "error");
      return;
    }
    const prompt = customMode ? lyrics : stylePrompt;
    if (!prompt.trim()) {
      toast("Fill in the prompt fields before saving", "error");
      return;
    }

    setIsSavingTemplate(true);
    try {
      const res = await fetch("/api/prompt-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          prompt: prompt.trim(),
          style: stylePrompt.trim() || null,
          category: templateCategory.trim() || null,
          isInstrumental: instrumental,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTemplates((prev) => [...prev, data.template]);
        setShowSaveDialog(false);
        setTemplateName("");
        setTemplateCategory("");
        fetchTemplates();
        toast(`Template "${data.template.name}" saved!`, "success");
      } else {
        toast(data.error ?? "Failed to save template", "error");
      }
    } catch {
      toast("Failed to save template", "error");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const selectedPersona = personas.find((p) => p.personaId === selectedPersonaId);
      const body = {
        prompt: customMode ? lyrics : stylePrompt,
        title: title || undefined,
        tags: stylePrompt || undefined,
        makeInstrumental: instrumental,
        personaId: selectedPersona?.personaId || undefined,
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.resetAt) {
          const resetTime = new Date(data.resetAt);
          const minutesLeft = Math.ceil((resetTime.getTime() - Date.now()) / 60000);
          toast(`Rate limit reached. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`, "error");
          if (data.rateLimit) setRateLimit(data.rateLimit);
        } else {
          toast(data.error ?? "Generation failed. Please try again.", "error");
        }
        return;
      }

      // Update rate limit from response
      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
        if (data.rateLimit.remaining <= 2 && data.rateLimit.remaining > 0) {
          toast(`${data.rateLimit.remaining} generation${data.rateLimit.remaining === 1 ? "" : "s"} remaining this hour`, "info");
        }
      }

      const song = data.songs?.[0] ?? data.song;
      const songId = song?.id ?? data.id;
      const songTitle = song?.title ?? data.title ?? (title || null);

      if (data.error) {
        toast(data.error, "error");
        return;
      }

      toast("Song generation started!", "success");
      trackSong(songId, songTitle);
    } catch {
      toast("Network error. Please check your connection and try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  const builtInTemplates = templates.filter((t) => t.isBuiltIn);
  const userTemplates = templates.filter((t) => !t.isBuiltIn);
  const filteredBuiltIn = selectedCategory
    ? builtInTemplates.filter((t) => t.category === selectedCategory)
    : builtInTemplates;
  const filteredUser = selectedCategory
    ? userTemplates.filter((t) => t.category === selectedCategory)
    : userTemplates;

  return (
    <div className="px-4 py-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Generate</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Create a new song with AI</p>
      </div>

      {/* Generation Progress */}
      <GenerationProgress songs={trackedSongs} onDismiss={clearAll} />

      {/* Template Picker Button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowTemplatePicker(!showTemplatePicker)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
        >
          <BookmarkOutline className="h-4 w-4" />
          Templates
        </button>
        <button
          type="button"
          onClick={() => setShowSaveDialog(!showSaveDialog)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <BookmarkIcon className="h-4 w-4" />
          Save as template
        </button>
      </div>

      {/* Template Picker Panel */}
      {showTemplatePicker && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3">
          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  selectedCategory === null
                    ? "bg-violet-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full capitalize transition-colors ${
                    selectedCategory === cat
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Built-in Templates Grid */}
          {filteredBuiltIn.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Starter Templates</p>
              <div className="grid grid-cols-2 gap-2">
                {filteredBuiltIn.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-white block">{t.name}</span>
                    {t.description && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.description}</span>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {t.category && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 capitalize">{t.category}</span>
                      )}
                      {t.isInstrumental && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Instrumental</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* User Templates */}
          {filteredUser.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">My Templates</p>
              <div className="grid grid-cols-2 gap-2">
                {filteredUser.map((t) => (
                  <div key={t.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white block pr-6">{t.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{t.style ?? t.prompt}</span>
                      {t.category && (
                        <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 mt-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 capitalize">{t.category}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate(t.id)}
                      className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      aria-label="Delete template"
                      title="Delete template"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {filteredBuiltIn.length === 0 && filteredUser.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
              {selectedCategory ? "No templates in this category" : "No templates yet"}
            </p>
          )}
        </div>
      )}

      {/* Save Template Dialog */}
      {showSaveDialog && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Save current settings as template</p>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            aria-label="Template name"
            maxLength={50}
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <select
            value={templateCategory}
            onChange={(e) => setTemplateCategory(e.target.value)}
            aria-label="Template category"
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          >
            <option value="">No category</option>
            <option value="pop">Pop</option>
            <option value="rock">Rock</option>
            <option value="hip-hop">Hip-Hop</option>
            <option value="electronic">Electronic</option>
            <option value="ambient">Ambient</option>
            <option value="r&b">R&B</option>
            <option value="folk">Folk</option>
            <option value="jazz">Jazz</option>
            <option value="latin">Latin</option>
            <option value="other">Other</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveAsTemplate}
              disabled={isSavingTemplate}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl transition-colors"
            >
              {isSavingTemplate ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveDialog(false); setTemplateName(""); setTemplateCategory(""); }}
              className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {userTemplates.length} / 20 templates used
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" data-tour="generate-prompt">
        {/* Title */}
        <div className="space-y-1">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Song title <span className="text-gray-500 dark:text-gray-400">(optional)</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My awesome song"
            disabled={isSubmitting}
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* Style / Genre prompt */}
        <div className="space-y-1">
          <label htmlFor="stylePrompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Style / genre
          </label>
          <div className="flex gap-2">
            <input
              id="stylePrompt"
              type="text"
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              placeholder="e.g. upbeat lo-fi hip-hop, melancholic indie folk…"
              required={!customMode}
              disabled={isSubmitting}
              className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleBoostStyle}
              disabled={isBoosting || !stylePrompt.trim() || isSubmitting}
              title="Enhance style description with AI"
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <BoltIcon className="h-4 w-4" />
              {isBoosting ? "..." : "Enhance"}
            </button>
          </div>
        </div>

        {/* Persona picker */}
        {personas.length > 0 && (
          <div className="space-y-1">
            <label htmlFor="persona" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Voice persona <span className="text-gray-500 dark:text-gray-400">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <UserCircleIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <select
                id="persona"
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                disabled={isSubmitting}
                className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">No persona</option>
                {personas.map((p) => (
                  <option key={p.personaId} value={p.personaId}>
                    {p.name}{p.style ? ` — ${p.style}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Generate Lyrics panel */}
        <div className="space-y-0">
          <button
            type="button"
            onClick={() => setShowLyricsGenerator((v) => !v)}
            className="w-full flex items-center justify-between bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl px-4 py-3 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
              <PencilSquareIcon className="h-4 w-4" />
              Generate Lyrics
            </span>
            <ChevronDownIcon
              className={`h-4 w-4 text-violet-500 dark:text-violet-400 transition-transform ${
                showLyricsGenerator ? "rotate-180" : ""
              }`}
            />
          </button>

          {showLyricsGenerator && (
            <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lyricsPrompt}
                  onChange={(e) => setLyricsPrompt(e.target.value)}
                  placeholder="Describe your song theme, mood, or topic..."
                  maxLength={200}
                  disabled={isGeneratingLyrics}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleGenerateLyrics}
                  disabled={isGeneratingLyrics || !lyricsPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap"
                >
                  {isGeneratingLyrics ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-4 w-4" />
                      Generate
                    </>
                  )}
                </button>
              </div>

              {generatedLyrics && (
                <div className="space-y-2">
                  <textarea
                    value={generatedLyrics}
                    onChange={(e) => setGeneratedLyrics(e.target.value)}
                    rows={8}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleUseLyrics}
                    className="w-full px-4 py-2.5 text-sm font-medium text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700 rounded-xl hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                  >
                    Use these lyrics
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Custom lyrics toggle */}
        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom lyrics</span>
          <button
            type="button"
            role="switch"
            aria-checked={customMode}
            onClick={() => setCustomMode((v) => !v)}
            disabled={isSubmitting}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-50 ${
              customMode ? "bg-violet-600" : "bg-gray-400 dark:bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                customMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Lyrics textarea — shown only in custom mode */}
        {customMode && (
          <div className="space-y-1">
            <label htmlFor="lyrics" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Lyrics
            </label>
            <textarea
              id="lyrics"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="[Verse 1]&#10;Your lyrics here…&#10;&#10;[Chorus]&#10;…"
              rows={8}
              required={customMode}
              disabled={isSubmitting}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none disabled:opacity-50"
            />
          </div>
        )}

        {/* Instrumental toggle */}
        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Instrumental only</span>
          <button
            type="button"
            role="switch"
            aria-checked={instrumental}
            onClick={() => setInstrumental((v) => !v)}
            disabled={isSubmitting}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-50 ${
              instrumental ? "bg-violet-600" : "bg-gray-400 dark:bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                instrumental ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Rate limit info panel */}
        {rateLimit && (() => {
          const used = rateLimit.limit - rateLimit.remaining;
          const pct = rateLimit.limit > 0 ? Math.round((used / rateLimit.limit) * 100) : 0;
          const barColor =
            pct >= 100
              ? "bg-red-500"
              : pct >= 80
                ? "bg-yellow-500"
                : "bg-green-500";
          const resetDate = new Date(rateLimit.resetAt);
          const minsLeft = Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 60000));
          const isAtLimit = rateLimit.remaining === 0;
          const isNearLimit = pct >= 80 && !isAtLimit;

          return (
            <div className="space-y-2">
              {/* Warning banner at 80% */}
              {isNearLimit && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300">
                  <span className="font-medium">{rateLimit.remaining} generation{rateLimit.remaining === 1 ? "" : "s"} remaining</span>
                </div>
              )}

              {/* Quota panel with progress bar */}
              <div className={`rounded-xl px-4 py-3 text-sm border ${
                isAtLimit
                  ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800"
                  : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={isAtLimit ? "text-red-700 dark:text-red-300 font-medium" : "text-gray-600 dark:text-gray-400"}>
                    {isAtLimit ? "Rate limit reached" : "Generation quota"}
                  </span>
                  <span className={`font-semibold ${isAtLimit ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-white"}`}>
                    {used} / {rateLimit.limit} used
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>

                {/* Reset time */}
                <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <ClockIcon className="h-3.5 w-3.5" />
                  <span>Resets in {minsLeft} minute{minsLeft === 1 ? "" : "s"}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Submit */}
        <div className="relative group">
          <button
            type="submit"
            disabled={isSubmitting || rateLimit?.remaining === 0}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 transition-colors min-h-[52px]"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
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
                <SparklesIcon className="h-5 w-5" />
                Generate
              </>
            )}
          </button>
          {/* Tooltip when limit reached */}
          {rateLimit?.remaining === 0 && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Rate limit reached — resets in {Math.max(0, Math.ceil((new Date(rateLimit.resetAt).getTime() - Date.now()) / 60000))} min
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
