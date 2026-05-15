import { publicRoute, resultResponse } from "@/lib/route-handler";
import { listCollections } from "@/lib/collections";
import { CacheControl } from "@/lib/cache";

export const GET = publicRoute(async () => {
  return resultResponse(await listCollections(), {
    headers: { "Cache-Control": CacheControl.publicShort },
  });
}, { route: "/api/collections" });
