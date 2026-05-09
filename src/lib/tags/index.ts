import { prisma } from "@/lib/prisma";
import { success, Err, type Result } from "@/lib/result";
import type { Tag } from "@prisma/client";

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeTagCombo(raw: string | null): string {
  return parseTags(raw).sort().join(", ");
}

export function collectSongTokens(
  songTags: { tag: { name: string } }[],
  tagsStr: string | null,
): string[] {
  return Array.from(
    new Set([
      ...songTags.map((st) => st.tag.name.toLowerCase()),
      ...parseTags(tagsStr),
    ]),
  );
}

export function tagOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const shared = b.filter((t) => setA.has(t)).length;
  return shared / Math.max(a.length, b.length);
}

const MAX_TAGS_PER_USER = 50;
const MAX_TAGS_PER_SONG = 10;
const DEFAULT_COLOR = "#7c3aed";

type TagWithCount = Tag & { _count: { songTags: number } };

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

function validHexColor(raw: string | undefined): string {
  if (!raw) return DEFAULT_COLOR;
  const trimmed = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : DEFAULT_COLOR;
}

export const Tags = {
  async list(userId: string): Promise<TagWithCount[]> {
    return prisma.tag.findMany({
      where: { userId },
      include: { _count: { select: { songTags: true } } },
      orderBy: { name: "asc" },
    });
  },

  async create(
    userId: string,
    rawName: string,
    rawColor?: string,
  ): Promise<Result<{ tag: Tag; created: boolean }>> {
    const name = normalizeName(rawName);
    if (!name || name.length > 50) {
      return Err.validation("Tag name is required (max 50 chars)");
    }

    const color = validHexColor(rawColor);

    const count = await prisma.tag.count({ where: { userId } });
    if (count >= MAX_TAGS_PER_USER) {
      return Err.limitReached(`Maximum ${MAX_TAGS_PER_USER} tags allowed`);
    }

    const existing = await prisma.tag.findUnique({
      where: { userId_name: { userId, name } },
    });
    if (existing) {
      return success({ tag: existing, created: false });
    }

    const tag = await prisma.tag.create({
      data: { name, color, userId },
    });
    return success({ tag, created: true });
  },

  async update(
    userId: string,
    tagId: string,
    data: { name?: string; color?: string },
  ): Promise<Result<Tag>> {
    const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
    if (!tag) return Err.notFound();

    const name =
      data.name !== undefined ? normalizeName(data.name) : undefined;
    if (name !== undefined && (!name || name.length > 50)) {
      return Err.validation("Tag name is required (max 50 chars)");
    }

    if (
      data.color !== undefined &&
      !/^#[0-9A-Fa-f]{6}$/.test(data.color.trim())
    ) {
      return Err.validation("color must be a valid hex color (e.g. #7c3aed)");
    }

    if (name && name !== tag.name) {
      const dup = await prisma.tag.findUnique({
        where: { userId_name: { userId, name } },
      });
      if (dup) return Err.conflict("A tag with that name already exists");
    }

    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: {
        ...(name !== undefined && { name }),
        ...(data.color !== undefined && { color: data.color.trim() }),
      },
    });
    return success(updated);
  },

  async remove(userId: string, tagId: string): Promise<Result<void>> {
    const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
    if (!tag) return Err.notFound();

    await prisma.tag.delete({ where: { id: tag.id } });
    return success(undefined);
  },

  async listForSong(
    userId: string,
    songId: string,
  ): Promise<Result<Tag[]>> {
    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
    });
    if (!song) return Err.notFound();

    const songTags = await prisma.songTag.findMany({
      where: { songId: song.id },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });
    return success(songTags.map((st) => st.tag));
  },

  async addToSong(
    userId: string,
    songId: string,
    opts: { tagId?: string; name?: string },
  ): Promise<Result<{ tag: Tag; created: boolean }>> {
    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
    });
    if (!song) return Err.notFound();

    if (!opts.tagId && !opts.name) {
      return Err.validation("Tag name or tagId required");
    }

    const tagName = opts.name ? normalizeName(opts.name) : "";
    if (opts.name && tagName.length > 50) {
      return Err.validation("Tag name must be 50 characters or less");
    }

    const songTagCount = await prisma.songTag.count({
      where: { songId: song.id },
    });
    if (songTagCount >= MAX_TAGS_PER_SONG) {
      return Err.limitReached(`Maximum ${MAX_TAGS_PER_SONG} tags per song`);
    }

    let tag: Tag | null;
    if (opts.tagId) {
      tag = await prisma.tag.findFirst({
        where: { id: opts.tagId, userId },
      });
      if (!tag) return Err.notFound("Tag not found");
    } else {
      tag = await prisma.tag.findUnique({
        where: { userId_name: { userId, name: tagName } },
      });
      if (!tag) {
        const userTagCount = await prisma.tag.count({ where: { userId } });
        if (userTagCount >= MAX_TAGS_PER_USER) {
          return Err.limitReached(
            `Maximum ${MAX_TAGS_PER_USER} tags allowed`,
          );
        }
        tag = await prisma.tag.create({ data: { name: tagName, userId } });
      }
    }

    const existing = await prisma.songTag.findUnique({
      where: { songId_tagId: { songId: song.id, tagId: tag.id } },
    });
    if (existing) return success({ tag, created: false });

    await prisma.songTag.create({
      data: { songId: song.id, tagId: tag.id },
    });
    return success({ tag, created: true });
  },

  async removeFromSong(
    userId: string,
    songId: string,
    tagId: string,
  ): Promise<Result<void>> {
    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
    });
    if (!song) return Err.notFound();

    const songTag = await prisma.songTag.findUnique({
      where: { songId_tagId: { songId: song.id, tagId } },
    });
    if (!songTag) return Err.notFound("Tag not assigned to this song");

    await prisma.songTag.delete({ where: { id: songTag.id } });
    return success(undefined);
  },
};
