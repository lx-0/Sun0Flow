import { gatherUserSignals } from "@/lib/user-signals";

export type TasteProfile = Map<string, number>;

export async function buildTasteProfile(
  userId: string,
): Promise<TasteProfile> {
  const signals = await gatherUserSignals(userId);
  return signals.tagWeights;
}
