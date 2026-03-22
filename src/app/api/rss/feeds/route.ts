import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const feeds = await prisma.rssFeedSubscription.findMany({
    where: { userId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true, title: true, createdAt: true },
  });

  return NextResponse.json({ feeds });
}

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await resolveUser(req);

  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url } = body as { url?: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
  }

  const existing = await prisma.rssFeedSubscription.findUnique({
    where: { userId_url: { userId: userId, url: trimmed } },
  });
  if (existing) {
    return NextResponse.json({ error: "Feed already added" }, { status: 409 });
  }

  const count = await prisma.rssFeedSubscription.count({
    where: { userId: userId },
  });
  if (count >= 20) {
    return NextResponse.json({ error: "Maximum 20 feeds allowed" }, { status: 400 });
  }

  const feed = await prisma.rssFeedSubscription.create({
    data: { userId: userId, url: trimmed },
    select: { id: true, url: true, title: true, createdAt: true },
  });

  return NextResponse.json({ feed }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { userId, error: authError } = await resolveUser(req);

  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  const feed = await prisma.rssFeedSubscription.findUnique({ where: { id } });
  if (!feed || feed.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.rssFeedSubscription.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
