import { emailWrapper, getBaseUrl } from "../layout";

const APP_NAME = "SunoFlow";

export function verificationEmail(token: string): { subject: string; html: string } {
  const url = `${getBaseUrl()}/verify-email?token=${token}`;
  return {
    subject: `Verify your ${APP_NAME} email`,
    html: emailWrapper(`
      <h2 style="color: #111; margin-bottom: 16px;">Welcome to ${APP_NAME}!</h2>
      <p style="color: #444; line-height: 1.6;">Click the button below to verify your email address:</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Verify Email</a>
      </p>
      <p style="color: #888; font-size: 14px;">Or copy this link: <a href="${url}" style="color: #6366f1;">${url}</a></p>
      <p style="color: #888; font-size: 14px;">If you didn't create an account, you can ignore this email.</p>
    `),
  };
}
