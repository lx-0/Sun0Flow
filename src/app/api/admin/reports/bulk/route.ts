import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";
import { bulkResolveReports, VALID_ACTIONS } from "@/lib/moderation";

const bulkActionBody = z.object({
  reportIds: z.array(z.string()).min(1).max(100),
  action: z.enum(VALID_ACTIONS),
});

export const POST = adminRoute(async (_request, { admin, body }) => {
  const result = await bulkResolveReports({
    reportIds: body.reportIds,
    adminId: admin.adminId,
    action: body.action,
  });

  return NextResponse.json(result);
}, { route: "/api/admin/reports/bulk", body: bulkActionBody });
