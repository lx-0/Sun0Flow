export function extractErrorInfo(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack?.slice(0, 2048) };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error == null) {
    return { message: "Unknown error" };
  }

  if (typeof error === "object") {
    const candidate = error as { message?: unknown; stack?: unknown; reason?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return {
        message: candidate.message,
        stack: typeof candidate.stack === "string" ? candidate.stack.slice(0, 2048) : undefined,
      };
    }
    if (typeof candidate.reason === "string" && candidate.reason.trim().length > 0) {
      return { message: candidate.reason };
    }
  }

  return { message: String(error) };
}
