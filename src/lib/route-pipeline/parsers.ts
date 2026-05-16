import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest } from "@/lib/api-error";
import { parseQueryParams } from "@/lib/query-params";
import { formatZodIssues } from "@/lib/zod-errors";

export async function parseValidatedBody<B>(
  request: NextRequest,
  schema: z.ZodType<B>,
) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: badRequest("Invalid JSON body") } as const;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: badRequest(formatZodIssues(result.error.issues)) } as const;
  }

  return { data: result.data } as const;
}

export function parseValidatedQuery<Q>(
  request: NextRequest,
  schema: z.ZodType<Q>,
) {
  return parseQueryParams(request.nextUrl.searchParams, schema);
}
