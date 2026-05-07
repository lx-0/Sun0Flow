import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { exportUserData } from "@/lib/data-export";

export const GET = authRoute(async (request, { auth }) => {
  const { searchParams } = new URL(request.url);
  const result = await exportUserData(
    auth.userId,
    searchParams.get("format") ?? "json",
    searchParams.get("type") ?? "all",
  );

  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );

  return new NextResponse(result.data.content, {
    status: 200,
    headers: {
      "Content-Type": result.data.contentType,
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
    },
  });
}, { route: "/api/export" });
