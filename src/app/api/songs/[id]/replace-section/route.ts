import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { replaceSection } from "@/lib/songs";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const body = await _request.json();
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
});
