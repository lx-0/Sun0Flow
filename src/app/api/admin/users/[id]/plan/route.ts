import { z } from "zod";
import { adminRoute, resultResponse } from "@/lib/route-handler";
import { changeUserPlan } from "@/lib/admin/users";

const planBody = z.object({
  tier: z.string().min(1),
});

export const POST = adminRoute<{ id: string }, z.infer<typeof planBody>>(
  async (_request, { admin, params, body }) => {
    return resultResponse(
      await changeUserPlan(params.id, body.tier, admin.adminId),
    );
  },
  { route: "/api/admin/users/[id]/plan", body: planBody },
);
