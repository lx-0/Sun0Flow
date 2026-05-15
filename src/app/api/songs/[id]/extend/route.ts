import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { extendSong } from "@/lib/songs";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const body = await _request.json();
  const result = await extendSong(auth.userId, params.id, {
    prompt: body.prompt,
    style: body.style,
    title: body.title,
    continueAt: body.continueAt,
  });
  if (!result.ok) return resultResponse(result);

  return respondToGeneration(result.data, {
    label: "extend-api",
    userId: auth.userId,
    route: `/api/songs/${params.id}/extend`,
  });
});
