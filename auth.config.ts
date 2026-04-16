import type { NextAuthConfig } from "next-auth";

const publicRoutes = ["/login", "/unauthorized", "/register", "/forgot-password", "/reset-password"];

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const pathname = nextUrl.pathname;

      if (
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/connect") ||
        pathname.startsWith("/api/trpc") ||
        pathname.startsWith("/api/wiki-collab-token") ||
        pathname.startsWith("/api/wiki-media")
      ) {
        return true;
      }
      if (publicRoutes.some((route) => pathname.startsWith(route))) return true;

      return !!auth?.user;
    },
  },
  providers: [], // Providers added in server/auth.ts
  trustHost: true,
};
