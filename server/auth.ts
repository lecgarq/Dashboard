import "server-only";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "./db";
import { enqueuePendingUser, isEmailApproved } from "@/lib/sheets";
import { sendPendingRequestEmail, sendAdminNotificationEmail } from "@/lib/email";
import { authConfig } from "@/auth.config";
import userEvents from "@/lib/user-events";
import {
  getGoogleChatClientId,
  getGoogleChatClientSecret,
  googleAuthScopeString,
  googleChatAuthScopeString,
} from "@/lib/google-oauth";

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
      console.log(`[AUTH DEBUG] Autodesk Raw Profile:`, JSON.stringify(profile));
      const email = ((profile.email as string) || "").toLowerCase().trim();
      if (!email) {
        console.error("[AUTH DEBUG] Autodesk profile missing email!");
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
        role: user.role, // Added role to satisfy lint
      } as any;
    },
  }),
];


export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db) as any,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;

      const profileEmail = ((profile?.email as string) ?? user.email)?.trim().toLowerCase();
      const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()?.trim() || "luis.ecorteg@gmail.com";
      const secondaryAdminEmail = "luis.cortes@hermosillo.com";
      
      console.log(`[AUTH DEBUG] Provider: ${account?.provider}, Profile Email: "${profileEmail}"`);

      if (!account || !profileEmail) {
        console.error(`[AUTH DEBUG] REJECTED - Missing account or email`);
        return false;
      }

      try {
        const now = new Date();
        
        // 1. Identify the Target User record
        // If the email is either the primary admin OR the known secondary admin email,
        // we map EVERYTHING to the primary admin user ID.
        let targetEmail = profileEmail;
        if (profileEmail === adminEmail || profileEmail === secondaryAdminEmail) {
          console.log(`[AUTH DEBUG] ADMIN ALIAS DETECTED - Mapping to ${adminEmail}`);
          targetEmail = adminEmail;
        }

        const existingUser = await db.user.findUnique({
          where: { email: targetEmail },
        });

        let userId: string;

        if (existingUser) {
          userId = existingUser.id;
          // Ensure role is ADMIN if it matches our admin set
          const role = (targetEmail === adminEmail) ? "ADMIN" : existingUser.role;
          // Sync profile picture from OAuth provider on every login
          const freshImage = (user.image || profile?.picture as string || profile?.image as string || existingUser.image || null) as string | null;
          await db.$executeRaw`UPDATE "User" SET role = ${role}, image = ${freshImage}, "lastLoginAt" = ${now} WHERE id = ${userId}`;
        } else {
          // Brand new user
          const role = (targetEmail === adminEmail) ? "ADMIN" : "VIEWER";
          if (role !== "ADMIN") {
            const approved = await isEmailApproved(profileEmail);
            if (!approved) return false;
          }
          userId = randomUUID();
          await db.$executeRaw`
            INSERT INTO "User" (id, email, name, image, role, "lastLoginAt", "createdAt")
            VALUES (${userId}, ${targetEmail}, ${user.name || ""}, ${user.image || null}, ${role}, ${now}, ${now})
          `;
        }

        // 2. Force link the OAuth identity to this specific User ID
        const authAccount = account as any;
        await db.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          update: {
            userId,
            access_token: authAccount.access_token ?? null,
            // Only overwrite refresh_token if a new one was issued (Google only returns it on first consent)
            ...(authAccount.refresh_token ? { refresh_token: authAccount.refresh_token } : {}),
            expires_at: authAccount.expires_at ?? null,
            token_type: authAccount.token_type ?? null,
            scope: authAccount.scope ?? null,
            id_token: authAccount.id_token ?? null,
          },
          create: {
            userId,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: authAccount.access_token ?? null,
            refresh_token: authAccount.refresh_token ?? null,
            expires_at: authAccount.expires_at ?? null,
            token_type: authAccount.token_type ?? null,
            scope: authAccount.scope ?? null,
            id_token: authAccount.id_token ?? null,
            session_state: (typeof authAccount.session_state === "string") ? authAccount.session_state : null,
          },
        });

        console.log(`[AUTH DEBUG] SUCCESS - Account linked for ${targetEmail}`);
        userEvents.emit("user-linked", { userId, provider: account.provider });
        return true;

      } catch (err) {
        console.error(`[AUTH DEBUG] FATAL ERROR: ${err instanceof Error ? err.message : err}`);
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

        const moduleRows = await db.$queryRaw<Array<{ module: string }>>`
          SELECT module FROM "UserModuleAccess" WHERE "userId" = ${userId}
        `;
        token.moduleAccess = moduleRows.map((m) => m.module);
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.image = (token.picture as string) ?? null;
        (session.user as any).role = token.role ?? "VIEWER";
        (session.user as any).providers = (token as any).providers ?? [];
        (session.user as any).hasCredentials = (token as any).hasCredentials ?? false;
        (session.user as any).moduleAccess = (token as any).moduleAccess ?? [];
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
