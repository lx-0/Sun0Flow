import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { generateText } from "@/lib/llm";

const requestSchema = z.object({
  currentGenres: z.array(z.string()),
  partial: z.string().optional(),
});

function normalizeSuggestions(raw: unknown, currentGenres: string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const excluded = new Set(currentGenres.map((genre) => genre.toLowerCase()));
  return raw
    .filter((g): g is string => typeof g === "string" && Boolean(g.trim()))
    .map((g) => g.trim().toLowerCase().slice(0, 50))
    .filter((g) => !excluded.has(g));
}

function extractSuggestions(result: string, currentGenres: string[]): string[] {
  try {
    return normalizeSuggestions(JSON.parse(result.trim()), currentGenres);
  } catch {
    const match = result.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      return normalizeSuggestions(JSON.parse(match[0]), currentGenres);
    } catch {
      return [];
    }
  }
}

export const POST = authRoute(async (_request, { body }) => {
  const { currentGenres, partial } = body;

  const systemPrompt = `You are a music genre expert. Given a list of music genres a user already likes, suggest related genres they might also enjoy. Return ONLY a JSON array of 5-8 genre name strings, nothing else. Each genre should be short (1-4 words), lowercase. Do not repeat genres already in the user's list.`;

  const userPrompt = partial
    ? `Current genres: ${currentGenres.join(", ") || "none"}. Suggest genres related to "${partial}" that the user might like.`
    : `Current genres: ${currentGenres.join(", ") || "none"}. Suggest related genres the user might like.`;

  const result = await generateText(systemPrompt, userPrompt);

  if (!result) {
    return NextResponse.json({ suggestions: [] });
  }

  return NextResponse.json({ suggestions: extractSuggestions(result, currentGenres) });
}, {
  route: "/api/profile/genres/suggest",
  body: requestSchema,
});
