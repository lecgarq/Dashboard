import "server-only";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "./db";
import { enqueuePendingUser, isEmailApproved } from "@/lib/google/sheets";
import { sendPendingRequestEmail, sendAdminNotificationEmail } from "@/lib/server/email";
import { authConfig } from "@/auth.config";
import userEvents from "@/lib/events/user";
import {
  getGoogleChatClientId,
  getGoogleChatClientSecret,
  googleAuthScopeString,
  googleChatAuthScopeString,
} from "@/lib/google/oauth";
import { createLogger } from "@/lib/server/logger";

const authLogger = createLogger("auth");

const isProduction = process.env.NODE_ENV === "production";
const googleChatClientId = getGoogleChatClientId();
const googleChatClientSecret = getGoogleChatClientSecret();

const providers: any[] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    allowDangerousEmailAccountLinking: true,
    authorization: {
      params: {
        prompt: "consent",
        access_type: "offline",
        response_type: "code",
        scope: googleAuthScopeString,
      },
    },
  }),
  {
    ...GoogleProvider({
      clientId: googleChatClientId!,
      clientSecret: googleChatClientSecret!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: googleChatAuthScopeString,
        },
      },
    }),
    id: "google-chat",
    name: "Google Chat",
  },
  {
    id: "autodesk",
    name: "Autodesk",
    type: "oauth",
    issuer: "https://developer.api.autodesk.com",
    authorization: {
      url: "https://developer.api.autodesk.com/authentication/v2/authorize",
      params: { 
        scope: "openid data:read viewables:read user:read account:read", 
        response_type: "code" 
      },
    },
    token: "https://developer.api.autodesk.com/authentication/v2/token",
    userinfo: "https://api.userprofile.autodesk.com/userinfo",
    clientId: process.env.APS_CLIENT_ID,
    clientSecret: process.env.APS_CLIENT_SECRET,
    checks: ["state", "pkce"],
    allowDangerousEmailAccountLinking: true,
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    profile(profile: Record<string, unknown>) {
      authLogger.debug("Autodesk profile received", { profile });
      const email = ((profile.email as string) || "").toLowerCase().trim();
      if (!email) {
        authLogger.warn("Autodesk profile missing email");
      }
      return {
        id: (profile.sub as string) || (profile.userId as string) || (profile.id as string) || "",
        name: (profile.name as string) || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || (profile.userName as string) || "",
        email,
        emailVerified: new Date(),
        image: (profile.picture as string) || (profile.image as string) || null,
      };
    },
  },
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      userIdentifier: { label: "Username or Email", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.userIdentifier || !credentials?.password) return null;

      const user = await db.user.findFirst({
        where: {
          OR: [
            { email: credentials.userIdentifier as string },
            { username: credentials.userIdentifier as string },
          ],
        },
      });

      if (!user || !user.password) return null;

      const isValid = await bcrypt.compare(credentials.password as string, user.password);

      if (!isValid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
      };
    },
  }),
];


export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // @ts-expect-error — NextAuth v5 beta adapter type mismatch; safe at runtime
  adapter: PrismaAdapter(db),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;

      const profileEmail = ((profile?.email as string) ?? user.email)?.trim().toLowerCase();
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()?.trim() || "luis.ecorteg@gmail.com";
      const secondaryAdminEmail = process.env.ADMIN_EMAIL_ALIAS?.toLowerCase()?.trim() ?? "";
      
      authLogger.debug("Sign-in attempt", { provider: account?.provider, profileEmail });

      if (!account || !profileEmail) {
        authLogger.warn("Sign-in rejected — missing account or email");
        return false;
      }

      try {
        const now = new Date();
        
        // 1. Identify the Target User record
        // If the email is either the primary admin OR the known secondary admin email,
        // we map EVERYTHING to the primary admin user ID.
        let targetEmail = profileEmail;
        if (profileEmail === adminEmail || profileEmail === secondaryAdminEmail) {
          authLogger.info("Admin alias detected", { from: profileEmail, to: adminEmail });
          targetEmail = adminEmail;
        }

        const existingUser = await db.user.findUnique({
          where: { email: targetEmail },
        });

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
          const role = (targetEmail === adminEmail) ? "ADMIN" : existingUser.role;
          const freshImage = (user.image || profile?.picture as string || profile?.image as string || existingUser.image || null) as string | null;
          await db.user.update({
            where: { id: userId },
            data: { role, image: freshImage, lastLoginAt: now },
          });
        } else {
          // Brand new user
          const role = (targetEmail === adminEmail) ? "ADMIN" : "VIEWER";
          if (role !== "ADMIN") {
            const approved = await isEmailApproved(profileEmail);
            if (!approved) return false;
          }
          userId = randomUUID();
          await db.user.create({
            data: {
              id: userId,
              email: targetEmail,
              name: user.name || "",
              image: user.image || null,
              role,
              lastLoginAt: now,
            },
          });
        }

        // 2. Force link the OAuth identity to this specific User ID
        await db.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          update: {
            userId,
            access_token: account.access_token ?? null,
            // Only overwrite refresh_token if a new one was issued (Google only returns it on first consent)
            ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
            id_token: account.id_token ?? null,
          },
          create: {
            userId,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
            id_token: account.id_token ?? null,
            session_state: (typeof account.session_state === "string") ? account.session_state : null,
          },
        });

        authLogger.info("Account linked", { email: targetEmail, provider: account?.provider });
        userEvents.emit("user-linked", { userId, provider: account.provider });
        return true;

      } catch (err) {
        authLogger.error("Fatal sign-in error", { err });
        return false;
      }
    },
    async jwt({ token, user }) {
      const userId = token.sub as string;

      // Always refresh role, moduleAccess, providers, and hasCredentials from DB
      // (enables real-time admin changes without re-login)
      if (userId) {
        const dbUser = await db.user.findUnique({
          where: { id: userId },
          select: { role: true, password: true, username: true, image: true },
        });

        if (dbUser) {
          token.role = dbUser.role;
          token.hasCredentials = !!(dbUser.password && dbUser.username);
          token.picture = dbUser.image ?? null;
        }

        const accounts = await db.account.findMany({
          where: { userId },
          select: { provider: true },
        });
        token.providers = accounts.map((a) => a.provider);

        const moduleRows = await db.userModuleAccess.findMany({
          where: { userId },
          select: { module: true },
        });
        token.moduleAccess = moduleRows.map((m) => m.module);
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.image = (token.picture as string) ?? null;
        session.user.role = token.role ?? "VIEWER";
        session.user.providers = token.providers ?? [];
        session.user.hasCredentials = token.hasCredentials ?? false;
        session.user.moduleAccess = token.moduleAccess ?? [];
      }
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
    },
  },
  trustHost: true,
});
