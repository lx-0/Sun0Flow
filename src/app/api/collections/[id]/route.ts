import { resultResponse } from "@/lib/route-handler";
import { getCollection } from "@/lib/collections";
import { CacheControl } from "@/lib/cache";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return resultResponse(await getCollection(id), {
    headers: { "Cache-Control": CacheControl.publicShort },
  });
}
