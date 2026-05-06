import { sendEmail } from "./transport";

const APP_NAME = "SunoFlow";

function getBaseUrl(): string {
  return process.env.AUTH_URL || "http://localhost:3000";
}

function emailWrapper(content: string, unsubscribeUrl?: string): string {
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

// ---------------------------------------------------------------------------
// Exported email functions — each hides template + layout + transport
// ---------------------------------------------------------------------------

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
  const baseUrl = getBaseUrl();
  const songUrl = `${baseUrl}/songs/${song.id}`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken}&type=generation_complete`;
  const title = song.title || "Your song";

  const subject = `"${title}" is ready to play`;
  const html = emailWrapper(
    `
    <h2 style="color: #111; margin-bottom: 8px;">Your song is ready! 🎶</h2>
    <p style="color: #444; line-height: 1.6;"><strong>${title}</strong> has finished generating and is ready to play.</p>
    <p style="margin: 24px 0;">
      <a href="${songUrl}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Listen Now</a>
    </p>
    <p style="color: #888; font-size: 14px;">Go to <a href="${baseUrl}/library" style="color: #6366f1;">your library</a> to see all your generations.</p>
  `,
    unsubscribeUrl
  );
  await sendEmail({ to: email, subject, html });
}

export interface WeeklyHighlightsData {
  topSongs: Array<{ id: string; title?: string | null; playCount: number }>;
  totalSongs: number;
  weekGenerations: number;
  totalPlaysReceived?: number;
  newFollowers?: number;
  recommendedSongs?: Array<{
    id: string;
    title?: string | null;
    tags?: string | null;
  }>;
}

export async function sendWeeklyHighlightsEmail(
  email: string,
  data: WeeklyHighlightsData,
  unsubscribeToken: string
): Promise<void> {
  const baseUrl = getBaseUrl();
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken}&type=weekly_highlights`;

  const topSongsHtml =
    data.topSongs.length > 0
      ? data.topSongs
          .map(
            (s) => `
        <li style="margin-bottom: 8px;">
          <a href="${baseUrl}/songs/${s.id}" style="color: #6366f1; text-decoration: none; font-weight: 500;">${s.title || "Untitled"}</a>
          <span style="color: #888; font-size: 13px;"> — ${s.playCount} plays</span>
        </li>
      `
          )
          .join("")
      : `<li style="color: #888;">No songs yet — <a href="${baseUrl}/generate" style="color: #6366f1;">generate one now</a>!</li>`;

  const recommendedHtml =
    data.recommendedSongs && data.recommendedSongs.length > 0
      ? `
      <h3 style="color: #374151; font-size: 14px; margin: 24px 0 8px;">Trending — You Might Like</h3>
      <ul style="padding-left: 20px; margin: 0;">
        ${data.recommendedSongs
          .map((s) => {
            const tag = s.tags
              ? ` <span style="color: #888; font-size: 12px;">${s.tags.split(",")[0].trim()}</span>`
              : "";
            return `<li style="margin-bottom: 8px;"><a href="${baseUrl}/songs/${s.id}" style="color: #6366f1; text-decoration: none; font-weight: 500;">${s.title || "Untitled"}</a>${tag}</li>`;
          })
          .join("")}
      </ul>
    `
      : "";

  const newFollowersHtml =
    typeof data.newFollowers === "number" && data.newFollowers > 0
      ? `<div style="margin-right: 32px;">
        <p style="color: #888; font-size: 12px; margin: 0 0 4px;">New followers</p>
        <p style="color: #111; font-size: 24px; font-weight: 700; margin: 0;">${data.newFollowers}</p>
      </div>`
      : "";

  const playsHtml =
    typeof data.totalPlaysReceived === "number"
      ? `<div style="margin-right: 32px;">
        <p style="color: #888; font-size: 12px; margin: 0 0 4px;">Total plays received</p>
        <p style="color: #111; font-size: 24px; font-weight: 700; margin: 0;">${data.totalPlaysReceived}</p>
      </div>`
      : "";

  const subject = `Your Music Recap — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  const html = emailWrapper(
    `
    <h2 style="color: #111; margin-bottom: 4px;">Your Music Recap 🎵</h2>
    <p style="color: #888; font-size: 14px; margin: 0 0 20px;">Here's what happened in your ${APP_NAME} world this week.</p>

    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 20px 0; border: 1px solid #e5e7eb;">
      <div style="display: flex; flex-wrap: wrap;">
        <div style="margin-right: 32px; margin-bottom: 8px;">
          <p style="color: #888; font-size: 12px; margin: 0 0 4px;">New songs this week</p>
          <p style="color: #111; font-size: 24px; font-weight: 700; margin: 0;">${data.weekGenerations}</p>
        </div>
        <div style="margin-right: 32px; margin-bottom: 8px;">
          <p style="color: #888; font-size: 12px; margin: 0 0 4px;">Total library</p>
          <p style="color: #111; font-size: 24px; font-weight: 700; margin: 0;">${data.totalSongs}</p>
        </div>
        ${playsHtml}
        ${newFollowersHtml}
      </div>
    </div>

    ${
      data.topSongs.length > 0
        ? `
      <h3 style="color: #374151; font-size: 14px; margin: 0 0 8px;">Your Top Songs This Week</h3>
      <ul style="padding-left: 20px; margin: 0 0 8px 0;">
        ${topSongsHtml}
      </ul>
    `
        : `<p style="color: #444; line-height: 1.6;">No new songs this week — <a href="${baseUrl}/generate" style="color: #6366f1;">generate one now</a>!</p>`
    }

    ${recommendedHtml}

    <p style="margin-top: 28px;">
      <a href="${baseUrl}/library" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Open My Library</a>
    </p>
  `,
    unsubscribeUrl
  );
  await sendEmail({ to: email, subject, html });
}
