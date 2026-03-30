import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";

const VALID_DIGEST_FREQUENCIES = ["daily", "weekly", "monthly", "off"] as const;
type DigestFrequency = (typeof VALID_DIGEST_FREQUENCIES)[number];

// GET /api/settings — returns profile + notification preferences
export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      bio: true,
      avatarUrl: true,
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      accounts: { select: { provider: true, type: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const { accounts, ...rest } = user;
  return NextResponse.json({
    ...rest,
    connectedProviders: accounts.map((a: { provider: string; type: string }) => a.provider),
  });
}

// PATCH /api/settings — updates profile and/or notification preferences
export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const body = await request.json();
  const {
    name,
    bio,
    avatarUrl,
    emailWelcome,
    emailGenerationComplete,
    emailDigestFrequency,
    quietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
  } = body;

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.name = stripHtml(name).trim();
  }

  if (bio !== undefined) {
    if (bio !== null && typeof bio !== "string") {
      return NextResponse.json({ error: "Bio must be a string", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (typeof bio === "string" && bio.length > 500) {
      return NextResponse.json({ error: "Bio must be 500 characters or less", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    data.bio = bio ? stripHtml(bio).trim() : null;
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && typeof avatarUrl !== "string") {
      return NextResponse.json({ error: "Avatar URL must be a string", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (typeof avatarUrl === "string" && avatarUrl.length > 2048) {
      return NextResponse.json({ error: "Avatar URL too long", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    if (typeof avatarUrl === "string" && avatarUrl) {
      try {
        new URL(avatarUrl);
      } catch {
        return NextResponse.json({ error: "Invalid avatar URL", code: "VALIDATION_ERROR" }, { status: 400 });
      }
    }
    data.avatarUrl = avatarUrl ? avatarUrl.trim() : null;
  }

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

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      bio: true,
      avatarUrl: true,
      emailWelcome: true,
      emailGenerationComplete: true,
      emailDigestFrequency: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });

  return NextResponse.json(user);
}
