import Image from "next/image";
import Link from "next/link";
import { MusicalNoteIcon, PauseIcon, PlayIcon } from "@heroicons/react/24/solid";

import { AddToPlaylistButton } from "@/components/AddToPlaylistButton";
import { FollowButton } from "@/components/FollowButton";

import { formatDuration, parseSongTags } from "./discover-view.utils";
import type {
  CollectionPreview,
  DiscoverPlaylist,
  DiscoverSong,
  FeedSong,
  PublicSong,
  TrendingSong,
} from "./discover-view.types";

const REASON_STYLES: Record<string, { bg: string; text: string }> = {
  recommended: {
    bg: "bg-violet-600",
    text: "text-white",
  },
  followed_artist: {
    bg: "bg-emerald-600",
    text: "text-white",
  },
  trending: {
    bg: "bg-orange-500",
    text: "text-white",
  },
  new_release: {
    bg: "bg-sky-600",
    text: "text-white",
  },
};

export function FeedCard({
  song,
  isPlaying,
  onPlayToggle,
  onTagClick,
  onMoodClick,
}: {
  song: FeedSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onTagClick: (tag: string) => void;
  onMoodClick: (mood: string) => void;
}) {
  const coverUrl = song.imageUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres, moods } = parseSongTags(song.tags);
  const reasonStyle = REASON_STYLES[song.reason] ?? REASON_STYLES.new_release;

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          {song.audioUrl && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPlayToggle();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg min-h-[44px] min-w-[44px]"
              aria-label={isPlaying ? "Pause" : "Play preview"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
          )}
        </div>
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-violet-600 text-white text-xs font-medium rounded-full">
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
              <span className="w-0.5 h-2 bg-white rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-3.5 bg-white rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
            Playing
          </div>
        )}
        <span
          className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold rounded-full ${reasonStyle.bg} ${reasonStyle.text} truncate max-w-[120px]`}
          title={song.reasonLabel}
        >
          {song.reasonLabel}
        </span>
      </Link>

      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        <div className="flex items-center justify-between mt-0.5">
          {song.creatorUsername ? (
            <Link href={`/u/${song.creatorUsername}`} className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
              {song.creatorDisplayName}
            </Link>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {song.creatorDisplayName}
            </p>
          )}
          <div className="flex items-center flex-shrink-0">
            <AddToPlaylistButton songId={song.id} variant="icon" />
            <FollowButton userId={song.creatorUserId} />
          </div>
        </div>

        {(genres.length > 0 || moods.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => onTagClick(g)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
                title={`Filter by genre: ${g}`}
              >
                {g}
              </button>
            ))}
            {moods.map((m) => (
              <button
                key={m}
                onClick={() => onMoodClick(m)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/60 transition-colors"
                title={`Filter by mood: ${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          {song.rating !== null && (
            <span className="flex items-center gap-0.5">
              <span className="text-yellow-500">&#9733;</span>
              {song.rating}
            </span>
          )}
          {song.playCount > 0 && <span>{song.playCount} plays</span>}
        </div>
      </div>
    </div>
  );
}

