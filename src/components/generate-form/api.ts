import type {
  CreditInfo,
  GenerationPreset,
  PersonaOption,
  PromptSuggestion,
  PromptTemplate,
  RateLimitStatus,
  StyleTemplate,
  TrendingStyleCombo,
} from "./types";

type ApiError = {
  error?: string;
};

async function postJson<TResponse>(url: string, body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  data: TResponse & ApiError;
}> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: TResponse & ApiError;
  try {
    data = (await res.json()) as TResponse & ApiError;
  } catch {
    data = {} as TResponse & ApiError;
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
  };
}

export async function fetchRateLimitStatus(): Promise<RateLimitStatus | null> {
  const res = await fetch("/api/rate-limit");
  if (!res.ok) return null;
  return (await res.json()) as RateLimitStatus;
}

export async function fetchCreditsSummary(): Promise<CreditInfo | null> {
  const res = await fetch("/api/credits");
  if (!res.ok) return null;
  const data = await res.json();
  return {
    creditsRemaining: data.creditsRemaining,
    budget: data.budget,
    usagePercent: data.usagePercent,
    isLow: data.isLow,
  } satisfies CreditInfo;
}

export async function fetchPersonasList(): Promise<PersonaOption[] | null> {
  const res = await fetch("/api/personas");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.personas ?? []) as PersonaOption[];
}

export async function fetchPromptTemplates(): Promise<{
  templates: PromptTemplate[];
  categories: string[];
} | null> {
  const res = await fetch("/api/prompt-templates");
  if (!res.ok) return null;
  const data = await res.json();
  return {
    templates: (data.templates ?? []) as PromptTemplate[],
    categories: (data.categories ?? []) as string[],
  };
}

export async function fetchGenerationPresets(): Promise<GenerationPreset[] | null> {
  const res = await fetch("/api/presets");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.presets ?? []) as GenerationPreset[];
}

export async function fetchStyleTemplateList(): Promise<StyleTemplate[] | null> {
  const res = await fetch("/api/style-templates");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.templates ?? []) as StyleTemplate[];
}

export async function fetchPromptSuggestions(): Promise<PromptSuggestion[] | null> {
  const res = await fetch("/api/suggestions/prompts");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.suggestions ?? []) as PromptSuggestion[];
}

export async function fetchTrendingStyleCombos(): Promise<
  TrendingStyleCombo[] | null
> {
  const res = await fetch("/api/suggestions/trending");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.trending ?? []) as TrendingStyleCombo[];
}

export async function deletePromptTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/prompt-templates/${templateId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      return { ok: false, error: (data?.error as string) ?? "Failed to delete template" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete template" };
  }
}

export async function savePromptTemplate(payload: {
  name: string;
  prompt: string;
  style: string | null;
  category: string | null;
  isInstrumental: boolean;
}): Promise<{ ok: boolean; template?: PromptTemplate; error?: string }> {
  try {
    const res = await fetch("/api/prompt-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: (data?.error as string) ?? "Failed to save template" };
    }
    return { ok: true, template: data.template as PromptTemplate };
  } catch {
    return { ok: false, error: "Failed to save template" };
  }
}

export async function deletePreset(presetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/presets/${presetId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      return { ok: false, error: (data?.error as string) ?? "Failed to delete preset" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to delete preset" };
  }
}

export async function savePreset(payload: {
  name: string;
  title: string | null;
  stylePrompt: string | null;
  lyricsPrompt: string | null;
  isInstrumental: boolean;
  customMode: boolean;
}): Promise<{ ok: boolean; preset?: GenerationPreset; error?: string }> {
  try {
    const res = await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: (data?.error as string) ?? "Failed to save preset" };
    }
    return { ok: true, preset: data.preset as GenerationPreset };
  } catch {
    return { ok: false, error: "Failed to save preset" };
  }
}

export async function boostStylePrompt(content: string): Promise<{
  ok: boolean;
  result?: string;
  error?: string;
}> {
  const { ok, data } = await postJson<{ result?: string }>("/api/style-boost", { content });
  return { ok, result: data.result, error: data.error };
}

export async function generateLyricsFromPrompt(prompt: string): Promise<{
  ok: boolean;
  lyrics?: string;
  error?: string;
}> {
  const { ok, data } = await postJson<{ lyrics?: string }>("/api/lyrics/generate", { prompt });
  return { ok, lyrics: data.lyrics, error: data.error };
}

export async function autoFillGenerationFields(prompt: string): Promise<{
  ok: boolean;
  title?: string;
  style?: string;
  lyricsPrompt?: string;
  error?: string;
}> {
  const { ok, data } = await postJson<{ title?: string; style?: string; lyricsPrompt?: string }>(
    "/api/generate/auto",
    { prompt },
  );
  return {
    ok,
    title: data.title,
    style: data.style,
    lyricsPrompt: data.lyricsPrompt,
    error: data.error,
  };
}
