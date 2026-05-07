export type ExportResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status: number };

export function success<T>(data: T): ExportResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  code: string,
  status: number,
): ExportResult<T> {
  return { ok: false, error, code, status };
}

export const Err = {
  validation: (msg: string) => fail(msg, "VALIDATION_ERROR", 400),
};
