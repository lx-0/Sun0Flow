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
