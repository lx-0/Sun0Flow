export type CommentResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status: number };

export function success<T>(data: T): CommentResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  code: string,
  status: number,
): CommentResult<T> {
  return { ok: false, error, code, status };
}

export const Err = {
  notFound: (msg = "Not found") => fail(msg, "NOT_FOUND", 404),
  validation: (msg: string) => fail(msg, "VALIDATION_ERROR", 400),
  rateLimited: (msg: string) => fail(msg, "RATE_LIMITED", 429),
  duplicate: (msg: string) => fail(msg, "DUPLICATE_COMMENT", 429),
};
