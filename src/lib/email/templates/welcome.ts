import { emailWrapper, getBaseUrl } from "../layout";

const APP_NAME = "SunoFlow";

export function welcomeEmail(name?: string | null): { subject: string; html: string } {
  const generateUrl = `${getBaseUrl()}/generate`;
  const inspireUrl = `${getBaseUrl()}/inspire`;
  const greeting = name ? `Hi ${name}` : "Hi there";

  return {
    subject: `Welcome to ${APP_NAME} — let's make some music!`,
    html: emailWrapper(`
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
    `),
  };
}
