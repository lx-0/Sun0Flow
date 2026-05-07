export type AnalyticsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status: number };

export function success<T>(data: T): AnalyticsResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  code: string,
  status: number,
): AnalyticsResult<T> {
  return { ok: false, error, code, status };
}

export const Err = {
  validation: (msg: string) => fail(msg, "VALIDATION_ERROR", 400),
  notFound: (msg: string) => fail(msg, "NOT_FOUND", 404),
};
