import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { generateLyrics, getTaskStatus, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";

const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "A lyrics prompt is required" },
        { status: 400 }
      );
    }

    if (prompt.length > 200) {
      return NextResponse.json(
        { error: "Lyrics prompt must be 200 characters or less" },
        { status: 400 }
      );
    }

    const userApiKey = await resolveUserApiKey(userId);
    const { taskId } = await generateLyrics({ prompt: prompt.trim() }, userApiKey);

    // Poll for lyrics result
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const status = await getTaskStatus(taskId, userApiKey);

      if (
        status.status === "TEXT_SUCCESS" ||
        status.status === "FIRST_SUCCESS" ||
        status.status === "SUCCESS"
      ) {
        const lyricsText = status.songs?.[0]?.prompt ?? status.songs?.[0]?.lyrics ?? "";
        return NextResponse.json({ lyrics: lyricsText, taskId });
      }

      if (
        status.status === "CREATE_TASK_FAILED" ||
        status.status === "GENERATE_AUDIO_FAILED" ||
        status.status === "CALLBACK_EXCEPTION" ||
        status.status === "SENSITIVE_WORD_ERROR"
      ) {
        return NextResponse.json(
          { error: status.errorMessage ?? "Lyrics generation failed" },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: "Lyrics generation timed out. Please try again." },
      { status: 504 }
    );
  } catch (error) {
    if (error instanceof SunoApiError) {
      logServerError("lyrics-generate-api", error, { route: "/api/lyrics/generate" });
      return NextResponse.json(
        { error: "Lyrics generation failed. Please try again." },
        { status: error.status >= 500 ? 502 : error.status }
      );
    }
    logServerError("lyrics-generate", error, { route: "/api/lyrics/generate" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
