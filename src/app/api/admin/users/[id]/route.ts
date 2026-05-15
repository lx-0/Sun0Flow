import { adminRoute, resultResponse } from "@/lib/route-handler";
import { getAdminUserDetail } from "@/lib/admin/users";

export const GET = adminRoute<{ id: string }>(async (_request, { params }) => {
  return resultResponse(await getAdminUserDetail(params.id));
});
