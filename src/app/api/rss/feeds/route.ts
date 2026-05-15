import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { badRequest, conflict, notFound } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const createFeedBody = z.object({
  url: z.string().min(1, "url is required"),
});

const deleteFeedQuery = z.object({
  id: z.string().min(1, "id query param required"),
});

export const GET = authRoute(async (_request, { auth }) => {
  const feeds = await prisma.rssFeedSubscription.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true, title: true, autoGenerate: true, createdAt: true },
  });

  return NextResponse.json({ feeds });
}, { route: "/api/rss/feeds" });

export const POST = authRoute(async (_req, { auth, body }) => {
  const trimmed = body.url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return badRequest("URL must start with http:// or https://");
  }

  const existing = await prisma.rssFeedSubscription.findUnique({
    where: { userId_url: { userId: auth.userId, url: trimmed } },
  });
  if (existing) {
    return conflict("Feed already added");
  }

  const count = await prisma.rssFeedSubscription.count({
    where: { userId: auth.userId },
  });
  if (count >= 20) {
    return badRequest("Maximum 20 feeds allowed");
  }

  const feed = await prisma.rssFeedSubscription.create({
    data: { userId: auth.userId, url: trimmed },
    select: { id: true, url: true, title: true, createdAt: true },
  });

  return NextResponse.json({ feed }, { status: 201 });
}, { route: "/api/rss/feeds", body: createFeedBody });

export const DELETE = authRoute(async (_req, { auth, query }) => {
  const feed = await prisma.rssFeedSubscription.findUnique({ where: { id: query.id } });
  if (!feed || feed.userId !== auth.userId) {
    return notFound();
  }

  await prisma.rssFeedSubscription.delete({ where: { id: query.id } });
  return NextResponse.json({ ok: true });
}, { route: "/api/rss/feeds", query: deleteFeedQuery });
