import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { registerUser } from "@/lib/auth";
import { errorFromResult, internalError, rateLimited } from "@/lib/api-error";
import { getClientIp } from "@/lib/network";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    const { name, email, password } = await request.json();

    const result = await registerUser({
      name,
      email,
      password,
      ip,
      skipRateLimit: process.env.PLAYWRIGHT_TEST === "true",
    });

    if (!result.ok) {
      if (result.code === "RATE_LIMIT") {
        return rateLimited(result.error, {
          rateLimit: result.rateLimitStatus,
        });
      }
      return errorFromResult(result);
    }

    return NextResponse.json(result.user, { status: 201 });
  } catch (err) {
    logger.error({ err }, "register: error");
    return internalError();
  }
}
