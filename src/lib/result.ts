export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status: number };

export function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  code: string,
  status: number,
): Result<T> {
  return { ok: false, error, code, status };
}

export const Err = {
  notFound: (msg = "Not found") => fail(msg, "NOT_FOUND", 404),
  validation: (msg: string) => fail(msg, "VALIDATION_ERROR", 400),
  forbidden: (msg = "Forbidden") => fail(msg, "FORBIDDEN", 403),
  conflict: (msg: string) => fail(msg, "CONFLICT", 409),
  rateLimited: (msg: string) => fail(msg, "RATE_LIMITED", 429),
  limitReached: (msg: string) => fail(msg, "LIMIT_REACHED", 400),
  expired: (msg: string) => fail(msg, "EXPIRED", 410),
};
