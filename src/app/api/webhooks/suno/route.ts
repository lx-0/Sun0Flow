import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { SUNO_WEBHOOK_SECRET } from "@/lib/env";
import { parseSunoWebhookRequest } from "@/lib/webhooks/suno-request";
import { webhookAck } from "@/lib/webhooks/ack";
import { processSunoWebhook } from "@/lib/webhooks/suno-handler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await parseSunoWebhookRequest(req, { secret: SUNO_WEBHOOK_SECRET });
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result = await processSunoWebhook(parsed);
    if (result.kind === "not_found") return webhookAck({ matched: false });
    if (result.kind === "duplicate") return webhookAck({ duplicate: true });
  } catch (err) {
    logger.error({ err, taskId: parsed.taskId }, "suno-webhook: error processing callback");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return webhookAck();
}
