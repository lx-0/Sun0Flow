import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { fetchFeed } from "@/lib/rss";
import { boostStyle } from "@/lib/sunoapi";
import { rankItems, buildPromptFromItem } from "@/lib/prompts";

const MAX_DAILY_PROMPTS = 5;
const CATEGORY = "auto-generated";

export async function POST(req: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(req);

    if (authError) return authError;

    let boost = false;
    try {
      const body = await req.json();
      boost = Boolean(body?.boost);
    } catch {
      // No body or invalid JSON — defaults apply
    }

    const feeds = await prisma.rssFeedSubscription.findMany({
      where: { userId },
      select: { url: true },
    });

    if (feeds.length === 0) {
      return NextResponse.json(
        { error: "No RSS feeds configured. Add feeds in Settings first.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const feedResults = await Promise.all(feeds.map((f) => fetchFeed(f.url)));

    const allItems = feedResults
      .filter((f) => !f.error)
      .flatMap((f) => f.items);

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: "No feed items found. Your RSS feeds may be empty or unreachable.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const topItems = rankItems(allItems, MAX_DAILY_PROMPTS);
    const generated = topItems.map((item) => buildPromptFromItem(item));

    if (boost) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { sunoApiKey: true },
      });
      const apiKey = user?.sunoApiKey || process.env.SUNOAPI_KEY;

      for (const entry of generated) {
        try {
          const boostInput = entry.excerpt
            ? `${entry.name}: ${entry.excerpt}`
            : entry.prompt;
          const result = await boostStyle(boostInput, apiKey ?? undefined);
          if (result.result) {
            entry.style = result.result;
          }
        } catch {
          // If boost fails, keep the original style
        }
      }
    }

    await prisma.promptTemplate.deleteMany({
      where: { userId, category: CATEGORY },
    });

    const prompts = await Promise.all(
      generated.map((entry) =>
        prisma.promptTemplate.create({
          data: {
            userId,
            name: entry.name,
            prompt: entry.prompt,
            style: entry.style || null,
            category: CATEGORY,
            description: "Auto-generated from your feed content",
            isBuiltIn: false,
            isInstrumental: false,
          },
        })
      )
    );

    const result = prompts.map((p, i) => ({
      ...p,
      excerpt: generated[i].excerpt,
    }));

    return NextResponse.json({ prompts: result });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
