import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feeds = await prisma.rssFeedSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, url: true, title: true, createdAt: true },
  });

  return NextResponse.json({ feeds });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    where: { userId_url: { userId: session.user.id, url: trimmed } },
  });
  if (existing) {
    return NextResponse.json({ error: "Feed already added" }, { status: 409 });
  }

  const count = await prisma.rssFeedSubscription.count({
    where: { userId: session.user.id },
  });
  if (count >= 20) {
    return NextResponse.json({ error: "Maximum 20 feeds allowed" }, { status: 400 });
  }

  const feed = await prisma.rssFeedSubscription.create({
    data: { userId: session.user.id, url: trimmed },
    select: { id: true, url: true, title: true, createdAt: true },
  });

  return NextResponse.json({ feed }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  const feed = await prisma.rssFeedSubscription.findUnique({ where: { id } });
  if (!feed || feed.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.rssFeedSubscription.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
