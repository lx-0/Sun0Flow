import { prisma } from "@/lib/prisma";
import { success, Err } from "./result";

export const VALID_STYLES = [
  "pop", "rock", "electronic", "hip-hop", "jazz", "classical",
  "r&b", "country", "folk", "ambient", "metal", "latin",
  "instrumental", "lo-fi", "cinematic",
] as const;

const MAX_GENRES = 10;

function sanitizeGenre(genre: string): string {
  return genre.trim().toLowerCase().slice(0, 50);
}

export async function getPreferences(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultStyle: true, preferredGenres: true },
  });

  if (!user) return Err.notFound("User not found");

  return success({
    defaultStyle: user.defaultStyle,
    preferredGenres: user.preferredGenres,
    availableStyles: VALID_STYLES as readonly string[],
  });
}

export interface PreferencesUpdateInput {
  defaultStyle?: string | null;
  preferredGenres?: unknown[];
}

export async function updatePreferences(
  userId: string,
  input: PreferencesUpdateInput,
) {
  const data: Record<string, unknown> = {};

  if (input.defaultStyle !== undefined) {
    if (input.defaultStyle !== null && typeof input.defaultStyle !== "string") {
      return Err.validation("Default style must be a string");
    }
    if (input.defaultStyle && !VALID_STYLES.includes(input.defaultStyle.toLowerCase() as typeof VALID_STYLES[number])) {
      return Err.validation(`Invalid style. Choose from: ${VALID_STYLES.join(", ")}`);
    }
    data.defaultStyle = input.defaultStyle ? input.defaultStyle.toLowerCase() : null;
  }

  if (input.preferredGenres !== undefined) {
    if (!Array.isArray(input.preferredGenres)) {
      return Err.validation("Preferred genres must be an array");
    }
    if (input.preferredGenres.length > MAX_GENRES) {
      return Err.validation(`Maximum ${MAX_GENRES} preferred genres`);
    }
    if (input.preferredGenres.some((g: unknown) => typeof g !== "string" || !g.trim())) {
      return Err.validation("Each genre must be a non-empty string");
    }
    data.preferredGenres = (input.preferredGenres as string[])
      .map(sanitizeGenre)
      .filter(Boolean);
  }

  if (Object.keys(data).length === 0) {
    return Err.validation("No fields to update");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { defaultStyle: true, preferredGenres: true },
  });

  return success(user);
}
