import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { queryGenerations } from "@/lib/generations";

export const GET = authRoute(async (request, { auth }) => {
  const params = request.nextUrl.searchParams;

  const result = await queryGenerations(auth.userId, {
    status: params.get("status") || "",
    source: params.get("source") || "",
    q: params.get("q")?.trim() || "",
    dateFrom: params.get("dateFrom") || "",
    dateTo: params.get("dateTo") || "",
    sortBy: params.get("sortBy") || "newest",
    cursor: params.get("cursor") || "",
  });

  return NextResponse.json(result);
}, { route: "/api/generations" });
