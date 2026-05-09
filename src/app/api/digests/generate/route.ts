import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { generateDigest } from "@/lib/digest";

export async function POST(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const digest = await generateDigest(userId);

  if (!digest) {
    return NextResponse.json(
      { error: "No RSS feeds configured. Add feeds in Settings to generate a digest.", code: "NO_FEEDS" },
      { status: 422 }
    );
  }

  return NextResponse.json({ digest });
}
