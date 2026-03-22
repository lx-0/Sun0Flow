import { NextResponse } from "next/server";
import { SKILL_MARKDOWN } from "@/lib/agent-skill";

export async function GET() {
  return new NextResponse(SKILL_MARKDOWN, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sunoflow-skill.md"',
    },
  });
}
