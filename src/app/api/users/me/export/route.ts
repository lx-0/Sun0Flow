import { NextRequest, NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";
import { exportGdprZip } from "@/lib/data-export";

const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXPORT_LIMIT = 1;

export const GET = authRoute(async (_request: NextRequest, { auth }) => {
  const { acquired, status: rlStatus } = await acquireRateLimitSlot(
    auth.userId,
    "gdpr_export",
    EXPORT_LIMIT,
    EXPORT_WINDOW_MS
  );

  if (!acquired) {
    return rateLimited(
      "You can only request a data export once every 24 hours.",
      {
        rateLimit: {
          limit: rlStatus.limit,
          remaining: rlStatus.remaining,
          resetAt: rlStatus.resetAt,
        },
      }
    );
  }

  const result = await exportGdprZip(auth.userId);
  if (!result.ok) return resultResponse(result);

  const { zipBuffer, filename } = result.data;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.byteLength),
      "X-RateLimit-Limit": String(rlStatus.limit),
      "X-RateLimit-Remaining": String(rlStatus.remaining),
      "X-RateLimit-Reset": rlStatus.resetAt,
    },
  });
}, { route: "/api/users/me/export" });
