import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/export?format=json|csv&type=songs|playlists|all
 *
 * Exports user data as JSON or CSV for backup/portability.
 * Audio files are NOT included — only metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const format = params.get("format") || "json";
    const type = params.get("type") || "all";

    if (!["json", "csv"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format. Use 'json' or 'csv'.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!["songs", "playlists", "all"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Use 'songs', 'playlists', or 'all'.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const today = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      // CSV only supports songs export
      const songs = await fetchSongs(userId);
      const csv = songsToCSV(songs);
      const filename = `sunoflow-export-${songs.length}songs-${today}.csv`;

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // JSON export
    if (type === "songs") {
      const songs = await fetchSongs(userId);
      const data = { exportedAt: new Date().toISOString(), songCount: songs.length, songs: formatSongs(songs) };
      const filename = `sunoflow-export-${songs.length}songs-${today}.json`;
      return jsonResponse(data, filename);
    }

    if (type === "playlists") {
      const playlists = await fetchPlaylists(userId);
      const data = { exportedAt: new Date().toISOString(), playlistCount: playlists.length, playlists: formatPlaylists(playlists) };
      const filename = `sunoflow-export-${playlists.length}playlists-${today}.json`;
      return jsonResponse(data, filename);
    }

    // type === "all"
    const [songs, playlists] = await Promise.all([
      fetchSongs(userId),
      fetchPlaylists(userId),
    ]);

    const data = {
      exportedAt: new Date().toISOString(),
      songCount: songs.length,
      playlistCount: playlists.length,
      songs: formatSongs(songs),
      playlists: formatPlaylists(playlists),
    };
    const filename = `sunoflow-export-${songs.length}songs-${today}.json`;
    return jsonResponse(data, filename);
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

function jsonResponse(data: unknown, filename: string): NextResponse {
  const body = JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

type SongWithTags = Awaited<ReturnType<typeof fetchSongs>>[number];

async function fetchSongs(userId: string) {
  return prisma.song.findMany({
    where: { userId },
    include: {
      songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

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

type PlaylistWithSongs = Awaited<ReturnType<typeof fetchPlaylists>>[number];

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

/** RFC 4180 CSV with headers */
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

  const escapeCsvField = (field: string): string => {
    if (field.includes('"') || field.includes(",") || field.includes("\n") || field.includes("\r")) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  };

  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvField).join(",")
  );

  return lines.join("\r\n") + "\r\n";
}
