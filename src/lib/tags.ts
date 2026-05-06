export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeTagCombo(raw: string | null): string {
  return parseTags(raw).sort().join(", ");
}

export function collectSongTokens(
  songTags: { tag: { name: string } }[],
  tagsStr: string | null,
): string[] {
  return Array.from(
    new Set([
      ...songTags.map((st) => st.tag.name.toLowerCase()),
      ...parseTags(tagsStr),
    ]),
  );
}

export function tagOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const shared = b.filter((t) => setA.has(t)).length;
  return shared / Math.max(a.length, b.length);
}
