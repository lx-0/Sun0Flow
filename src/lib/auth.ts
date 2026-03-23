import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        if (user.isDisabled) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordMatch) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
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
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id as string },
          select: { onboardingCompleted: true, isAdmin: true, emailVerified: true, sunoApiKey: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.emailVerified = dbUser?.emailVerified?.toISOString() ?? null;
        token.hasSunoApiKey = Boolean(dbUser?.sunoApiKey);
      }
      if (trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { onboardingCompleted: true, isAdmin: true, emailVerified: true, sunoApiKey: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
        token.isAdmin = dbUser?.isAdmin ?? false;
        token.emailVerified = dbUser?.emailVerified?.toISOString() ?? null;
        token.hasSunoApiKey = Boolean(dbUser?.sunoApiKey);
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
      }
      return session;
    },
  },
});
