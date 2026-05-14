import OpenAI from "openai";
import { logger } from "@/lib/logger";
import { getOpenAIClient } from "@/lib/openai-client";
import { OPENAI_MODEL } from "@/lib/env";

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
  const client = getOpenAIClient();
  const model = OPENAI_MODEL;

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
      logger.error({ status: error.status, message: error.message }, "llm: openai api error");
    } else {
      logger.error({ err: error }, "llm: unexpected error");
    }
    return null;
  }
}
