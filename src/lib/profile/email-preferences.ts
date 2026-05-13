export const EMAIL_PREFERENCES_SELECT = {
  emailWelcome: true,
  emailGenerationComplete: true,
  emailDigestFrequency: true,
  quietHoursEnabled: true,
  quietHoursStart: true,
  quietHoursEnd: true,
} as const;

export type EmailPreferences = {
  emailWelcome: boolean;
  emailGenerationComplete: boolean;
  emailDigestFrequency: "daily" | "weekly" | "monthly" | "off";
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
};

const VALID_DIGEST_FREQUENCIES = new Set<EmailPreferences["emailDigestFrequency"]>([
  "daily",
  "weekly",
  "monthly",
  "off",
]);

function normalizeDigestFrequency(
  value: string
): EmailPreferences["emailDigestFrequency"] {
  return VALID_DIGEST_FREQUENCIES.has(value as EmailPreferences["emailDigestFrequency"])
    ? (value as EmailPreferences["emailDigestFrequency"])
    : "off";
}

export function toEmailPreferencesResponse(user: Omit<EmailPreferences, "emailDigestFrequency"> & { emailDigestFrequency: string }): EmailPreferences {
  return {
    emailWelcome: user.emailWelcome,
    emailGenerationComplete: user.emailGenerationComplete,
    emailDigestFrequency: normalizeDigestFrequency(user.emailDigestFrequency),
    quietHoursEnabled: user.quietHoursEnabled,
    quietHoursStart: user.quietHoursStart,
    quietHoursEnd: user.quietHoursEnd,
  };
}

export function buildEmailPreferencesUpdateData(payload: {
  emailWelcome?: boolean;
  emailGenerationComplete?: boolean;
  emailDigestFrequency?: "daily" | "weekly" | "monthly" | "off";
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (payload.emailWelcome !== undefined) data.emailWelcome = payload.emailWelcome;
  if (payload.emailGenerationComplete !== undefined) data.emailGenerationComplete = payload.emailGenerationComplete;
  if (payload.emailDigestFrequency !== undefined) data.emailDigestFrequency = payload.emailDigestFrequency;
  if (payload.quietHoursEnabled !== undefined) data.quietHoursEnabled = payload.quietHoursEnabled;
  if (payload.quietHoursStart !== undefined) data.quietHoursStart = payload.quietHoursStart;
  if (payload.quietHoursEnd !== undefined) data.quietHoursEnd = payload.quietHoursEnd;

  return data;
}
