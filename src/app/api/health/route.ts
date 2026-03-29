import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getMetricsSnapshot } from "@/lib/metrics";
import { getSchedulerStatus } from "@/lib/scheduler";

const startedAt = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  try {
    await prisma.$queryRaw`SELECT 1`;
    const metrics = getMetricsSnapshot();
    const jobs = getSchedulerStatus();
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: true,
      uptime,
      generation: {
        queueDepth: metrics.generation.queueDepth,
        total: metrics.generation.total,
        completed: metrics.generation.completed,
        failed: metrics.generation.failed,
        lastSuccessfulGenerationAt: metrics.generation.lastCompletedAt,
      },
      jobs: jobs.map((j) => ({
        name: j.name,
        schedule: j.schedule,
        running: j.running,
        nextRun: j.nextRun,
        lastRun: j.lastRun
          ? {
              startedAt: j.lastRun.startedAt,
              durationMs: j.lastRun.durationMs,
              success: j.lastRun.success,
              ...(j.lastRun.error ? { error: j.lastRun.error } : {}),
            }
          : null,
      })),
    });
  } catch {
    return NextResponse.json(
      { status: "error", db: false, uptime },
      { status: 503 }
    );
  }
}
