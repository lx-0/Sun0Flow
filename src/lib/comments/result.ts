export type { Result as CommentResult } from "@/lib/result";
export { success, fail } from "@/lib/result";
import { fail, Err as BaseErr } from "@/lib/result";

export const Err = {
  ...BaseErr,
  duplicate: (msg: string) => fail(msg, "DUPLICATE_COMMENT", 429),
};
