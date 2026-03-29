import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { fetchInstagramPost, isValidInstagramUrl } from "@/lib/instagram";

export async function POST(req: NextRequest) {
  const { error: authError } = await resolveUser(req);
  if (authError) return authError;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { urls } = body as { urls?: unknown };
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const validUrls = (urls as unknown[])
    .filter(
      (u): u is string => typeof u === "string" && isValidInstagramUrl(u)
    )
    .slice(0, 20);

  if (validUrls.length === 0) {
    return NextResponse.json(
      { error: "No valid Instagram URLs provided. Use post, reel, or IGTV links.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const posts = await Promise.all(validUrls.map(fetchInstagramPost));
  return NextResponse.json({ posts });
}
