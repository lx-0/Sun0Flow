import { NextResponse } from "next/server";
import type { TaskStatus } from "@/lib/sunoapi/types";
import { logger } from "@/lib/logger";

export interface SunoWebhookPayload {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    status?: TaskStatus;
    errorMessage?: string | null;
    response?: {
      sunoData?: Record<string, unknown>[];
    };
  };
}

export type SunoWebhookRequestParseResult =
  | {
      ok: true;
      payload: SunoWebhookPayload;
      taskId: string;
      status: TaskStatus;
    }
  | { ok: false; response: NextResponse };

export async function parseSunoWebhookRequest(
  req: Request,
  options: { secret?: string },
): Promise<SunoWebhookRequestParseResult> {
  const token = new URL(req.url).searchParams.get("token");
  if (!options.secret || token !== options.secret) {
    logger.warn({ hasToken: !!token }, "suno-webhook: invalid or missing token");
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let payload: SunoWebhookPayload;
  try {
    payload = (await req.json()) as SunoWebhookPayload;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  const taskId = payload.data?.taskId;
  const status = payload.data?.status;

  if (!taskId || !status) {
    logger.warn({ payload }, "suno-webhook: missing taskId or status");
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing taskId or status" }, { status: 400 }),
    };
  }

  return { ok: true, payload, taskId, status };
}
