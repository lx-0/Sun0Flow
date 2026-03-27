/**
 * Test-only login endpoint for Playwright E2E tests.
 *
 * This endpoint bypasses the CSRF check by creating a signed JWT session
 * token directly and setting the session cookie, replicating what NextAuth
 * would do after a successful credentials callback.
 *
 * IMPORTANT: Only active when PLAYWRIGHT_TEST=true (set by playwright.config.ts
 * webServer env). Returns 404 in all other environments.
 */
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const PLAYWRIGHT_TEST = process.env.PLAYWRIGHT_TEST === "true";

export async function POST(req: NextRequest) {
  if (!PLAYWRIGHT_TEST) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  let email: string, password: string;
  try {
    const body = await req.json();
    email = body.email;
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const useSecureCookies = (process.env.AUTH_URL ?? "").startsWith("https://");
  const cookieName = useSecureCookies
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
    },
    secret,
    salt: cookieName,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureCookies,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
