import type { SunoModel } from "./types";
import { WEBHOOK_BASE_URL, SUNO_WEBHOOK_SECRET } from "@/lib/env";

export const BASE_URL = "https://api.sunoapi.org/api/v1";
export const FILE_UPLOAD_BASE_URL = "https://sunoapiorg.redpandaai.co";

const NOOP_CALLBACK_URL = "https://localhost/noop";

export function getCallbackUrl(): string {
  if (!SUNO_WEBHOOK_SECRET) return NOOP_CALLBACK_URL;
  const base = WEBHOOK_BASE_URL.replace(/\/+$/, "");
  return `${base}/api/webhooks/suno?token=${encodeURIComponent(SUNO_WEBHOOK_SECRET)}`;
}

export const DEFAULT_MODEL: SunoModel = "V5_5";
