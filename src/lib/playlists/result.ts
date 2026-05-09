export type { Result as PlaylistResult } from "@/lib/result";
export { success, fail } from "@/lib/result";
import { fail, Err as BaseErr } from "@/lib/result";

export const Err = {
  ...BaseErr,
  alreadyUsed: (msg: string) => fail(msg, "ALREADY_USED", 410),
};
