import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openApiSpec } from "@/lib/openapi";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(openApiSpec);
}
