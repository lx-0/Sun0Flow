import { emailWrapper, getBaseUrl } from "../layout";

const APP_NAME = "SunoFlow";

export function passwordResetEmail(token: string): { subject: string; html: string } {
  const url = `${getBaseUrl()}/reset-password?token=${token}`;
  return {
    subject: `Reset your ${APP_NAME} password`,
    html: emailWrapper(`
      <h2 style="color: #111; margin-bottom: 16px;">Password Reset</h2>
      <p style="color: #444; line-height: 1.6;">Click the button below to reset your password. This link expires in 1 hour.</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Reset Password</a>
      </p>
      <p style="color: #888; font-size: 14px;">Or copy this link: <a href="${url}" style="color: #6366f1;">${url}</a></p>
      <p style="color: #888; font-size: 14px;">If you didn't request a password reset, you can ignore this email.</p>
    `),
  };
}
