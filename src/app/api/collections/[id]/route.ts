import { publicRoute, resultResponse } from "@/lib/route-handler";
import { getCollection } from "@/lib/collections";
import { CacheControl } from "@/lib/cache";

export const GET = publicRoute<{ id: string }>(async (_req, { params }) => {
  return resultResponse(await getCollection(params.id), {
    headers: { "Cache-Control": CacheControl.publicShort },
  });
}, { route: "/api/collections/[id]" });
