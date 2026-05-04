export type SunoApiErrorCode =
  | "INSUFFICIENT_CREDITS"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "COMPLIANCE_BLOCK"
  | "RATE_LIMITED"
  | "AUTH_ERROR"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

export class SunoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: SunoApiErrorCode = "UNKNOWN",
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SunoApiError";
    Object.setPrototypeOf(this, SunoApiError.prototype);
  }
}
