import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { type ExportResult, success, Err } from "./result";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExportOutput {
  content: string;
  contentType: string;
  filename: string;
}

export interface GdprExportOutput {
  zipBuffer: Buffer;
  filename: string;
  songCount: number;
  playlistCount: number;
}

type ExportFormat = "json" | "csv";
type ExportType = "songs" | "playlists" | "all";

const VALID_FORMATS: readonly string[] = ["json", "csv"];
const VALID_TYPES: readonly string[] = ["songs", "playlists", "all"];

// ---------------------------------------------------------------------------
// Internal – data fetching
// ---------------------------------------------------------------------------

type SongWithTags = Awaited<ReturnType<typeof fetchSongs>>[number];
type PlaylistWithSongs = Awaited<ReturnType<typeof fetchPlaylists>>[number];

async function fetchSongs(userId: string) {
  return prisma.song.findMany({
    where: { userId },
    include: {
      songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function fetchPlaylists(userId: string) {
  return prisma.playlist.findMany({
    where: { userId },
    include: {
      songs: {
        include: { song: { select: { id: true, title: true } } },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Internal – formatting
// ---------------------------------------------------------------------------

function formatSongs(songs: SongWithTags[]) {
  return songs.map((s) => ({
    title: s.title,
    prompt: s.prompt,
    style: s.tags,
    lyrics: s.lyrics,
    duration: s.duration,
    rating: s.rating,
    ratingNote: s.ratingNote,
    isFavorite: s.isFavorite,
    isInstrumental: s.isInstrumental,
    generationStatus: s.generationStatus,
    sunoModel: s.sunoModel,
    tags: s.songTags.map((st) => st.tag.name),
    audioUrl: s.audioUrl,
    imageUrl: s.imageUrl,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
}

function formatPlaylists(playlists: PlaylistWithSongs[]) {
  return playlists.map((p) => ({
    name: p.name,
    description: p.description,
    songs: p.songs.map((ps) => ({
      title: ps.song.title,
      position: ps.position,
    })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

function escapeCsvField(field: string): string {
  if (
    field.includes('"') ||
    field.includes(",") ||
    field.includes("\n") ||
    field.includes("\r")
  ) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

function songsToCSV(songs: SongWithTags[]): string {
  const headers = [
    "Title",
    "Prompt",
    "Style",
    "Lyrics",
    "Duration",
    "Rating",
    "Rating Note",
    "Favorite",
    "Instrumental",
    "Status",
    "Model",
    "Tags",
    "Audio URL",
    "Created At",
    "Updated At",
  ];

  const rows = songs.map((s) => [
    s.title ?? "",
    s.prompt ?? "",
    s.tags ?? "",
    s.lyrics ?? "",
    s.duration != null ? String(s.duration) : "",
    s.rating != null ? String(s.rating) : "",
    s.ratingNote ?? "",
    s.isFavorite ? "Yes" : "No",
    s.isInstrumental ? "Yes" : "No",
    s.generationStatus,
    s.sunoModel ?? "",
    s.songTags.map((st) => st.tag.name).join("; "),
    s.audioUrl ?? "",
    s.createdAt.toISOString(),
    s.updatedAt.toISOString(),
  ]);

  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvField).join(","),
  );

  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Internal – output builders
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function jsonOutput(data: unknown, filename: string): ExportOutput {
  return {
    content: JSON.stringify(data, null, 2),
    contentType: "application/json; charset=utf-8",
    filename,
  };
}

function csvOutput(csv: string, filename: string): ExportOutput {
  return {
    content: csv,
    contentType: "text/csv; charset=utf-8",
    filename,
  };
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export async function exportUserData(
  userId: string,
  format: string,
  type: string,
): Promise<ExportResult<ExportOutput>> {
  if (!VALID_FORMATS.includes(format)) {
    return Err.validation("Invalid format. Use 'json' or 'csv'.");
  }
  if (!VALID_TYPES.includes(type)) {
    return Err.validation("Invalid type. Use 'songs', 'playlists', or 'all'.");
  }

  const fmt = format as ExportFormat;
  const kind = type as ExportType;
  const date = today();

  if (fmt === "csv") {
    const songs = await fetchSongs(userId);
    return success(
      csvOutput(songsToCSV(songs), `sunoflow-export-${songs.length}songs-${date}.csv`),
    );
  }

  if (kind === "songs") {
    const songs = await fetchSongs(userId);
    return success(
      jsonOutput(
        { exportedAt: new Date().toISOString(), songCount: songs.length, songs: formatSongs(songs) },
        `sunoflow-export-${songs.length}songs-${date}.json`,
      ),
    );
  }

  if (kind === "playlists") {
    const playlists = await fetchPlaylists(userId);
    return success(
      jsonOutput(
        { exportedAt: new Date().toISOString(), playlistCount: playlists.length, playlists: formatPlaylists(playlists) },
        `sunoflow-export-${playlists.length}playlists-${date}.json`,
      ),
    );
  }

  // kind === "all"
  const [songs, playlists] = await Promise.all([
    fetchSongs(userId),
    fetchPlaylists(userId),
  ]);

  return success(
    jsonOutput(
      {
        exportedAt: new Date().toISOString(),
        songCount: songs.length,
        playlistCount: playlists.length,
        songs: formatSongs(songs),
        playlists: formatPlaylists(playlists),
      },
      `sunoflow-export-${songs.length}songs-${date}.json`,
    ),
  );
}

// ---------------------------------------------------------------------------
// GDPR full-archive ZIP export
// ---------------------------------------------------------------------------

function formatGdprSongs(songs: SongWithTags[]) {
  return songs.map((s) => ({
    id: s.id,
    title: s.title,
    prompt: s.prompt,
    style: s.tags,
    lyrics: s.lyrics,
    lyricsEdited: s.lyricsEdited,
    duration: s.duration,
    rating: s.rating,
    ratingNote: s.ratingNote,
    isFavorite: s.isFavorite,
    isInstrumental: s.isInstrumental,
    isPublic: s.isPublic,
    generationStatus: s.generationStatus,
    sunoModel: s.sunoModel,
    source: s.source,
    tags: s.songTags.map((st) => st.tag.name),
    audioUrl: s.audioUrl,
    imageUrl: s.imageUrl,
    playCount: s.playCount,
    downloadCount: s.downloadCount,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
}

function formatGdprPlaylists(playlists: GdprPlaylistWithSongs[]) {
  return playlists.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    isPublic: p.isPublic,
    songs: p.songs.map((ps) => ({
      title: ps.song.title,
      audioUrl: ps.song.audioUrl,
      position: ps.position,
    })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

type GdprPlaylistWithSongs = Awaited<ReturnType<typeof fetchGdprPlaylists>>[number];

async function fetchGdprPlaylists(userId: string) {
  return prisma.playlist.findMany({
    where: { userId },
    include: {
      songs: {
        include: { song: { select: { id: true, title: true, audioUrl: true } } },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function exportGdprZip(
  userId: string,
): Promise<ExportResult<GdprExportOutput>> {
  const [user, songs, playlists, generationAttempts, reactions, subscription, creditUsages] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          bio: true,
          avatarUrl: true,
          bannerUrl: true,
          defaultStyle: true,
          preferredGenres: true,
          onboardingCompleted: true,
          emailWelcome: true,
          emailGenerationComplete: true,
          emailDigestFrequency: true,
          quietHoursEnabled: true,
          quietHoursStart: true,
          quietHoursEnd: true,
          pushGenerationComplete: true,
          pushNewFollower: true,
          pushSongComment: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      fetchSongs(userId),
      fetchGdprPlaylists(userId),
      prisma.generationAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.songReaction.findMany({
        where: { userId },
        include: { song: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subscription.findUnique({ where: { userId } }),
      prisma.creditUsage.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const zip = new JSZip();
  const exportedAt = new Date().toISOString();

  zip.file("profile.json", JSON.stringify({ exportedAt, profile: user }, null, 2));

  const formattedSongs = formatGdprSongs(songs);
  zip.file(
    "songs.json",
    JSON.stringify({ exportedAt, count: formattedSongs.length, songs: formattedSongs }, null, 2),
  );

  const formattedPlaylists = formatGdprPlaylists(playlists);
  zip.file(
    "playlists.json",
    JSON.stringify(
      { exportedAt, count: formattedPlaylists.length, playlists: formattedPlaylists },
      null,
      2,
    ),
  );

  const formattedGenerations = generationAttempts.map((g) => ({
    id: g.id,
    prompt: g.prompt,
    params: g.params,
    status: g.status,
    songId: g.songId,
    errorMessage: g.errorMessage,
    createdAt: g.createdAt.toISOString(),
  }));
  zip.file(
    "generation-history.json",
    JSON.stringify(
      { exportedAt, count: formattedGenerations.length, generations: formattedGenerations },
      null,
      2,
    ),
  );

  const formattedReactions = reactions.map((r) => ({
    id: r.id,
    songId: r.songId,
    songTitle: r.song.title,
    emoji: r.emoji,
    timestamp: r.timestamp,
    createdAt: r.createdAt.toISOString(),
  }));
  zip.file(
    "reactions.json",
    JSON.stringify(
      { exportedAt, count: formattedReactions.length, reactions: formattedReactions },
      null,
      2,
    ),
  );

  const subscriptionData = subscription
    ? {
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt?.toISOString() ?? null,
        trialStart: subscription.trialStart?.toISOString() ?? null,
        trialEnd: subscription.trialEnd?.toISOString() ?? null,
        createdAt: subscription.createdAt.toISOString(),
        updatedAt: subscription.updatedAt.toISOString(),
        creditUsage: creditUsages.map((c) => ({
          action: c.action,
          creditCost: c.creditCost,
          description: c.description,
          songId: c.songId,
          createdAt: c.createdAt.toISOString(),
        })),
      }
    : null;
  zip.file(
    "subscription.json",
    JSON.stringify({ exportedAt, subscription: subscriptionData }, null, 2),
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const date = today();

  console.info(
    JSON.stringify({
      event: "gdpr_export",
      userId,
      exportedAt,
      songCount: songs.length,
      playlistCount: playlists.length,
    }),
  );

  return success({
    zipBuffer,
    filename: `sunoflow-gdpr-export-${date}.zip`,
    songCount: songs.length,
    playlistCount: playlists.length,
  });
}
