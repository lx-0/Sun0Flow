export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

type Controller = ReadableStreamDefaultController<Uint8Array>;

type SSEStreamOptions = {
  request?: Request;
  initialComment?: string;
  heartbeatMs?: number;
  onStart: (controller: Controller) => void | Promise<void>;
  onAbort?: (controller: Controller) => void;
  onCancel?: (controller: Controller) => void;
};

export function encodeSSEComment(comment: string): Uint8Array {
  return new TextEncoder().encode(`: ${comment}\n\n`);
}

export function encodeSSEEvent(type: string, data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function enqueueSSEComment(
  controller: Controller,
  comment: string,
): boolean {
  try {
    controller.enqueue(encodeSSEComment(comment));
    return true;
  } catch {
    return false;
  }
}

export function enqueueSSEEvent(
  controller: Controller,
  type: string,
  data: Record<string, unknown>,
): boolean {
  try {
    controller.enqueue(encodeSSEEvent(type, data));
    return true;
  } catch {
    return false;
  }
}

export function closeSSE(controller: Controller): void {
  try {
    controller.close();
  } catch {
    // Already closed
  }
}

export function createSSEResponse(stream: ReadableStream): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

export function createSSEStream({
  request,
  initialComment = "connected",
  heartbeatMs = 30_000,
  onStart,
  onAbort,
  onCancel,
}: SSEStreamOptions): ReadableStream<Uint8Array> {
  let cleanedUp = false;
  let abortHandler: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let currentController: Controller | null = null;

  const cleanup = (controller: Controller, reason: "abort" | "cancel") => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (request && abortHandler) {
      request.signal.removeEventListener("abort", abortHandler);
      abortHandler = null;
    }

    try {
      if (reason === "abort") onAbort?.(controller);
      if (reason === "cancel") onCancel?.(controller);
    } catch {
      // Cleanup should never fail a stream lifecycle transition.
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      currentController = controller;
      enqueueSSEComment(controller, initialComment);

      if (heartbeatMs > 0) {
        heartbeat = setInterval(() => {
          if (!enqueueSSEComment(controller, "heartbeat")) {
            cleanup(controller, "cancel");
          }
        }, heartbeatMs);
      }

      if (request) {
        abortHandler = () => cleanup(controller, "abort");
        request.signal.addEventListener("abort", abortHandler);
      }

      try {
        await onStart(controller);
      } catch (error) {
        // Do NOT close the controller here — a closed stream cannot be
        // errored. Letting the throw propagate errors the stream, which
        // causes subsequent reads to reject. Run cleanup only for timers
        // and listeners; the ReadableStream machinery handles the error state.
        cleanup(controller, "cancel");
        throw error;
      }
    },
    cancel() {
      // Reader cancellation implies downstream disconnect.
      if (!currentController) return;
      cleanup(currentController, "cancel");
    },
  });
}
