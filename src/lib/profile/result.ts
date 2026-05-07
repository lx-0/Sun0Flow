export type ProfileResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status: number };

export function success<T>(data: T): ProfileResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  code: string,
  status: number,
): ProfileResult<T> {
  return { ok: false, error, code, status };
}

export const Err = {
  notFound: (msg = "Not found") => fail(msg, "NOT_FOUND", 404),
  validation: (msg: string) => fail(msg, "VALIDATION_ERROR", 400),
  conflict: (msg: string) => fail(msg, "CONFLICT", 409),
  forbidden: (msg: string) => fail(msg, "FORBIDDEN", 403),
};
