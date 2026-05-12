import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";
import { generatePromptsFromFeeds } from "@/lib/prompts";

export const POST = authRoute(async (req, { auth }) => {
  let boost = false;
  try {
    const body = await req.json();
    boost = Boolean(body?.boost);
  } catch {
    // No body or invalid JSON — defaults apply
  }

  try {
    const result = await generatePromptsFromFeeds(auth.userId, { boost });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    return NextResponse.json({ prompts: result.prompts });
  } catch (error) {
    logServerError("prompts-generate", error, { route: "/api/prompts/generate", userId: auth.userId });
    return internalError();
  }
}, {
  route: "/api/prompts/generate",
});
