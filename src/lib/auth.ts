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
    async signIn({ user }) {
      if (allowedEmails.length === 0) return true;
      const email = user.email?.toLowerCase() ?? "";
      return allowedEmails.includes(email);
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
