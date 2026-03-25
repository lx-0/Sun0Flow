import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { stripHtml } from "@/lib/sanitize";
import { ensureFreeSubscription } from "@/lib/billing";

export async function POST(request: Request) {
  try {
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
