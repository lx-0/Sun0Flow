import { MAX_SECTION_RATIO, MAX_SECTION_S, MIN_SECTION_S } from "@/lib/songs/variations/constants";

export function validateReplaceSectionRange(
  infillStartS: number | null | undefined,
  infillEndS: number | null | undefined,
  parentDuration: number | null,
): string | null {
  if (infillStartS == null || infillEndS == null) {
    return "Start and end times are required.";
  }
  if (infillStartS < 0 || infillEndS <= infillStartS) {
    return "Invalid time range. End must be after start.";
  }

  const sectionLen = infillEndS - infillStartS;
  if (sectionLen < MIN_SECTION_S) {
    return `Section must be at least ${MIN_SECTION_S} seconds.`;
  }
  if (sectionLen > MAX_SECTION_S) {
    return `Section must be at most ${MAX_SECTION_S} seconds.`;
  }
  if (parentDuration && sectionLen > parentDuration * MAX_SECTION_RATIO) {
    return "Section must be at most 50% of the song duration.";
  }

  return null;
}
