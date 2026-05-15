import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { getVariationFamily, createVariation } from "@/lib/songs";
import { createVariationBody, type CreateVariationBody } from "@/lib/songs/variations/schemas";

export const GET = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await getVariationFamily(auth.userId, params.id);
  return resultResponse(result);
});

export const POST = authRoute<{ id: string }, CreateVariationBody>(
  async (_request, { auth, params, body }) => {
    const result = await createVariation(auth.userId, params.id, body);
    if (!result.ok) return resultResponse(result);

    return respondToGeneration(result.data, {
      label: "variation-api",
      userId: auth.userId,
      route: `/api/songs/${params.id}/variations`,
    });
  },
  { body: createVariationBody },
);
