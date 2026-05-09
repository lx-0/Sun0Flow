import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { getAdminStats } from "@/lib/admin/stats";

export const GET = adminRoute(async () => {
  const stats = await getAdminStats();
  return NextResponse.json(stats);
});
