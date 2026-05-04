export function buildPrompt(title: string, mood: string, topics: string[]): string {
  const parts: string[] = [];
  if (mood && mood !== "neutral") parts.push(`${mood} vibe`);
  if (topics.length > 0) parts.push(topics.slice(0, 3).join(", "));
  if (title && title.length > 5 && title.length < 80) parts.push(`"${title}"`);
  return parts.length > 0 ? parts.join(" — ") : title.slice(0, 100);
}
