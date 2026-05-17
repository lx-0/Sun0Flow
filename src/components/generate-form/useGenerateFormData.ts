import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCreditsSummary,
  fetchGenerationPresets,
  fetchPersonasList,
  fetchPromptSuggestions,
  fetchPromptTemplates,
  fetchRateLimitStatus,
  fetchStyleTemplateList,
  fetchTrendingStyleCombos,
} from "./api";
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

interface UseGenerateFormDataOptions {
  toast: (message: string, type: "info" | "success" | "error") => void;
}

export function useGenerateFormData({ toast }: UseGenerateFormDataOptions) {
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [presets, setPresets] = useState<GenerationPreset[]>([]);
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [trendingCombos, setTrendingCombos] = useState<TrendingStyleCombo[]>([]);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplate[]>([]);
  const [creditInfo, setCreditInfo] = useState<CreditInfo | null>(null);

  const shownLimitToast = useRef(false);

  const fetchRateLimit = useCallback(async () => {
    try {
      const status = await fetchRateLimitStatus();
      if (status) {
        setRateLimit(status);
        const used = status.limit - status.remaining;
        const pct = status.limit > 0 ? used / status.limit : 0;
        if (pct >= 0.8 && status.remaining > 0 && !shownLimitToast.current) {
          shownLimitToast.current = true;
          toast(`${status.remaining} generation${status.remaining === 1 ? "" : "s"} remaining this hour`, "info");
        }
      }
    } catch {
      // Silently fail — quota display is non-critical
    }
  }, [toast]);

  const fetchCredits = useCallback(async () => {
    try {
      const credits = await fetchCreditsSummary();
      if (credits) setCreditInfo(credits);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchPersonas = useCallback(async () => {
    try {
      const data = await fetchPersonasList();
      if (data) setPersonas(data);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await fetchPromptTemplates();
      if (data) {
        setTemplates(data.templates);
        setCategories(data.categories);
      }
    } catch {
      // Non-critical
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      const data = await fetchGenerationPresets();
      if (data) setPresets(data);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchStyleTemplates = useCallback(async () => {
    try {
      const data = await fetchStyleTemplateList();
      if (data) setStyleTemplates(data);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const data = await fetchPromptSuggestions();
      if (data) setSuggestions(data);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchTrendingCombos = useCallback(async () => {
    try {
      const data = await fetchTrendingStyleCombos();
      if (data) setTrendingCombos(data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchRateLimit();
    fetchTemplates();
    fetchPersonas();
    fetchCredits();
    fetchPresets();
    fetchStyleTemplates();
    fetchSuggestions();
    fetchTrendingCombos();
  }, [fetchRateLimit, fetchTemplates, fetchPersonas, fetchCredits, fetchPresets, fetchStyleTemplates, fetchSuggestions, fetchTrendingCombos]);

  return {
    rateLimit,
    setRateLimit,
    templates,
    setTemplates,
    categories,
    presets,
    setPresets,
    suggestions,
    trendingCombos,
    personas,
    styleTemplates,
    creditInfo,
    fetchCredits,
    fetchTemplates,
  };
}
