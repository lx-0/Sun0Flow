import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/network";

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2048;
const MAX_URL_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 512;

// Simple in-memory rate limiter per IP: max 10 reports per minute
const ipCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipCounts.get(ip);

  if (!entry || now >= entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  ipCounts.forEach((entry, ip) => {
    if (now >= entry.resetAt) {
      ipCounts.delete(ip);
    }
  });
}, 5 * 60_000).unref?.();

const VALID_SOURCE_PREFIXES = [
  "error-boundary",
  "global-error-boundary",
  "unhandled-error",
  "unhandled-rejection",
  "chunk-load-error",
];

function isValidSource(source: string): boolean {
  return VALID_SOURCE_PREFIXES.some((prefix) => source === prefix || source.startsWith(`${prefix}:`));
}

const bodySchema = z.object({
  message: z.string().min(1),
  url: z.string().min(1),
  source: z.string().refine((source) => isValidSource(source), {
    message: `source must start with one of: ${VALID_SOURCE_PREFIXES.join(", ")}`,
  }),
  stack: z.string().optional(),
  userAgent: z.string().optional(),
});

async function createErrorReportEntry(body: z.infer<typeof bodySchema>) {
  await prisma.errorReport.create({
    data: {
      message: body.message.slice(0, MAX_MESSAGE_LENGTH),
      stack: body.stack ? body.stack.slice(0, MAX_STACK_LENGTH) : null,
      url: body.url.slice(0, MAX_URL_LENGTH),
      userAgent: body.userAgent ? body.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
      source: body.source,
    },
  });
}

export const POST = publicRoute<Record<string, never>, z.infer<typeof bodySchema>>(async (request, { body }) => {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        error: "Too many error reports. Please try again later.",
        code: "RATE_LIMIT",
      },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

  try {
    await createErrorReportEntry(body);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    logger.error({ err }, "error-report: failed to store error report");
    return NextResponse.json(
      { error: "Failed to store report", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}, {
  route: "/api/error-report",
  body: bodySchema,
});
