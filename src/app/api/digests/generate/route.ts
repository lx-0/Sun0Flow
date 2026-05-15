import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { generateDigest } from "@/lib/digest";
import { apiError, ErrorCode } from "@/lib/api-error";

export const POST = authRoute(async (_request, { auth }) => {
  const digest = await generateDigest(auth.userId);

  if (!digest) {
    return apiError(
      "No RSS feeds configured. Add feeds in Settings to generate a digest.",
      ErrorCode.VALIDATION_ERROR,
      422,
    );
  }

  return NextResponse.json({ digest });
}, { route: "/api/digests/generate" });
