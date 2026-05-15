import { z } from "zod";
import { adminRoute, resultResponse } from "@/lib/route-handler";
import { adjustUserCredits } from "@/lib/admin/users";

const creditBody = z.object({
  amount: z.number().int().refine((n) => n !== 0, "amount must be non-zero"),
  reason: z.string().max(200).default("Admin adjustment"),
});

export const POST = adminRoute<{ id: string }, z.infer<typeof creditBody>>(
  async (_request, { admin, params, body }) => {
    return resultResponse(
      await adjustUserCredits(params.id, body.amount, body.reason, admin.adminId),
    );
  },
  { route: "/api/admin/users/[id]/credits", body: creditBody },
);
