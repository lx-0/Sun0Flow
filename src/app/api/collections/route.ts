import { resultResponse } from "@/lib/route-handler";
import { listCollections } from "@/lib/collections";
import { CacheControl } from "@/lib/cache";

export async function GET() {
  return resultResponse(await listCollections(), {
    headers: { "Cache-Control": CacheControl.publicShort },
  });
}
