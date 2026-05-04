import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { notFound } from "@/lib/api-error";

export const GET = authRoute(async (_request, { auth }) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
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
    return notFound("User not found");
  }

  const { accounts, ...rest } = user;
  return NextResponse.json({
    ...rest,
    connectedProviders: accounts.map((a: { provider: string; type: string }) => a.provider),
  });
}, { route: "/api/settings" });

const updateSettingsBody = z
  .object({
    name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less").optional(),
    bio: z.string().max(500, "Bio must be 500 characters or less").nullable().optional(),
    avatarUrl: z.string().url("Invalid avatar URL").max(2048, "Avatar URL too long").nullable().optional(),
    emailWelcome: z.boolean().optional(),
    emailGenerationComplete: z.boolean().optional(),
    emailDigestFrequency: z.enum(["daily", "weekly", "monthly", "off"]).optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z.number().int().min(0).max(23, "quietHoursStart must be an integer 0–23").optional(),
    quietHoursEnd: z.number().int().min(0).max(23, "quietHoursEnd must be an integer 0–23").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "No fields to update");

export const PATCH = authRoute(async (_request, { auth, body }) => {
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    data.name = stripHtml(body.name).trim();
  }
  if (body.bio !== undefined) {
    data.bio = body.bio ? stripHtml(body.bio).trim() : null;
  }
  if (body.avatarUrl !== undefined) {
    data.avatarUrl = body.avatarUrl ? body.avatarUrl.trim() : null;
  }
  if (body.emailWelcome !== undefined) data.emailWelcome = body.emailWelcome;
  if (body.emailGenerationComplete !== undefined) data.emailGenerationComplete = body.emailGenerationComplete;
  if (body.emailDigestFrequency !== undefined) data.emailDigestFrequency = body.emailDigestFrequency;
  if (body.quietHoursEnabled !== undefined) data.quietHoursEnabled = body.quietHoursEnabled;
  if (body.quietHoursStart !== undefined) data.quietHoursStart = body.quietHoursStart;
  if (body.quietHoursEnd !== undefined) data.quietHoursEnd = body.quietHoursEnd;

  const user = await prisma.user.update({
    where: { id: auth.userId },
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
}, { route: "/api/settings", body: updateSettingsBody });
