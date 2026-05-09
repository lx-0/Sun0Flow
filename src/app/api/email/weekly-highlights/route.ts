import { NextRequest, NextResponse } from "next/server";
import { emailDigestSend } from "@/lib/jobs/email-digest";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await emailDigestSend();
  return NextResponse.json(result);
}
