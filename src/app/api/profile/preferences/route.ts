import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const VALID_STYLES = ["pop", "rock", "electronic", "hip-hop", "jazz", "classical", "r&b", "country", "folk", "ambient", "metal", "latin", "instrumental", "lo-fi", "cinematic"];

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultStyle: true, preferredGenres: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ defaultStyle: user.defaultStyle, preferredGenres: user.preferredGenres, availableStyles: VALID_STYLES });
}

export async function PATCH(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const body = await request.json();
  const { defaultStyle, preferredGenres } = body;

  const data: Record<string, unknown> = {};

  if (defaultStyle !== undefined) {
    if (defaultStyle !== null && typeof defaultStyle !== "string") {
      return NextResponse.json({ error: "Default style must be a string" }, { status: 400 });
    }
    if (defaultStyle && !VALID_STYLES.includes(defaultStyle.toLowerCase())) {
      return NextResponse.json({ error: `Invalid style. Choose from: ${VALID_STYLES.join(", ")}` }, { status: 400 });
    }
    data.defaultStyle = defaultStyle ? defaultStyle.toLowerCase() : null;
  }

  if (preferredGenres !== undefined) {
    if (!Array.isArray(preferredGenres)) {
      return NextResponse.json({ error: "Preferred genres must be an array" }, { status: 400 });
    }
    if (preferredGenres.length > 10) {
      return NextResponse.json({ error: "Maximum 10 preferred genres" }, { status: 400 });
    }
    const invalid = preferredGenres.filter((g: unknown) => typeof g !== "string" || !VALID_STYLES.includes((g as string).toLowerCase()));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Invalid genres: ${invalid.join(", ")}` }, { status: 400 });
    }
    data.preferredGenres = preferredGenres.map((g: string) => g.toLowerCase());
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { defaultStyle: true, preferredGenres: true },
  });

  return NextResponse.json(user);
}
