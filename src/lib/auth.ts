import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

const allowedEmails = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase())
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Email allowlist
      if (allowedEmails.length > 0) {
        const email = user.email?.toLowerCase() ?? "";
        if (!allowedEmails.includes(email)) return false;
      }

      // Refresh stored OAuth tokens on every sign-in.
      // NextAuth's PrismaAdapter only writes tokens once (on linkAccount) and never
      // updates them on subsequent sign-ins, so access/refresh tokens go stale.
      if (account?.provider === "google" && account.providerAccountId && account.access_token) {
        try {
          await prisma.account.updateMany({
            where: { provider: "google", providerAccountId: account.providerAccountId },
            data: {
              access_token: account.access_token,
              // Google only returns a new refresh_token when prompt=consent is shown;
              // keep the existing one if absent rather than overwriting with null.
              ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
              expires_at: account.expires_at ?? null,
              scope: account.scope ?? undefined,
            },
          });
        } catch (err) {
          // Non-fatal — first sign-in may race with linkAccount; tokens will be correct anyway
          console.warn("[auth] Failed to refresh stored OAuth tokens:", err);
        }
      }

      return true;
    },
    async session({ session, user }) {
      // With database strategy, `user` is the DB user record
      if (session.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    // database strategy is required for E2E tests: the seed endpoint creates a real
    // session row with token "test-session-token", which NextAuth looks up here.
    // With jwt strategy the cookie must be a signed JWT, making test auth impossible.
    strategy: "database",
  },
  trustHost: true,
});
