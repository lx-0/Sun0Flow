import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { stripHtml } from "@/lib/sanitize";

const VALID_CATEGORIES = ["bug_report", "feature_request", "general"] as const;

const feedbackBody = z.object({
  category: z.enum(VALID_CATEGORIES),
  score: z.number().int().min(1).max(5).nullish(),
  comment: z.string().max(5000).nullish(),
  screenshotUrl: z.string().max(2000).nullish(),
  pageUrl: z.string().min(1, "pageUrl is required").max(2000),
});

export const POST = authRoute(async (request, { auth, body }) => {
  const sanitizedComment = body.comment
    ? stripHtml(body.comment).trim() || null
    : null;

  if (body.category === "bug_report" && !sanitizedComment) {
    return badRequest("comment is required for bug reports");
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;

  const feedback = await prisma.userFeedback.create({
    data: {
      userId: auth.userId,
      category: body.category,
      score: body.score ?? null,
      comment: sanitizedComment,
      screenshotUrl: body.screenshotUrl?.trim()?.slice(0, 2000) || null,
      pageUrl: body.pageUrl.trim(),
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
  });

  logger.info({ feedbackId: feedback.id, userId: auth.userId, category: body.category }, "user feedback submitted");

  return NextResponse.json({ id: feedback.id }, { status: 201 });
}, { body: feedbackBody });
