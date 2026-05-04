const APP_NAME = "SunoFlow";

export function emailWrapper(content: string, unsubscribeUrl?: string): string {
  const footer = unsubscribeUrl
    ? `<p style="color: #888; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">
        You're receiving this because you opted in to ${APP_NAME} notifications.
        <a href="${unsubscribeUrl}" style="color: #6366f1;">Unsubscribe</a>
      </p>`
    : "";
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      ${content}
      ${footer}
    </div>
  `;
}

export function getBaseUrl(): string {
  return process.env.AUTH_URL || "http://localhost:3000";
}
