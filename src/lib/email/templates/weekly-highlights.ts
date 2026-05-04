import { emailWrapper, getBaseUrl } from "../layout";

const APP_NAME = "SunoFlow";

export interface WeeklyHighlightsData {
  topSongs: Array<{ id: string; title?: string | null; playCount: number }>;
  totalSongs: number;
  weekGenerations: number;
  totalPlaysReceived?: number;
  newFollowers?: number;
  recommendedSongs?: Array<{ id: string; title?: string | null; tags?: string | null }>;
}

export function weeklyHighlightsEmail(
  data: WeeklyHighlightsData,
  unsubscribeToken: string
): { subject: string; html: string } {
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

  return {
    subject: `Your Music Recap — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
    html: emailWrapper(
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
    ),
  };
}
