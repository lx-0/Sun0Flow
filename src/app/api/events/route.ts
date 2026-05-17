import { authRoute } from "@/lib/route-handler";
import { subscribe, SSEEvent } from "@/lib/event-bus";
import { closeSSE, createSSEStream, createSSEResponse, enqueueSSEEvent } from "@/lib/sse";

export const dynamic = "force-dynamic";

export const GET = authRoute(async (request, { auth }) => {
  let unsubscribe: (() => void) | null = null;

  const stream = createSSEStream({
    request,
    onStart(controller) {
      unsubscribe = subscribe(auth.userId, (event: SSEEvent) => {
        enqueueSSEEvent(controller, event.type, event.data);
      });
    },
    onAbort(controller) {
      if (unsubscribe) unsubscribe();
      closeSSE(controller);
    },
    onCancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return createSSEResponse(stream);
}, { route: "/api/events" });
