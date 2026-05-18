import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorFromResult } from "@/lib/api-error";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { resolveUserIdByUsername } from "@/lib/profile";
import { zPageParam } from "@/lib/query-params";

export const pageQuery = z.object({ page: zPageParam() });

export const publicProfileSongSelect = {
  id: true,
  title: true,
  imageUrl: true,
  audioUrl: true,
  duration: true,
  tags: true,
  publicSlug: true,
  playCount: true,
  createdAt: true,
} satisfies Prisma.SongSelect;

export function pageSlice(page: number) {
  return {
    skip: pageSkip(page, DEFAULT_PAGE_SIZE),
    take: DEFAULT_PAGE_SIZE,
  };
}

export function pagedResponse(page: number, total: number) {
  return offsetPagination(page, DEFAULT_PAGE_SIZE, total);
}

export async function resolveRouteUsernameOrResponse(username: string) {
  const userResult = await resolveUserIdByUsername(username);
  if (!userResult.ok) return errorFromResult(userResult);
  return { userId: userResult.data.id };
}
