export const DEFAULT_PAGE_SIZE = 20;

export interface OffsetPagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export function offsetPagination(
  page: number,
  limit: number,
  total: number,
): OffsetPagination {
  const totalPages = Math.ceil(total / limit);
  return { page, totalPages, total, hasMore: page < totalPages };
}

export function pageSkip(page: number, limit: number = DEFAULT_PAGE_SIZE): number {
  return (Math.max(1, page) - 1) * limit;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function cursorPaginate<T extends { id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, nextCursor };
}
