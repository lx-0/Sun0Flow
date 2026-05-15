import type {
  GenerationPreset,
  PersonaOption,
  PromptSuggestion,
  PromptTemplate,
  RateLimitStatus,
  StyleTemplate,
} from "./types";

type CreditInfo = {
  creditsRemaining: number;
  budget: number;
  usagePercent: number;
  isLow: boolean;
};

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
  Array<{ id: string; combo: string; label: string; stylePrompt: string; displayScore: string }> | null
> {
  const res = await fetch("/api/suggestions/trending");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.trending ?? []) as Array<{ id: string; combo: string; label: string; stylePrompt: string; displayScore: string }>;
}
