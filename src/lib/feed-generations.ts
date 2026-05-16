import type { PendingFeedGeneration } from "@prisma/client";
import { conflict } from "@/lib/api-error";

export type FeedGenerationPatchInput = {
  status?: string;
  prompt?: string;
  style?: string;
};

export function ensurePendingFeedGeneration(
  item: Pick<PendingFeedGeneration, "status">,
  action: "updated" | "approved",
) {
  if (item.status !== "pending") {
    return conflict(`Only pending items can be ${action}`);
  }
  return null;
}

export function buildFeedGenerationPatchData(
  body: FeedGenerationPatchInput,
): Record<string, string> {
  const updateData: Record<string, string> = {};
  if (body.status === "dismissed") updateData.status = "dismissed";
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    updateData.prompt = body.prompt.trim();
  }
  if (typeof body.style === "string") updateData.style = body.style;
  return updateData;
}
