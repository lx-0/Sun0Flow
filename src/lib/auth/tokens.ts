import crypto from "crypto";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function createVerificationToken() {
  return crypto.randomUUID();
}

export function createPasswordResetTokenData(now = Date.now()) {
  return {
    resetToken: crypto.randomUUID(),
    resetTokenExpiry: new Date(now + RESET_TOKEN_TTL_MS),
  };
}

export function clearPasswordResetTokenData() {
  return {
    resetToken: null,
    resetTokenExpiry: null,
  };
}

export function createEmailVerifiedData(now = new Date()) {
  return {
    emailVerified: now,
    verificationToken: null,
  };
}
