import { NextRequest, NextResponse } from "next/server";
import { recordPlay } from "@/lib/playlists";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await recordPlay(id);
    if (!result.ok)
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    return NextResponse.json(result.data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
