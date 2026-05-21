import { NextResponse } from "next/server";
import { z } from "zod";
import { registerUser } from "@/lib/auth";
import { errorFromResult, rateLimited } from "@/lib/api-error";
import { getClientIp } from "@/lib/network";
import { publicRoute } from "@/lib/route-handler";

const registerBodySchema = z.object({
  name: z.string().optional(),
  email: z.string(),
  password: z.string(),
  inviteCode: z.string().optional(),
});

export const POST = publicRoute(
  async (request, { body }) => {
    const ip = getClientIp(request);
    const result = await registerUser({
      name: body.name,
      email: body.email,
      password: body.password,
      inviteCode: body.inviteCode,
      ip,
      skipRateLimit: process.env.PLAYWRIGHT_TEST === "true",
      skipInviteGate: process.env.PLAYWRIGHT_TEST === "true",
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
  },
  {
    route: "/api/register",
    body: registerBodySchema,
  },
);
