import crypto from "crypto";

export const INVITE_TTL_DAYS = 7;

export function generateInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function inviteExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}
