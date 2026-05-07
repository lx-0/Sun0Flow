import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/route-handler";
import { badRequest, notFound } from "@/lib/api-error";
import { resolveReport, VALID_ACTIONS } from "@/lib/moderation";

const resolveReportBody = z.object({
  action: z.enum(VALID_ACTIONS),
  adminNote: z.string().max(1000).optional(),
});

type ResolveBody = z.infer<typeof resolveReportBody>;

export const PATCH = adminRoute<{ id: string }, ResolveBody>(async (_request, { admin, params, body }) => {
  const result = await resolveReport({
    reportId: params.id,
    adminId: admin.adminId,
    action: body.action,
    adminNote: body.adminNote,
  });

  if ("error" in result) {
    const msg = result.message as string;
    if (result.error === "NOT_FOUND") return notFound(msg);
    return badRequest(msg);
  }

  return NextResponse.json(result.data);
}, { route: "/api/admin/reports/[id]", body: resolveReportBody });
