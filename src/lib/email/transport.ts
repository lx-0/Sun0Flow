import Mailjet from "node-mailjet";
import { logger } from "@/lib/logger";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.MAILJET_API_KEY;
  const secretKey = process.env.MAILJET_SECRET_KEY;

  if (!apiKey || !secretKey) {
    logger.info(
      { toDomain: payload.to.split("@")[1], subject: payload.subject },
      "email: dev-mode (no Mailjet keys) — skipping send"
    );
    return;
  }

  const client = Mailjet.apiConnect(apiKey, secretKey);

  try {
    await client.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: {
            Email: getFromEmail(),
            Name: APP_NAME,
          },
          To: [{ Email: payload.to }],
          Subject: payload.subject,
          HTMLPart: payload.html,
        },
      ],
    });
  } catch (error) {
    logger.error({ err: error }, "email: mailjet send failed");
  }
}

const APP_NAME = "SunoFlow";

function getFromEmail(): string {
  return process.env.EMAIL_FROM || "noreply@sunoflow.com";
}
