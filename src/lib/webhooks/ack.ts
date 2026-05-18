import { NextResponse } from "next/server";

interface WebhookAckOptions {
  duplicate?: boolean;
  matched?: boolean;
}

/**
 * Shared webhook acknowledgement payload so routes remain consistent.
 */
export function webhookAck(options: WebhookAckOptions = {}): NextResponse {
  return NextResponse.json({
    received: true,
    ...(options.duplicate ? { duplicate: true } : {}),
    ...(options.matched === false ? { matched: false } : {}),
  });
}
