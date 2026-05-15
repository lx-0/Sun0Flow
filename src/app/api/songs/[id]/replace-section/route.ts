import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { replaceSection } from "@/lib/songs";
import {
  replaceSectionBody,
  type ReplaceSectionBody,
} from "@/lib/songs/variations/schemas";

export const POST = authRoute<{ id: string }, ReplaceSectionBody>(async (_request, { auth, params, body }) => {
  const result = await replaceSection(auth.userId, params.id, {
    prompt: body.prompt,
    tags: body.tags,
    title: body.title,
    infillStartS: body.infillStartS,
    infillEndS: body.infillEndS,
    negativeTags: body.negativeTags,
  });
  if (!result.ok) return resultResponse(result);

  return respondToGeneration(result.data, {
    label: "replace-section-api",
    userId: auth.userId,
    route: `/api/songs/${params.id}/replace-section`,
  });
}, { body: replaceSectionBody });
