import { NextResponse } from "next/server";
import { getSkillMarkdown } from "@/lib/agent-skill";

export async function GET() {
  const skillMarkdown = await getSkillMarkdown();

  return new NextResponse(skillMarkdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sunoflow-skill.md"',
    },
  });
}
