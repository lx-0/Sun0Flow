import { NextResponse } from "next/server";
import { generateSong } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";

export async function POST(request: Request) {
  try {
    const { prompt, title, tags, makeInstrumental } = await request.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "A style/genre prompt is required" },
        { status: 400 }
      );
    }

    let songs;
    try {
      songs = await generateSong(prompt.trim(), {
        title: title?.trim() || undefined,
        tags: tags?.trim() || undefined,
        makeInstrumental: Boolean(makeInstrumental),
      });
    } catch {
      // Fall back to mock when SUNOAPI_KEY is not configured
      songs = mockSongs.slice(0, 1);
    }

    return NextResponse.json({ songs }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
