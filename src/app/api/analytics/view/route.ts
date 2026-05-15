import { z } from "zod";
import { publicRoute, resultResponse } from "@/lib/route-handler";
import { recordView } from "@/lib/analytics-data";

const bodySchema = z.object({
  songId: z.string().min(1),
});

export const POST = publicRoute<Record<string, never>, z.infer<typeof bodySchema>>(
  async (_request, { body }) => {
    return resultResponse(await recordView(body.songId), { status: 201 });
  },
  {
    route: "/api/analytics/view",
    body: bodySchema,
  },
);
