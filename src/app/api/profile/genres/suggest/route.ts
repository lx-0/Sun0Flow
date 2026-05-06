import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { generateText } from "@/lib/llm";

export async function POST(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;
  void userId;

  const body = await request.json();
  const { currentGenres, partial } = body;

  if (!Array.isArray(currentGenres)) {
    return NextResponse.json({ error: "currentGenres must be an array", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const systemPrompt = `You are a music genre expert. Given a list of music genres a user already likes, suggest related genres they might also enjoy. Return ONLY a JSON array of 5-8 genre name strings, nothing else. Each genre should be short (1-4 words), lowercase. Do not repeat genres already in the user's list.`;

  const userPrompt = partial
    ? `Current genres: ${currentGenres.join(", ") || "none"}. Suggest genres related to "${partial}" that the user might like.`
    : `Current genres: ${currentGenres.join(", ") || "none"}. Suggest related genres the user might like.`;

  const result = await generateText(systemPrompt, userPrompt);

  if (!result) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const parsed = JSON.parse(result.trim());
    if (!Array.isArray(parsed)) throw new Error("Not an array");
    const suggestions = parsed
      .filter((g: unknown) => typeof g === "string" && g.trim())
      .map((g: string) => g.trim().toLowerCase().slice(0, 50))
      .filter((g: string) => !currentGenres.map((c: string) => c.toLowerCase()).includes(g));
    return NextResponse.json({ suggestions });
  } catch {
    // Try to extract JSON array from response
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const suggestions = parsed
          .filter((g: unknown) => typeof g === "string" && g.trim())
          .map((g: string) => g.trim().toLowerCase().slice(0, 50))
          .filter((g: string) => !currentGenres.map((c: string) => c.toLowerCase()).includes(g));
        return NextResponse.json({ suggestions });
      } catch {
        // fall through
      }
    }
    return NextResponse.json({ suggestions: [] });
  }
}