export function DiscoverCard({
  song,
  isPlaying,
  onPlayToggle,
  onTagClick,
  onMoodClick,
}: {
  song: DiscoverSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onTagClick: (tag: string) => void;
  onMoodClick: (mood: string) => void;
}) {
  const coverUrl = song.imageUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres, moods } = parseSongTags(song.tags);

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          {song.audioUrl && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPlayToggle();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg min-h-[44px] min-w-[44px]"
              aria-label={isPlaying ? "Pause" : "Play preview"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
          )}
        </div>
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-violet-600 text-white text-xs font-medium rounded-full">
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
              <span className="w-0.5 h-2 bg-white rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-3.5 bg-white rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
            Playing
          </div>
        )}
      </Link>

      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        <div className="flex items-center justify-between mt-0.5">
          {song.user.username ? (
            <Link href={`/u/${song.user.username}`} className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
              {song.user.name || song.user.username}
            </Link>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {song.user.name || "Unknown Artist"}
            </p>
          )}
          <div className="flex items-center flex-shrink-0">
            <AddToPlaylistButton songId={song.id} variant="icon" />
            <FollowButton userId={song.user.id} />
          </div>
        </div>

        {(genres.length > 0 || moods.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => onTagClick(g)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 transition-colors"
                title={`Filter by genre: ${g}`}
              >
                {g}
              </button>
            ))}
            {moods.map((m) => (
              <button
                key={m}
                onClick={() => onMoodClick(m)}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/60 transition-colors"
                title={`Filter by mood: ${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          {song.rating !== null && (
            <span className="flex items-center gap-0.5">
              <span className="text-yellow-500">&#9733;</span>
              {song.rating}
            </span>
          )}
          {song.playCount > 0 && <span>{song.playCount} plays</span>}
        </div>
      </div>
    </div>
  );
}

export function SearchCard({
  song,
  isPlaying,
  onPlayToggle,
}: {
  song: PublicSong;
  isPlaying: boolean;
  onPlayToggle: () => void;
}) {
  const coverUrl = song.albumArtUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres, moods } = parseSongTags(song.genre);

  return (
    <div className="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow hover:shadow-lg hover:shadow-violet-500/10">
      <Link href={href} className="block relative aspect-square">
        <Image
          src={coverUrl}
          alt={song.title || "Song cover"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          {song.audioUrl && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPlayToggle();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg min-h-[44px] min-w-[44px]"
              aria-label={isPlaying ? "Pause" : "Play preview"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
          )}
        </div>
        {song.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formatDuration(song.duration)}
          </span>
        )}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-violet-600 text-white text-xs font-medium rounded-full">
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" />
              <span className="w-0.5 h-2 bg-white rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-3.5 bg-white rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
            Playing
          </div>
        )}
      </Link>

      <div className="p-3">
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </h3>
        </Link>
        {song.creatorUsername ? (
          <Link href={`/u/${song.creatorUsername}`} className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 hover:text-violet-600 dark:hover:text-violet-400 transition-colors block">
            {song.creatorDisplayName}
          </Link>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {song.creatorDisplayName}
          </p>
        )}

        {(genres.length > 0 || moods.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {genres.map((g) => (
              <span
                key={g}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
              >
                {g}
              </span>
            ))}
            {moods.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300"
              >
                {m}
              </span>
            ))}
          </div>
        )}

        {song.playCount > 0 && (
          <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            {song.playCount} plays
          </div>
        )}
      </div>
    </div>
  );
}

export function TrendingRow({
  song,
  rank,
  isPlaying,
  onPlayToggle,
  isTrending,
}: {
  song: TrendingSong;
  rank: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  isTrending: boolean;
}) {
  const coverUrl = song.albumArtUrl || "/default-cover.png";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : "#";
  const { genres } = parseSongTags(song.genre);

  return (
    <div className="group flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl transition-shadow hover:shadow-md hover:shadow-violet-500/10">
      <span
        className={`w-7 text-center text-sm font-bold shrink-0 ${
          rank <= 3
            ? rank === 1
              ? "text-yellow-500"
              : rank === 2
              ? "text-gray-400"
              : "text-amber-600"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
      </span>

      <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
        <Link href={href}>
          <Image
            src={coverUrl}
            alt={song.title || "Song cover"}
            fill
            sizes="48px"
            className="object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            {song.audioUrl && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPlayToggle();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow min-h-[32px] min-w-[32px]"
                aria-label={isPlaying ? "Pause" : "Play preview"}
              >
                {isPlaying ? (
                  <PauseIcon className="w-4 h-4" />
                ) : (
                  <PlayIcon className="w-4 h-4 ml-0.5" />
                )}
              </button>
            )}
          </div>
        </Link>
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex gap-0.5">
              <span className="w-0.5 h-3 bg-violet-400 rounded-full animate-pulse" />
              <span className="w-0.5 h-2 bg-violet-400 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-0.5 h-3.5 bg-violet-400 rounded-full animate-pulse [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <Link href={href}>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
            {song.title || "Untitled"}
          </p>
        </Link>
        {song.creatorUsername ? (
          <Link href={`/u/${song.creatorUsername}`} className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors block">
            {song.creatorDisplayName}
          </Link>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {song.creatorDisplayName}
          </p>
        )}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {genres.slice(0, 2).map((g) => (
              <span
                key={g}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {song.playCount.toLocaleString()} plays
        </p>
        {isTrending && (
          <p className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">
            score {song.score.toFixed(1)}
          </p>
        )}
        {song.duration && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatDuration(song.duration)}
          </p>
        )}
      </div>
    </div>
  );
}

export function CollectionCard({ collection }: { collection: CollectionPreview }) {
  const FALLBACK_IMAGE = "https://placehold.co/400x400/1e1b4b/a78bfa?text=♪";
  const cover = collection.coverImage ?? collection.previewSongs[0]?.imageUrl ?? FALLBACK_IMAGE;

  return (
    <Link
      href={`/discover/collections/${collection.id}`}
      className="group block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
    >
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {collection.previewSongs.length >= 4 ? (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
            {collection.previewSongs.slice(0, 4).map((s, i) => (
              <div key={i} className="relative overflow-hidden">
                <Image
                  src={s.imageUrl ?? FALLBACK_IMAGE}
                  alt=""
                  fill
                  sizes="200px"
                  className="object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <Image
            src={cover}
            alt={collection.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          <p className="text-white font-bold text-base leading-tight line-clamp-2 drop-shadow">
            {collection.title}
          </p>
        </div>
      </div>

      <div className="p-3">
        {collection.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5">
            {collection.description}
          </p>
        )}
        <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 font-medium">
          <MusicalNoteIcon className="w-3.5 h-3.5" />
          {collection.songCount} song{collection.songCount !== 1 ? "s" : ""}
        </div>
      </div>
    </Link>
  );
}

export function PlaylistCard({ playlist }: { playlist: DiscoverPlaylist }) {
  const href = playlist.slug ? `/p/${playlist.slug}` : "#";

  return (
    <Link
      href={href}
      className="group block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
    >
      <div className="relative h-24 bg-gradient-to-br from-violet-500 to-indigo-600 flex items-end p-3">
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        <h3 className="relative text-white font-bold text-sm leading-tight line-clamp-2 drop-shadow">
          {playlist.name}
        </h3>
      </div>

      <div className="p-3 space-y-2">
        {playlist.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {playlist.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">{playlist.creatorDisplayName}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <MusicalNoteIcon className="w-3.5 h-3.5" />
            {playlist.songCount} song{playlist.songCount !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <PlayIcon className="w-3.5 h-3.5" />
            {playlist.playCount.toLocaleString()} play{playlist.playCount !== 1 ? "s" : ""}
          </span>
        </div>

        {playlist.genre && (
          <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700">
            {playlist.genre}
          </span>
        )}
      </div>
    </Link>
  );
}
