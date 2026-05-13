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

export { SongFilters } from "./filters";
export { buildDiscoverableFilter } from "./discoverable-filter";
export type { DiscoverableFilterOptions } from "./discoverable-filter";

export { getVariantFamily, findUserSong } from "./lookups";
export type { PublicVariant } from "./lookups";

export {
  getSongRating,
  updateSongRating,
  getSongLyrics,
  updateSongLyrics,
  updateSongVisibility,
  toggleSongShare,
  archiveSong,
  restoreSong,
} from "./crud";
