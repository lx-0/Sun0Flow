import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { badRequest, notFound, rateLimited } from "@/lib/api-error";
import { createReport, VALID_REASONS } from "@/lib/moderation";

const createReportBody = z
  .object({
    songId: z.string().optional(),
    playlistId: z.string().optional(),
    reason: z.enum(VALID_REASONS),
    description: z.string().max(1000).optional(),
  })
  .refine(
    (data) => (data.songId ? !data.playlistId : !!data.playlistId),
    "Exactly one of songId or playlistId is required"
  );

export const POST = authRoute(async (_request, { auth, body }) => {
  const { acquired, status } = await acquireRateLimitSlot(auth.userId, "report");
  if (!acquired) {
    return rateLimited("Too many reports. Please try again later.", { rateLimit: status });
  }

  const result = await createReport(auth.userId, body);

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return notFound(result.message);
    if (result.error === "SELF_REPORT") return badRequest(result.message);
    return NextResponse.json(
      { error: result.message, code: "DUPLICATE_REPORT" },
      { status: 409 }
    );
  }

  return NextResponse.json(result.data, { status: 201 });
}, { route: "/api/reports", body: createReportBody });
