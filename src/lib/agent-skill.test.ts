import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { getSkillMarkdown, resetSkillMarkdownCacheForTest } from "@/lib/agent-skill";

describe("getSkillMarkdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSkillMarkdownCacheForTest();
  });

  it("reads skill markdown from disk", async () => {
    vi.mocked(readFile).mockResolvedValue("# Skill" as never);

    await expect(getSkillMarkdown()).resolves.toBe("# Skill");
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("caches markdown after first read", async () => {
    vi.mocked(readFile).mockResolvedValue("# Skill" as never);

    const first = await getSkillMarkdown();
    const second = await getSkillMarkdown();

    expect(first).toBe("# Skill");
    expect(second).toBe("# Skill");
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
