import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/network";

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2048;
const MAX_URL_LENGTH = 2048;

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
  return VALID_SOURCE_PREFIXES.some((prefix) => source === prefix || source.startsWith(prefix + ":"));
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many error reports. Please try again later.", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { message, stack, url, userAgent, source } = body as Record<string, unknown>;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  if (!source || typeof source !== "string" || !isValidSource(source)) {
    return NextResponse.json({ error: "source must start with one of: " + VALID_SOURCE_PREFIXES.join(", "), code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    await prisma.errorReport.create({
      data: {
        message: message.slice(0, MAX_MESSAGE_LENGTH),
        stack: typeof stack === "string" ? stack.slice(0, MAX_STACK_LENGTH) : null,
        url: url.slice(0, MAX_URL_LENGTH),
        userAgent: typeof userAgent === "string" ? userAgent.slice(0, 512) : null,
        source,
      },
    });

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    logger.error({ err }, "error-report: failed to store error report");
    return NextResponse.json({ error: "Failed to store report", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
