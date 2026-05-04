import { sendEmail } from "./transport";
import { emailWrapper, getBaseUrl } from "./layout";
import { generationCompleteEmail } from "./templates/generation-complete";
import { weeklyHighlightsEmail, type WeeklyHighlightsData } from "./templates/weekly-highlights";

export type { WeeklyHighlightsData };

const APP_NAME = "SunoFlow";

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const url = `${getBaseUrl()}/verify-email?token=${token}`;
  const subject = `Verify your ${APP_NAME} email`;
  const html = emailWrapper(`
    <h2 style="color: #111; margin-bottom: 16px;">Welcome to ${APP_NAME}!</h2>
    <p style="color: #444; line-height: 1.6;">Click the button below to verify your email address:</p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Verify Email</a>
    </p>
    <p style="color: #888; font-size: 14px;">Or copy this link: <a href="${url}" style="color: #6366f1;">${url}</a></p>
    <p style="color: #888; font-size: 14px;">If you didn't create an account, you can ignore this email.</p>
  `);
  await sendEmail({ to: email, subject, html });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const url = `${getBaseUrl()}/reset-password?token=${token}`;
  const subject = `Reset your ${APP_NAME} password`;
  const html = emailWrapper(`
    <h2 style="color: #111; margin-bottom: 16px;">Password Reset</h2>
    <p style="color: #444; line-height: 1.6;">Click the button below to reset your password. This link expires in 1 hour.</p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Reset Password</a>
    </p>
    <p style="color: #888; font-size: 14px;">Or copy this link: <a href="${url}" style="color: #6366f1;">${url}</a></p>
    <p style="color: #888; font-size: 14px;">If you didn't request a password reset, you can ignore this email.</p>
  `);
  await sendEmail({ to: email, subject, html });
}

export async function sendWelcomeEmail(
  email: string,
  name?: string | null
): Promise<void> {
  const generateUrl = `${getBaseUrl()}/generate`;
  const inspireUrl = `${getBaseUrl()}/inspire`;
  const greeting = name ? `Hi ${name}` : "Hi there";
  const subject = `Welcome to ${APP_NAME} — let's make some music!`;
  const html = emailWrapper(`
    <h2 style="color: #111; margin-bottom: 8px;">Welcome to ${APP_NAME}! 🎵</h2>
    <p style="color: #444; line-height: 1.6;">${greeting}, and thanks for joining ${APP_NAME}.</p>
    <p style="color: #444; line-height: 1.6;">Here's what you can do to get started:</p>
    <ul style="color: #444; line-height: 2; padding-left: 20px;">
      <li><strong>Generate music</strong> — describe the song you want and let AI create it</li>
      <li><strong>Browse inspiration</strong> — find prompts and ideas from the community</li>
      <li><strong>Organize your library</strong> — tag, playlist, and rate your creations</li>
    </ul>
    <div style="margin: 28px 0; display: flex; gap: 12px;">
      <a href="${generateUrl}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; margin-right: 12px;">Generate a Song</a>
      <a href="${inspireUrl}" style="background: #f3f4f6; color: #374151; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; border: 1px solid #d1d5db;">Get Inspired</a>
    </div>
    <p style="color: #888; font-size: 14px;">Questions? Reply to this email and we'll help you out.</p>
  `);
  await sendEmail({ to: email, subject, html });
}

export async function sendGenerationCompleteEmail(
  email: string,
  song: { id: string; title?: string | null },
  unsubscribeToken: string
): Promise<void> {
  const { subject, html } = generationCompleteEmail(song, unsubscribeToken);
  await sendEmail({ to: email, subject, html });
}

export async function sendWeeklyHighlightsEmail(
  email: string,
  data: WeeklyHighlightsData,
  unsubscribeToken: string
): Promise<void> {
  const { subject, html } = weeklyHighlightsEmail(data, unsubscribeToken);
  await sendEmail({ to: email, subject, html });
}
