import { NextRequest, NextResponse } from "next/server";
import { fetchFeed } from "@/lib/rss";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { urls } = body as { urls?: unknown };
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  const validUrls = (urls as unknown[])
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    .slice(0, 10);

  if (validUrls.length === 0) {
    return NextResponse.json({ error: "No valid URLs provided" }, { status: 400 });
  }

  const feeds = await Promise.all(validUrls.map(fetchFeed));
  return NextResponse.json({ feeds });
}
