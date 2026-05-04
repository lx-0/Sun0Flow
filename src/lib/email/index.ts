import { sendEmail } from "./transport";
import { verificationEmail } from "./templates/verification";
import { passwordResetEmail } from "./templates/password-reset";
import { welcomeEmail } from "./templates/welcome";
import { generationCompleteEmail } from "./templates/generation-complete";
import { weeklyHighlightsEmail, type WeeklyHighlightsData } from "./templates/weekly-highlights";

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const { subject, html } = verificationEmail(token);
  await sendEmail({ to: email, subject, html });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const { subject, html } = passwordResetEmail(token);
  await sendEmail({ to: email, subject, html });
}

export async function sendWelcomeEmail(
  email: string,
  name?: string | null
): Promise<void> {
  const { subject, html } = welcomeEmail(name);
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
