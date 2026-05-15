import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { addVocals } from "@/lib/songs";
import { addVocalsBody, type AddVocalsBody } from "@/lib/songs/variations/schemas";

export const POST = authRoute<{ id: string }, AddVocalsBody>(async (_request, { auth, params, body }) => {
  const result = await addVocals(auth.userId, params.id, {
    prompt: body.prompt,
    style: body.style,
    title: body.title,
  });
  if (!result.ok) return resultResponse(result);

  return respondToGeneration(result.data, {
    label: "add-vocals-api",
    userId: auth.userId,
    route: `/api/songs/${params.id}/add-vocals`,
  });
}, { body: addVocalsBody });
