import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/route-handler";
import { getSkillMarkdown } from "@/lib/agent-skill";

export const GET = publicRoute(async () => {
  const skillMarkdown = await getSkillMarkdown();

  return new NextResponse(skillMarkdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sunoflow-skill.md"',
    },
  });
}, { route: "/api/agent-skill" });
