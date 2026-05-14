export function normalizeVariationTags(rawTags: string): string {
  if (!rawTags) return "remix";
  return rawTags.toLowerCase().includes("remix") ? rawTags : `${rawTags}, remix`;
}

export function variationTitle(parentTitle: string | null, explicitTitle?: string): string | null {
  if (explicitTitle?.trim()) return explicitTitle.trim();
  if (parentTitle) return `${parentTitle} (variation)`;
  return null;
}
