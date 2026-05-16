import { authRoute } from "@/lib/route-handler";
import { subscribe, SSEEvent } from "@/lib/event-bus";
import { createSSEResponse, encodeSSEComment, encodeSSEEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

export const GET = authRoute(async (request, { auth }) => {
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      controller.enqueue(encodeSSEComment("connected"));

      unsubscribe = subscribe(auth.userId, (event: SSEEvent) => {
        try {
          controller.enqueue(encodeSSEEvent(event.type, event.data));
        } catch {
          // Client disconnected
        }
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encodeSSEComment("heartbeat"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return createSSEResponse(stream);
}, { route: "/api/events" });
