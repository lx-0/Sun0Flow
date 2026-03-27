import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail, sendWelcomeEmail } from "@/lib/email";
import { stripHtml } from "@/lib/sanitize";
import { ensureFreeSubscription } from "@/lib/billing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

// 5 registration attempts per IP per 15 minutes
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired, status: rlStatus } = await acquireAnonRateLimitSlot(
      ip,
      "register",
      REGISTER_LIMIT,
      REGISTER_WINDOW_MS
    );
    if (!acquired) {
      return rateLimited("Too many registration attempts. Please try again later.", {
        rateLimit: rlStatus,
      });
    }

    const { name, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || email.length > 255) {
      return NextResponse.json(
        { error: "Invalid email", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (name !== undefined && (typeof name !== "string" || name.length > 100)) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: "Password must be between 8 and 128 characters", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered", code: "CONFLICT" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomUUID();

    const sanitizedName = name ? stripHtml(name).trim() || null : null;
    const user = await prisma.user.create({
      data: { name: sanitizedName, email, passwordHash, verificationToken },
    });

    await sendVerificationEmail(email, verificationToken);
    await sendWelcomeEmail(email, sanitizedName).catch((err) =>
      logger.error({ userId: user.id, err }, "register: failed to send welcome email")
    );

    // Auto-provision FREE subscription for new credential-based users
    await ensureFreeSubscription(user.id).catch((err) =>
      logger.error({ userId: user.id, err }, "register: failed to create FREE subscription")
    );

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (err) {
    logger.error({ err }, "register: error");
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
