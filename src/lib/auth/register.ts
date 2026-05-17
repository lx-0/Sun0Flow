import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendVerificationEmail, sendWelcomeEmail } from "@/lib/email";
import { stripHtml } from "@/lib/sanitize";
import { ensureFreeSubscription } from "@/lib/billing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/auth/admin";

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

export interface RegisterInput {
  name?: string;
  email: string;
  password: string;
  ip: string;
  skipRateLimit?: boolean;
}

export type RegisterResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; error: string; code: string; status: number; rateLimitStatus?: { limit: number; remaining: number; resetAt: string } };

export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const { name, email, password, ip, skipRateLimit } = input;

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

  const passwordHash = await bcrypt.hash(password, 12);
  const shouldAutoVerify = isAdminEmail(email);
  const verificationToken = shouldAutoVerify ? null : crypto.randomUUID();
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
