import { Prisma } from "@prisma/client";
import { SongFilters } from "./filters";

export interface DiscoverableFilterOptions {
  visibility?: "public" | "discoverable";
  genre?: string;
  mood?: string;
  tags?: string[];
  tagIds?: string[];
  tempoMin?: number;
  tempoMax?: number;
  excludeIds?: string[];
}

export function buildDiscoverableFilter(
  options: DiscoverableFilterOptions = {},
): Prisma.SongWhereInput {
  const { visibility = "public", genre, mood, tags, tagIds, tempoMin, tempoMax, excludeIds } = options;

  let where: Prisma.SongWhereInput =
    visibility === "discoverable"
      ? SongFilters.discoverable()
      : SongFilters.publicDiscovery();

  where = SongFilters.withTagFilters(where, genre, mood);
  where = SongFilters.withTagContains(where, tags ?? []);
  where = SongFilters.withSongTags(where, tagIds ?? []);
  where = SongFilters.withTempoRange(where, tempoMin, tempoMax);
  where = SongFilters.withExcludeIds(where, excludeIds ?? []);

  return where;
}
