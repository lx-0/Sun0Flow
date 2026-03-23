import { NextResponse } from "next/server";
import { googleEnabled } from "@/lib/auth";

export function GET() {
  return NextResponse.json({ google: googleEnabled });
}
