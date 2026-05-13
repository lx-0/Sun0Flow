import { readFile } from "node:fs/promises";
import path from "node:path";

const SKILL_FILE_PATH = path.join(process.cwd(), "src/content/agent-skill.md");

let cachedSkillMarkdown: string | null = null;

export async function getSkillMarkdown(): Promise<string> {
  if (cachedSkillMarkdown !== null) {
    return cachedSkillMarkdown;
  }

  cachedSkillMarkdown = await readFile(SKILL_FILE_PATH, "utf8");
  return cachedSkillMarkdown;
}

export function resetSkillMarkdownCacheForTest(): void {
  cachedSkillMarkdown = null;
}
