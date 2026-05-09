import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { registerUser } from "@/lib/auth";
import { rateLimited } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

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
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json(result.user, { status: 201 });
  } catch (err) {
    logger.error({ err }, "register: error");
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
