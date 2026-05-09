export type { Result as PersonaResult } from "@/lib/result";
export { success, fail } from "@/lib/result";
import { fail, Err as BaseErr } from "@/lib/result";

export const Err = {
  ...BaseErr,
  clipNotFound: (msg: string) => fail(msg, "CLIP_NOT_FOUND", 404),
  limitReached: (msg: string) => fail(msg, "VALIDATION_ERROR", 400),
  upstream: (msg: string, status: number) => fail(msg, "SUNO_API_ERROR", status),
};
