import { adminRoute, resultResponse } from "@/lib/route-handler";
import { toggleUserEnabled } from "@/lib/admin/users";

export const POST = adminRoute<{ id: string }>(async (_request, { admin, params }) => {
  return resultResponse(await toggleUserEnabled(params.id, admin.adminId));
});
