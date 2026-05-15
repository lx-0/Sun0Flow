import OpenAI from "openai";
import { OPENAI_API_KEY } from "@/lib/env";

/**
 * Shared OpenAI client factory.
 */
export function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your .env file to enable OpenAI features."
    );
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}
