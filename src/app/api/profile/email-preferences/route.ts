import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const VALID_DIGEST_FREQUENCIES = ["daily", "weekly", "monthly", "off"] as const;
type DigestFrequency = (typeof VALID_DIGEST_FREQUENCIES)[number];

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    emailWelcome: user.emailWelcome,
    emailGenerationComplete: user.emailGenerationComplete,
    emailDigestFrequency: user.emailDigestFrequency,
    quietHoursEnabled: user.quietHoursEnabled,
    quietHoursStart: user.quietHoursStart,
    quietHoursEnd: user.quietHoursEnd,
  });
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const { emailWelcome, emailGenerationComplete, emailDigestFrequency, quietHoursEnabled, quietHoursStart, quietHoursEnd } = body;

  const data: Record<string, unknown> = {};

  if (emailWelcome !== undefined) {
    if (typeof emailWelcome !== "boolean") {
      return NextResponse.json({ error: "emailWelcome must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.emailWelcome = emailWelcome;
  }

  if (emailGenerationComplete !== undefined) {
    if (typeof emailGenerationComplete !== "boolean") {
      return NextResponse.json({ error: "emailGenerationComplete must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.emailGenerationComplete = emailGenerationComplete;
  }

  if (emailDigestFrequency !== undefined) {
    if (!VALID_DIGEST_FREQUENCIES.includes(emailDigestFrequency as DigestFrequency)) {
      return NextResponse.json(
        { error: `emailDigestFrequency must be one of: ${VALID_DIGEST_FREQUENCIES.join(", ")}`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    data.emailDigestFrequency = emailDigestFrequency;
  }

  if (quietHoursEnabled !== undefined) {
    if (typeof quietHoursEnabled !== "boolean") {
      return NextResponse.json({ error: "quietHoursEnabled must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.quietHoursEnabled = quietHoursEnabled;
  }

  if (quietHoursStart !== undefined) {
    if (typeof quietHoursStart !== "number" || quietHoursStart < 0 || quietHoursStart > 23) {
      return NextResponse.json({ error: "quietHoursStart must be an integer 0–23", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.quietHoursStart = quietHoursStart;
  }

  if (quietHoursEnd !== undefined) {
    if (typeof quietHoursEnd !== "number" || quietHoursEnd < 0 || quietHoursEnd > 23) {
      return NextResponse.json({ error: "quietHoursEnd must be an integer 0–23", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.quietHoursEnd = quietHoursEnd;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  // Ensure user has an unsubscribe token
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { unsubscribeToken: true },
  });
  if (!existing?.unsubscribeToken) {
    data.unsubscribeToken = crypto.randomUUID();
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });

  return NextResponse.json({
    emailWelcome: user.emailWelcome,
    emailGenerationComplete: user.emailGenerationComplete,
    emailDigestFrequency: user.emailDigestFrequency,
    quietHoursEnabled: user.quietHoursEnabled,
    quietHoursStart: user.quietHoursStart,
    quietHoursEnd: user.quietHoursEnd,
  });
}
