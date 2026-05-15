import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { addInstrumental } from "@/lib/songs";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const body = await _request.json();
  const result = await addInstrumental(auth.userId, params.id, {
    tags: body.tags,
    title: body.title,
  });
  if (!result.ok) return resultResponse(result);

  return respondToGeneration(result.data, {
    label: "add-instrumental-api",
    userId: auth.userId,
    route: `/api/songs/${params.id}/add-instrumental`,
  });
});
