import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const startedAt = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: true, uptime });
  } catch {
    return NextResponse.json(
      { status: "error", db: false, uptime },
      { status: 503 }
    );
  }
}
