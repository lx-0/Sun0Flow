import type { DigestItem } from "./types";
import { PICKS_MIN, PICKS_MAX, MAX_PER_SOURCE } from "./types";

function sourceKey(item: DigestItem): string {
  return item.feedTitle ?? "unknown";
}

export function selectPicks(allItems: DigestItem[]): DigestItem[] {
  const selected: DigestItem[] = [];
  const usedMoods = new Set<string>();
  const sourceCount = new Map<string, number>();

  function canAdd(item: DigestItem): boolean {
    return (sourceCount.get(sourceKey(item)) ?? 0) < MAX_PER_SOURCE;
  }

  function addItem(item: DigestItem) {
    selected.push(item);
    usedMoods.add(item.mood);
    const src = sourceKey(item);
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
  }

  for (const item of allItems) {
    if (selected.length >= PICKS_MAX) break;
    if (!usedMoods.has(item.mood) && canAdd(item)) {
      addItem(item);
    }
  }

  for (const item of allItems) {
    if (selected.length >= PICKS_MAX) break;
    if (!selected.includes(item) && canAdd(item)) {
      addItem(item);
    }
  }

  if (selected.length < PICKS_MIN) {
    for (const item of allItems) {
      if (selected.length >= PICKS_MIN) break;
      if (!selected.includes(item)) {
        addItem(item);
      }
    }
  }

  return selected;
}
