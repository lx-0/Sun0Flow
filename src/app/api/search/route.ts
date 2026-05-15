import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { CacheControl } from "@/lib/cache";
import { searchUserContent } from "@/lib/search";
import { zTrimmedParam } from "@/lib/query-params";

const searchQuery = z.object({
  q: zTrimmedParam,
});

export const GET = authRoute<Record<string, never>, undefined, z.infer<typeof searchQuery>>(async (_request, { auth, query }) => {
  const q = query.q ?? "";
  return resultResponse(await searchUserContent(auth.userId, q), {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
}, { route: "/api/search", query: searchQuery });
