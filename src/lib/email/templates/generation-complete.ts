import { emailWrapper, getBaseUrl } from "../layout";

export function generationCompleteEmail(
  song: { id: string; title?: string | null },
  unsubscribeToken: string
): { subject: string; html: string } {
  const baseUrl = getBaseUrl();
  const songUrl = `${baseUrl}/songs/${song.id}`;
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken}&type=generation_complete`;
  const title = song.title || "Your song";

  return {
    subject: `"${title}" is ready to play`,
    html: emailWrapper(
      `
      <h2 style="color: #111; margin-bottom: 8px;">Your song is ready! 🎶</h2>
      <p style="color: #444; line-height: 1.6;"><strong>${title}</strong> has finished generating and is ready to play.</p>
      <p style="margin: 24px 0;">
        <a href="${songUrl}" style="background: #6366f1; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Listen Now</a>
      </p>
      <p style="color: #888; font-size: 14px;">Go to <a href="${baseUrl}/library" style="color: #6366f1;">your library</a> to see all your generations.</p>
    `,
      unsubscribeUrl
    ),
  };
}
