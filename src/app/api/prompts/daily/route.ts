import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CATEGORY = "auto-generated";

/**
 * GET /api/prompts/daily
 *
 * Returns the user's auto-generated prompt templates (daily inspiration queue).
 * If none exist yet, returns an empty array — the client should call
 * POST /api/prompts/generate to populate them.
 */
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const prompts = await prisma.promptTemplate.findMany({
      where: {
        userId: userId,
        category: CATEGORY,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Include staleness info — prompts older than 24h should be refreshed
    const stale =
      prompts.length === 0 ||
      prompts.some(
        (p) => Date.now() - new Date(p.createdAt).getTime() > 24 * 60 * 60 * 1000
      );

    return NextResponse.json({ prompts, stale });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
