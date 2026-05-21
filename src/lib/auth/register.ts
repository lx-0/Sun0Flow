import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendVerificationEmail, sendWelcomeEmail } from "@/lib/email";
import { stripHtml } from "@/lib/sanitize";
import { ensureFreeSubscription } from "@/lib/billing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/auth/admin";
import { createVerificationToken } from "@/lib/auth/tokens";
import { validateInviteCode } from "@/lib/auth/invite";

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

export interface RegisterInput {
  name?: string;
  email: string;
  password: string;
  ip: string;
  inviteCode?: string;
  skipRateLimit?: boolean;
  skipInviteGate?: boolean;
}

export type RegisterResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; error: string; code: string; status: number; rateLimitStatus?: { limit: number; remaining: number; resetAt: string } };

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const { name, email, password, ip, inviteCode, skipRateLimit, skipInviteGate } = input;

  if (!skipRateLimit) {
    const { acquired, status: rlStatus } = await acquireAnonRateLimitSlot(
      ip,
      "register",
      REGISTER_LIMIT,
      REGISTER_WINDOW_MS,
    );
    if (!acquired) {
      return {
        ok: false,
        error: "Too many registration attempts. Please try again later.",
        code: "RATE_LIMIT",
        status: 429,
        rateLimitStatus: rlStatus,
      };
    }
  }

  if (!email || typeof email !== "string" || email.length > 255) {
    return { ok: false, error: "Invalid email", code: "VALIDATION_ERROR", status: 400 };
  }

  if (!password || typeof password !== "string" || password.length < 8 || password.length > 128) {
    return {
      ok: false,
      error: "Password must be between 8 and 128 characters",
      code: "VALIDATION_ERROR",
      status: 400,
    };
  }

  if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
    return { ok: false, error: "Name must be 100 characters or less", code: "VALIDATION_ERROR", status: 400 };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { ok: false, error: "Email already registered", code: "CONFLICT", status: 409 };
  }

  // Closed beta: registration requires a valid single-use invite code.
  // Admin emails bypass the gate so the operator can always bootstrap.
  const isAdmin = isAdminEmail(email);
  let inviteCodeId: string | null = null;
  if (!isAdmin && !skipInviteGate) {
    const invite = await validateInviteCode(inviteCode);
    if (!invite.ok) {
      return invite.reason === "missing"
        ? { ok: false, error: "An invite code is required to register.", code: "INVITE_REQUIRED", status: 403 }
        : { ok: false, error: "This invite code is invalid or has already been used.", code: "INVALID_INVITE", status: 403 };
    }
    inviteCodeId = invite.id;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const shouldAutoVerify = isAdmin;
  const verificationToken = shouldAutoVerify ? null : createVerificationToken();
  const sanitizedName = name ? stripHtml(name).trim() || null : null;

  const user = await prisma.user.create({
    data: {
      name: sanitizedName,
      email,
      passwordHash,
      verificationToken,
      emailVerified: shouldAutoVerify ? new Date() : null,
    },
  });

  // Claim the invite code atomically; the guard rejects a code consumed by a
  // concurrent registration between validation and claim.
  if (inviteCodeId) {
    const claim = await prisma.inviteCode.updateMany({
      where: { id: inviteCodeId, usedByUserId: null },
      data: { usedByUserId: user.id, usedAt: new Date() },
    });
    if (claim.count === 0) {
      await prisma.user.delete({ where: { id: user.id } }).catch((err) =>
        logger.error({ userId: user.id, err }, "register: failed to roll back user after invite race"),
      );
      return { ok: false, error: "This invite code is invalid or has already been used.", code: "INVALID_INVITE", status: 403 };
    }
  }

  if (verificationToken) {
    await sendVerificationEmail(email, verificationToken);
  }
  await sendWelcomeEmail(email, sanitizedName).catch((err) =>
    logger.error({ userId: user.id, err }, "register: failed to send welcome email"),
  );

  await ensureFreeSubscription(user.id).catch((err) =>
    logger.error({ userId: user.id, err }, "register: failed to create FREE subscription"),
  );

  return { ok: true, user: { id: user.id, email: user.email!, name: user.name } };
}
