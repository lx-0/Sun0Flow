import OpenAI from "openai";
import { logger } from "@/lib/logger";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Required for embedding-based recommendations.");
  }
  return new OpenAI({ apiKey });
}

/**
 * Build a text representation of a song suitable for embedding.
 * Combines genre/mood tags, title, and prompt keywords.
 */
export function buildSongEmbeddingText(song: {
  title: string | null;
  tags: string | null;
  prompt: string | null;
  lyrics: string | null;
}): string {
  const parts: string[] = [];

  if (song.tags) {
    parts.push(`genres and mood: ${song.tags}`);
  }
  if (song.title) {
    parts.push(`title: ${song.title}`);
  }
  if (song.prompt) {
    // Truncate prompt to avoid token limits; first 300 chars capture style intent
    parts.push(`style: ${song.prompt.slice(0, 300)}`);
  }
  if (song.lyrics) {
    // Extract first ~200 chars of lyrics for keyword context
    const lyricsSnippet = song.lyrics.replace(/\n+/g, " ").trim().slice(0, 200);
    if (lyricsSnippet.length > 20) {
      parts.push(`lyrics: ${lyricsSnippet}`);
    }
  }

  return parts.join("; ") || "instrumental music";
}

/**
 * Generate an embedding vector for the given text via OpenAI.
 * Returns null on failure rather than throwing.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getClient();
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // stay well within 8191 token limit
      dimensions: EMBEDDING_DIMENSIONS,
    });
    return response.data[0]?.embedding ?? null;
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logger.error({ status: error.status, message: error.message }, "embeddings: openai api error");
    } else {
      logger.error({ err: error }, "embeddings: unexpected error");
    }
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in a single batched API call.
 * Returns an array aligned with the input; null entries indicate failures.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const client = getClient();
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts.map((t) => t.slice(0, 8000)),
      dimensions: EMBEDDING_DIMENSIONS,
    });
    // API returns results in the same order as input
    const result: (number[] | null)[] = new Array(texts.length).fill(null);
    for (const item of response.data) {
      result[item.index] = item.embedding;
    }
    return result;
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      logger.error({ status: error.status, message: error.message }, "embeddings: batch api error");
    } else {
      logger.error({ err: error }, "embeddings: batch unexpected error");
    }
    return texts.map(() => null);
  }
}

/**
 * Compute cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1]; higher is more similar.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute the centroid (mean vector) of a list of embedding vectors.
 * Used to aggregate a user's listening profile into a single query vector.
 */
export function computeCentroid(embeddings: number[][]): number[] | null {
  if (embeddings.length === 0) return null;
  const dims = embeddings[0].length;
  const centroid = new Array(dims).fill(0);
  for (const vec of embeddings) {
    for (let i = 0; i < dims; i++) {
      centroid[i] += vec[i];
    }
  }
  for (let i = 0; i < dims; i++) {
    centroid[i] /= embeddings.length;
  }
  return centroid;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
