import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/route-handler";
import { emailDigestSend } from "@/lib/jobs/email-digest";

export const POST = cronRoute(async () => {
  const result = await emailDigestSend();
  return NextResponse.json(result);
});
