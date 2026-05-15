import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { exportUserData } from "@/lib/data-export";

const exportQuery = z.object({
  format: z.string().optional().default("json"),
  type: z.string().optional().default("all"),
});

export const GET = authRoute(async (_request, { auth, query }) => {
  const result = await exportUserData(
    auth.userId,
    query.format,
    query.type,
  );

  if (!result.ok) return resultResponse(result);

  return new NextResponse(result.data.content, {
    status: 200,
    headers: {
      "Content-Type": result.data.contentType,
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
    },
  });
}, { route: "/api/export", query: exportQuery });
