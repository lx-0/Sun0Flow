import { NextResponse } from "next/server";
import { recordView } from "@/lib/analytics-data";
import { logServerError } from "@/lib/error-logger";
import { internalError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    const { songId } = await request.json();
    const result = await recordView(songId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    logServerError("POST /api/analytics/view", error, { route: "/api/analytics/view" });
    return internalError();
  }
}
