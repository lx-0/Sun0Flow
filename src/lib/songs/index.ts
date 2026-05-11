import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveRootId } from "./variations";
import { SongFilters } from "./filters";
import { SongSelect, SongInclude, enrichSong, type SongWithDetail } from "./projections";

// ---------------------------------------------------------------------------
// Sub-module re-exports
// ---------------------------------------------------------------------------

export { prepareSongDownload } from "./download";
export type { DownloadFormat, DownloadSong, DownloadRequest, DownloadResult } from "./download";

export { findAccessibleSong, checkFavorite, addFavorite, removeFavorite, listFavorites } from "./favorites";
export type { FavoriteStatus, FavoriteToggleResult, FavoriteSort, FavoritesQuery, FavoriteSong, FavoritesResult } from "./favorites";

export { queryGenerations } from "./generation-history";
export type { GenerationFilter, GenerationSummary, GenerationListResult } from "./generation-history";

export { getTopGenres, getTopMoods } from "./taxonomy";
export type { TagCount } from "./taxonomy";

export { queryPublicSongs } from "./public";
export type { PublicSongsQuery, PublicSongsResult, PublicSong, PublicSongSort } from "./public";

export {
  getVariationFamily,
  createVariation,
  addVocals,
  addInstrumental,
  replaceSection,
  extendSong,
  normalizeVariationTags,
  variationTitle,
  resolveRootId,
  MAX_VARIATIONS,
} from "./variations";
export type {
  VariationFamily,
  VariationInput,
  AddVocalsInput,
  AddInstrumentalInput,
  ReplaceSectionInput,
  ExtendSongInput,
} from "./variations";

export { querySongLibrary } from "./library";
export type { SongLibraryQuery, SongLibraryResult, SortField } from "./library";

export { SongSelect } from "./projections";
export type { EnrichedSong } from "./projections";

// ---------------------------------------------------------------------------
// Discoverable filter — deep interface for external consumers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Single-song finders
// ---------------------------------------------------------------------------

export interface PublicVariant {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
  createdAt: Date;
}

export async function getVariantFamily(
  songId: string,
  parentSongId: string | null
): Promise<PublicVariant[]> {
  const rootId = await resolveRootId(songId, parentSongId);

  return prisma.song.findMany({
    where: SongFilters.variantFamily(rootId),
    select: SongSelect.variant,
    orderBy: { createdAt: "asc" },
  });
}

export async function findUserSong(
  userId: string,
  songId: string
): Promise<import("./projections").EnrichedSong | null> {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
    include: SongInclude.detailWithoutVariations(userId),
  });
  if (!song) return null;
  return enrichSong(song as SongWithDetail);
}
