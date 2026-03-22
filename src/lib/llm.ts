import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your .env file to enable LLM features."
    );
  }
  return new OpenAI({ apiKey });
}

/**
 * Generate text using OpenAI's chat completions API.
 *
 * @param systemPrompt - Instructions for the model's behavior
 * @param userPrompt - The user's input/request
 * @returns The generated text, or null if generation fails
 *
 * @example
 * ```ts
 * const lyrics = await generateText(
 *   "You are a songwriter. Write lyrics for the given theme.",
 *   "Write a verse about ocean waves"
 * );
 * ```
 */
export async function generateText(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content ?? null;
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error(`[llm] OpenAI API error (${error.status}): ${error.message}`);
    } else {
      console.error("[llm] Unexpected error:", error);
    }
    return null;
  }
}
