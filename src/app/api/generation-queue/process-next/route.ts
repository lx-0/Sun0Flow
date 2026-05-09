import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { rateLimited, internalError } from "@/lib/api-error";
import { processNextItem } from "@/lib/generation-queue";

export const POST = authRoute(async (_request, { auth }) => {
  const result = await processNextItem(auth.userId);

  switch (result.outcome) {
    case "already_processing":
      return NextResponse.json({ message: "Already processing", item: result.item });

    case "empty":
      return NextResponse.json({ message: "Queue empty", item: null });

    case "rate_limited":
      return rateLimited(
        `Rate limit exceeded. Resets at ${result.rateLimit.resetAt}`,
        { rateLimit: result.rateLimit },
      );

    case "denied":
      return internalError();

    case "queued":
      return NextResponse.json({ queued: true, message: result.message }, { status: 503 });

    case "failed":
      return NextResponse.json(
        {
          item: { ...result.queueItem, status: "failed", songId: result.song.id, errorMessage: result.error },
          song: result.song,
          error: result.error,
          code: result.code,
          ...(result.details && { details: result.details }),
          ...(result.creditBalance !== undefined && { creditBalance: result.creditBalance }),
          correlationId: result.correlationId,
        },
        { status: 201 },
      );

    case "created":
      return NextResponse.json(
        {
          item: { ...result.queueItem, status: result.queueStatus, songId: result.song.id },
          song: result.song,
        },
        { status: 201 },
      );
  }
}, { route: "/api/generation-queue/process-next" });
