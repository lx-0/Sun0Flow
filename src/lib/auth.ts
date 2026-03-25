import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ensureFreeSubscription } from "@/lib/billing";

export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.passwordHash) {
          logger.warn({ email }, "auth: credentials sign-in failed — user not found");
          return null;
        }

        if (user.isDisabled) {
          logger.warn({ userId: user.id }, "auth: credentials sign-in rejected — account disabled");
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordMatch) {
          logger.warn({ userId: user.id }, "auth: credentials sign-in failed — wrong password");
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        logger.info({ userId: user.id, provider: "credentials" }, "auth: sign-in success");

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensureFreeSubscription(user.id).catch((err) =>
          logger.error({ userId: user.id, err }, "auth: failed to create FREE subscription on signup")
        );
      }
    },
  },
  callbacks: {
    async jwt({ token, user, trigger, account }) {
      if (user) {
        token.id = user.id;
        // Update lastLoginAt for OAuth sign-ins (credentials flow does it in authorize)
        if (account?.provider !== "credentials") {
          await prisma.user.update({
            where: { id: user.id as string },
            data: { lastLoginAt: new Date() },
          });
          logger.info({ userId: user.id, provider: account?.provider ?? "oauth" }, "auth: sign-in success");
        }
        const [dbUser, sub] = await Promise.all([
          prisma.user.findUnique({
            where: { id: user.id as string },
            select: { onboardingCompleted: true, isAdmin: true, emailVerified: true, sunoApiKey: true },
          }),
          prisma.subscription.findUnique({
            where: { userId: user.id as string },
            select: { tier: true, status: true },
          }),
        ]);
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.emailVerified = dbUser?.emailVerified?.toISOString() ?? null;
        token.hasSunoApiKey = Boolean(dbUser?.sunoApiKey);
        token.subscriptionTier = sub?.tier ?? "free";
        token.subscriptionStatus = sub?.status ?? "active";
      }
      if (trigger === "update") {
        const [dbUser, sub] = await Promise.all([
          prisma.user.findUnique({
            where: { id: token.id as string },
            select: { onboardingCompleted: true, isAdmin: true, emailVerified: true, sunoApiKey: true },
          }),
          prisma.subscription.findUnique({
            where: { userId: token.id as string },
            select: { tier: true, status: true },
          }),
        ]);
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.emailVerified = dbUser?.emailVerified?.toISOString() ?? null;
        token.hasSunoApiKey = Boolean(dbUser?.sunoApiKey);
        token.subscriptionTier = sub?.tier ?? "free";
        token.subscriptionStatus = sub?.status ?? "active";
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as Record<string, unknown>).onboardingCompleted =
          token.onboardingCompleted as boolean;
        (session.user as unknown as Record<string, unknown>).isAdmin =
          token.isAdmin as boolean;
        (session.user as unknown as Record<string, unknown>).emailVerified =
          token.emailVerified ?? null;
        (session.user as unknown as Record<string, unknown>).hasSunoApiKey =
          token.hasSunoApiKey as boolean;
        (session.user as unknown as Record<string, unknown>).subscriptionTier =
          token.subscriptionTier ?? "free";
        (session.user as unknown as Record<string, unknown>).subscriptionStatus =
          token.subscriptionStatus ?? "active";
      }
      return session;
    },
  },
});
