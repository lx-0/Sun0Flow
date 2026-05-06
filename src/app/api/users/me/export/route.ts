import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited, internalError } from "@/lib/api-error";

const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXPORT_LIMIT = 1;

/**
 * GET /api/users/me/export
 *
 * GDPR-compliant full user data export as a ZIP file.
 * Contains: profile, songs, playlists, generation-history, reactions, subscription.
 * Audio binaries are excluded — only metadata and URLs are included.
 * Rate limited to 1 export per user per 24 hours.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    // Rate limit: 1 export per 24 hours
    const { acquired, status: rlStatus } = await acquireRateLimitSlot(
      userId,
      "gdpr_export",
      EXPORT_LIMIT,
      EXPORT_WINDOW_MS
    );

    if (!acquired) {
      return rateLimited(
        "You can only request a data export once every 24 hours.",
        {
          rateLimit: {
            limit: rlStatus.limit,
            remaining: rlStatus.remaining,
            resetAt: rlStatus.resetAt,
          },
        }
      );
    }

    // Fetch all user data in parallel
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
        prisma.song.findMany({
          where: { userId },
          include: {
            songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.playlist.findMany({
          where: { userId },
          include: {
            songs: {
              include: { song: { select: { id: true, title: true, audioUrl: true } } },
              orderBy: { position: "asc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.generationAttempt.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.songReaction.findMany({
          where: { userId },
          include: { song: { select: { id: true, title: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.subscription.findUnique({
          where: { userId },
        }),
        prisma.creditUsage.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // Build ZIP
    const zip = new JSZip();
    const exportedAt = new Date().toISOString();

    // profile.json
    zip.file(
      "profile.json",
      JSON.stringify(
        {
          exportedAt,
          profile: user,
        },
        null,
        2
      )
    );

    // songs.json
    const formattedSongs = songs.map((s) => ({
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

    zip.file(
      "songs.json",
      JSON.stringify({ exportedAt, count: formattedSongs.length, songs: formattedSongs }, null, 2)
    );

    // playlists.json
    const formattedPlaylists = playlists.map((p) => ({
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

    zip.file(
      "playlists.json",
      JSON.stringify(
        { exportedAt, count: formattedPlaylists.length, playlists: formattedPlaylists },
        null,
        2
      )
    );

    // generation-history.json
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
        {
          exportedAt,
          count: formattedGenerations.length,
          generations: formattedGenerations,
        },
        null,
        2
      )
    );

    // reactions.json
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
        2
      )
    );

    // subscription.json
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
      JSON.stringify({ exportedAt, subscription: subscriptionData }, null, 2)
    );

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    // Audit log
    console.info(
      JSON.stringify({
        event: "gdpr_export",
        userId,
        exportedAt,
        songCount: songs.length,
        playlistCount: playlists.length,
      })
    );

    const today = new Date().toISOString().split("T")[0];
    const filename = `sunoflow-gdpr-export-${today}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.byteLength),
        "X-RateLimit-Limit": String(rlStatus.limit),
        "X-RateLimit-Remaining": String(rlStatus.remaining),
        "X-RateLimit-Reset": rlStatus.resetAt,
      },
    });
  } catch {
    return internalError();
  }
}
