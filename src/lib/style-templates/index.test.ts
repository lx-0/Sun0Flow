import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: { findFirst: vi.fn() },
    styleTemplate: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  MAX_STYLE_TEMPLATES,
  createStyleTemplate,
  deleteStyleTemplate,
  listStyleTemplates,
  updateStyleTemplate,
} from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("style templates service", () => {
  it("lists templates for user newest first", async () => {
    vi.mocked(prisma.styleTemplate.findMany).mockResolvedValue([{ id: "t1" }] as never);

    const templates = await listStyleTemplates("u1");

    expect(prisma.styleTemplate.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { createdAt: "desc" },
    });
    expect(templates).toEqual([{ id: "t1" }]);
  });

  it("returns not found when source song does not belong to user", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue(null as never);

    const result = await createStyleTemplate("u1", {
      name: "Template",
      tags: "synthwave",
      sourceSongId: "song-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("returns limit reached when user is at max templates", async () => {
    vi.mocked(prisma.styleTemplate.count).mockResolvedValue(MAX_STYLE_TEMPLATES as never);

    const result = await createStyleTemplate("u1", {
      name: "Template",
      tags: "synthwave",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LIMIT_REACHED");
    expect(prisma.styleTemplate.create).not.toHaveBeenCalled();
  });

  it("creates template with trimmed sourceSongId", async () => {
    vi.mocked(prisma.song.findFirst).mockResolvedValue({ id: "song-1" } as never);
    vi.mocked(prisma.styleTemplate.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.styleTemplate.create).mockResolvedValue({ id: "t1" } as never);

    const result = await createStyleTemplate("u1", {
      name: "Template",
      tags: "synthwave",
      sourceSongId: " song-1 ",
    });

    expect(result.ok).toBe(true);
    expect(prisma.styleTemplate.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        name: "Template",
        tags: "synthwave",
        sourceSongId: "song-1",
      },
    });
  });

  it("returns not found when updating missing template", async () => {
    vi.mocked(prisma.styleTemplate.findFirst).mockResolvedValue(null as never);

    const result = await updateStyleTemplate("u1", "t1", { name: "New name" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("updates only provided fields", async () => {
    vi.mocked(prisma.styleTemplate.findFirst).mockResolvedValue({ id: "t1" } as never);
    vi.mocked(prisma.styleTemplate.update).mockResolvedValue({ id: "t1", tags: "new" } as never);

    const result = await updateStyleTemplate("u1", "t1", { tags: "new" });

    expect(result.ok).toBe(true);
    expect(prisma.styleTemplate.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { tags: "new" },
    });
  });

  it("returns not found when deleting missing template", async () => {
    vi.mocked(prisma.styleTemplate.findFirst).mockResolvedValue(null as never);

    const result = await deleteStyleTemplate("u1", "t1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(prisma.styleTemplate.delete).not.toHaveBeenCalled();
  });
});
