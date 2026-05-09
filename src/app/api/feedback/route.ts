import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { stripHtml } from "@/lib/sanitize";

const VALID_CATEGORIES = ["bug_report", "feature_request", "general"];

export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { category, score, comment, screenshotUrl, pageUrl } = body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (score !== undefined && score !== null && (typeof score !== "number" || score < 1 || score > 5)) {
      return NextResponse.json(
        { error: "score must be an integer between 1 and 5", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    let sanitizedComment: string | null = null;
    if (comment !== undefined && comment !== null) {
      if (typeof comment !== "string") {
        return NextResponse.json({ error: "comment must be a string", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      const stripped = stripHtml(comment).trim();
      if (stripped.length > 5000) {
        return NextResponse.json({ error: "comment must be 5000 characters or fewer", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      sanitizedComment = stripped || null;
    }

    if (category === "bug_report" && !sanitizedComment) {
      return NextResponse.json(
        { error: "comment is required for bug reports", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!pageUrl || typeof pageUrl !== "string") {
      return NextResponse.json(
        { error: "pageUrl is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (pageUrl.length > 2000) {
      return NextResponse.json({ error: "pageUrl must be 2000 characters or fewer", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent") ?? undefined;

    const feedback = await prisma.userFeedback.create({
      data: {
        userId,
        category,
        score: score ?? null,
        comment: sanitizedComment,
        screenshotUrl: screenshotUrl?.trim()?.slice(0, 2000) || null,
        pageUrl: pageUrl.trim(),
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });

    logger.info({ feedbackId: feedback.id, userId, category }, "user feedback submitted");

    return NextResponse.json({ id: feedback.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
