import { z } from "zod";
import { listLyricAnnotations, upsertLyricAnnotation } from "@/lib/lyrics";
import { authRoute, resultResponse } from "@/lib/route-handler";

const updateAnnotationBody = z.object({
  lineIndex: z.number(),
  body: z.string(),
});

export const GET = authRoute<{ id: string }>(
  async (_request, { auth, params }) =>
    resultResponse(await listLyricAnnotations(params.id, auth.userId)),
  { route: "/api/songs/[id]/lyrics/annotations" },
);

export const PUT = authRoute<{ id: string }, z.infer<typeof updateAnnotationBody>>(
  async (_request, { auth, params, body }) =>
    resultResponse(await upsertLyricAnnotation(params.id, auth.userId, body)),
  { route: "/api/songs/[id]/lyrics/annotations", body: updateAnnotationBody },
);
