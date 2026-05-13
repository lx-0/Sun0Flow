import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/route-handler";
import { googleEnabled } from "@/lib/auth";

export const GET = publicRoute(async () => {
  return NextResponse.json({ google: googleEnabled });
}, { route: "/api/auth/providers-config" });
