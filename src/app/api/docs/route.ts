import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { openApiSpec } from "@/lib/openapi";

export async function GET(request: Request) {
  const { error: authError } = await resolveUser(request);

  if (authError) return authError;

  return NextResponse.json(openApiSpec);
}
