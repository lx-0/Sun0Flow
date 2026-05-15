export interface PersonaOption {
  id: string;
  personaId: string;
  name: string;
  description: string | null;
  style: string | null;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  style: string | null;
  category: string | null;
  isInstrumental: boolean;
  isBuiltIn: boolean;
}

export interface GenerationPreset {
  id: string;
  name: string;
  title: string | null;
  stylePrompt: string | null;
  lyricsPrompt: string | null;
  isInstrumental: boolean;
  customMode: boolean;
  createdAt: string;
}

export interface StyleTemplate {
  id: string;
  name: string;
  tags: string;
  sourceSongId: string | null;
  createdAt: string;
}

export interface PromptSuggestion {
  id: string;
  label: string;
  stylePrompt: string;
  isInstrumental: boolean;
  source: "personal" | "community" | "curated";
}

export interface RateLimitMeta {
  used: number;
  pct: number;
  barColor: string;
  minsLeft: number;
  isAtLimit: boolean;
  isNearLimit: boolean;
}
