import { authRoute, resultResponse } from "@/lib/route-handler";
import { CacheControl } from "@/lib/cache";
import { searchUserContent } from "@/lib/search";

export const GET = authRoute(async (request, { auth }) => {
  const q = request.nextUrl.searchParams.get("q") || "";
  return resultResponse(await searchUserContent(auth.userId, q), {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
});
