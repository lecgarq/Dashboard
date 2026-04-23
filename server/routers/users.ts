import { z } from "zod";
import { router, adminProcedure, publicProcedure, protectedProcedure } from "../trpc";
import { isEmailApproved, enqueuePendingUser, writeUserPermissionsToSheets } from "@/lib/google/sheets";
import { listCalendarGuestDirectory } from "@/lib/google/directory";
import bcrypt from "bcryptjs";
import { getAuthUrl } from "@/lib/auth-env";
import { getPrimaryAdminEmail, isPrimaryAdminEmail } from "@/lib/auth-env";
import { TRPCError } from "@trpc/server";
import { sendPasswordResetEmail, sendWelcomeEmail, sendApprovedEmail, sendDeclinedEmail, sendAdminNotificationEmail } from "@/lib/server/email";
import { randomUUID } from "crypto";
import userEvents from "@/lib/events/user";
import { createLogger } from "@/lib/server/logger";
import { IntegrationError } from "@/lib/server/integration-errors";
import { get2LeggedAutodeskToken } from "@/lib/server/aps-user-token";
import {
  fetchAccUserByEmail,
  fetchAccUserProjects,
  fetchAccUserRoles,
  fetchAccUserProducts,
  type AccProject,
} from "@/lib/server/acc-admin";

const logger = createLogger("users");

function toAccRouterError(error: unknown, fallbackMessage: string) {
  if (error instanceof IntegrationError) {
    // UNAUTHORIZED = token expired/missing/not linked (user must reconnect)
    // FORBIDDEN    = valid token but no Account Admin privilege in the hub
    const code =
      error.code === "reconnect_required" || error.code === "config_missing"
        ? "UNAUTHORIZED"
        : error.code === "forbidden"
          ? "FORBIDDEN"
          : "INTERNAL_SERVER_ERROR";
    return new TRPCError({ code, message: error.message, cause: error });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
    cause: error instanceof Error ? error : undefined,
  });
}

const ACC_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const usersRouter = router({
  // Org directory: fetches all users from Google Workspace via People API
  getOrgDirectory: protectedProcedure.query(async ({ ctx }) => {
    return listCalendarGuestDirectory(ctx.session.user.id);
  }),

  // Local DB directory (fallback / registered users only)
  getDirectory: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
        department: true,
        jobTitle: true,
        lastLoginAt: true,
      },
      orderBy: { name: "asc" },
    });
  }),

  // Update own profile (department, jobTitle)
  updateMyProfile: protectedProcedure
    .input(
      z.object({
        department: z.string().optional(),
        jobTitle: z.string().optional(),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db.user.update({
        where: { id: userId },
        data: {
          department: input.department,
          jobTitle: input.jobTitle,
          name: input.name,
        },
      });
      return { success: true };
    }),

  getAll: adminProcedure.query(async ({ ctx }) => {
    try {
      const users = await ctx.db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          department: true,
          jobTitle: true,
          createdAt: true,
          lastLoginAt: true,
          accounts: {
            select: {
              provider: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return users.map((user) => ({
        ...user,
        isPrimaryAdmin: isPrimaryAdminEmail(user.email),
      }));
    } catch (error) {
      logger.error("Fatal error fetching users", { error });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch users from database",
      });
    }
  }),

  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUser = await ctx.db.user.findUnique({ where: { id: input.userId } });
      const primaryAdminEmail = getPrimaryAdminEmail();

      // 1. Prevent demoting the primary admin
      if (
        isPrimaryAdminEmail(targetUser?.email) &&
        input.role !== "ADMIN"
      ) {
        throw new Error("Cannot demote the primary administrator.");
      }

      // 2. Only the master admin can change any role
      if (!ctx.session.user.isPrimaryAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Only the master administrator (${primaryAdminEmail}) can manage user roles.`,
        });
      }

      const updated = await ctx.db.user.update({
        where: { id: input.userId },
        data: { role: input.role },
      });

      // Sync with Google Sheets
      try {
        const modules = await ctx.db.userModuleAccess.findMany({
          where: { userId: input.userId },
          select: { module: true },
        });
        await writeUserPermissionsToSheets(
          updated.email,
          updated.id,
          modules.map((m) => m.module),
          updated.role
        );
      } catch (error) {
        logger.error("Sheets sync failed after role update", { email: updated.email, error });
      }

      // Emit real-time event
      userEvents.emit("user-update", {
        type: "role-updated",
        userId: updated.id,
        role: updated.role
      });

      return updated;
    }),

  register: publicProcedure
    .input(
      z.object({
        name: z.string(),
        username: z.string().min(3),
        email: z.string().email(),
        password: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const username = input.username.toLowerCase().trim();

      const approved = await isEmailApproved(email);
      if (!approved) {
        try {
          await enqueuePendingUser({ email, name: input.name, provider: "credentials", providerAccountId: "" });

          const now = new Date();
          await ctx.db.pendingRequest.upsert({
            where: { email },
            update: {
              name: input.name,
              provider: "credentials",
              status: "PENDING",
              requestedAt: now,
            },
            create: {
              email,
              name: input.name,
              provider: "credentials",
              status: "PENDING",
              requestedAt: now,
            },
          });
        } catch (err) { 
          logger.error("Failed to enqueue/upsert pending request", { err });
        }
        
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This email is not whitelisted for registration. A request has been sent to the administrator.",
        });
      }

      const existing = await ctx.db.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email or username already exists.",
        });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      const newUser = await ctx.db.user.create({
        data: { name: input.name, username, email, password: hashedPassword },
      });

      try {
        await sendWelcomeEmail(email, input.name);
      } catch (error) {
        logger.error("Welcome email failed", { email, error });
      }
      try {
        await sendAdminNotificationEmail(email, input.name);
      } catch (error) {
        logger.error("Admin notification email failed", { email, error });
      }

      // Default role for new users
      if (isPrimaryAdminEmail(email)) {
        await ctx.db.user.update({ where: { id: newUser.id }, data: { role: "ADMIN" } });
      }

      return newUser;
    }),

  removeAndBlacklistUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
      if (!user || !user.email) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

      if (isPrimaryAdminEmail(user.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the primary administrator." });
      }

      const email = user.email.toLowerCase().trim();

      // 1. Delete user (and cascades)
      await ctx.db.user.delete({ where: { id: input.userId } });

      // 2. Clear from approved list and update pending status
      await ctx.db.approvedEmail.deleteMany({ where: { email } });
      await ctx.db.pendingRequest.upsert({
        where: { email },
        update: {
          name: user.name || "",
          provider: "credentials",
          status: "BLACKLISTED",
          requestedAt: new Date(),
        },
        create: {
          email,
          name: user.name || "",
          provider: "credentials",
          status: "BLACKLISTED",
          requestedAt: new Date(),
        },
      });

      return { success: true };
    }),

  getProvidersByEmail: publicProcedure
    .input(z.object({ userIdentifier: z.string() }))
    .query(async ({ ctx, input }) => {
      const identifier = input.userIdentifier.trim().toLowerCase();
      const user = await ctx.db.user.findFirst({
        where: { OR: [{ email: identifier }, { username: identifier }] },
        include: { accounts: true },
      });
      if (!user) return { providers: [] as string[] };
      return { providers: user.accounts.map((account) => account.provider) };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.trim().toLowerCase();

      const user = await ctx.db.user.findUnique({ where: { email } });
      if (!user) return { success: true };

      const { randomBytes } = await import("crypto");
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      const now = new Date();

      await ctx.db.passwordResetToken.deleteMany({ where: { email } });
      await ctx.db.passwordResetToken.create({
        data: { email, token, expires, createdAt: now },
      });

      const baseUrl = getAuthUrl() ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      try {
        await sendPasswordResetEmail(email, resetUrl);
      } catch (err) {
        logger.error("Failed to send password reset email", { email, err });
        await ctx.db.passwordResetToken.deleteMany({ where: { email } });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Password reset email could not be sent right now. Please contact the administrator.",
        });
      }

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.db.passwordResetToken.findUnique({
        where: { token: input.token },
      });

      if (!record || new Date() > new Date(record.expires)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired reset token." });
      }

      const hashed = await bcrypt.hash(input.newPassword, 10);
      await ctx.db.user.update({
        where: { email: record.email },
        data: { password: hashed },
      });

      await ctx.db.passwordResetToken.delete({ where: { token: input.token } });

      return { success: true };
    }),

  getMyLinkedProviders: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id as string;
    const accounts = await ctx.db.account.findMany({
      where: { userId },
      select: { provider: true },
    });
    return accounts.map((a) => a.provider);
  }),

  setupCredentials: protectedProcedure
    .input(z.object({ username: z.string().min(3), password: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id as string;
      const dbUser = await ctx.db.user.findUnique({ where: { id: userId } });

      if (!dbUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (dbUser.password !== null) {
        throw new TRPCError({ code: "CONFLICT", message: "Credentials are already set up for this account." });
      }

      const username = input.username.trim().toLowerCase();
      const existing = await ctx.db.user.findFirst({ where: { username, NOT: { id: userId } } });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already taken." });
      }

      const hashed = await bcrypt.hash(input.password, 10);
      await ctx.db.user.update({ where: { id: userId }, data: { username, password: hashed } });

      return { success: true };
    }),

  // ─── Pending Approval — raw SQL so prisma generate is not required ───────────

  getPendingRequests: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.pendingRequest.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        email: true,
        name: true,
        provider: true,
        requestedAt: true,
        status: true,
        userId: true,
      },
      orderBy: { requestedAt: "desc" },
    });
  }),

  approvePendingRequest: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const pending = await ctx.db.pendingRequest.findUnique({
        where: { email },
        select: { name: true },
      });

      await ctx.db.pendingRequest.updateMany({
        where: { email },
        data: { status: "APPROVED" },
      });

      await ctx.db.approvedEmail.upsert({
        where: { email },
        create: { email },
        update: {},
      });

      const user = await ctx.db.user.findUnique({ where: { email } });
      if (user) {
        const modules = ["families", "clash", "exam", "trello"];
        await ctx.db.userModuleAccess.createMany({
          data: modules.map((module) => ({
            id: randomUUID(),
            userId: user.id,
            module,
          })),
          skipDuplicates: true,
        });
      }

      try {
        await sendApprovedEmail(email, pending?.name ?? undefined);
      } catch (error) {
        logger.error("Approval email failed", { email, error });
      }

      userEvents.emit("user-update", { type: "user-approved", email });

      return { success: true };
    }),

  declinePendingRequest: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const pending = await ctx.db.pendingRequest.findUnique({
        where: { email },
        select: { name: true },
      });

      await ctx.db.pendingRequest.updateMany({
        where: { email },
        data: { status: "BLACKLISTED" },
      });

      try {
        await sendDeclinedEmail(email, pending?.name ?? undefined);
      } catch (error) {
        logger.error("Decline email failed", { email, error });
      }

      return { success: true };
    }),

  getBlacklistedRequests: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.pendingRequest.findMany({
      where: { status: "BLACKLISTED" },
      select: {
        id: true,
        email: true,
        name: true,
        provider: true,
        requestedAt: true,
        status: true,
        userId: true,
      },
      orderBy: { requestedAt: "desc" },
    });
  }),

  restoreBlacklistedRequest: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      
      // Move to PENDING so admin can decide again, or just move to APPROVED?
      // User said: "switching them to the users 'where they are approved'"
      // Let's move to PENDING as a safe middle ground, 
      // or provide a direct "Restore & Approve" button.
      // Let's implement restore as "Move to Pending".
      
      await ctx.db.pendingRequest.updateMany({
        where: { email },
        data: { status: "PENDING" },
      });

      return { success: true };
    }),

  blacklistUser: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      await ctx.db.pendingRequest.updateMany({
        where: { email },
        data: { status: "BLACKLISTED" },
      });
      await ctx.db.approvedEmail.deleteMany({ where: { email } });
      return { success: true };
    }),

  removeAccount: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      const email = user.email.toLowerCase().trim();

      if (isPrimaryAdminEmail(email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the primary administrator." });
      }

      await ctx.db.user.delete({ where: { id: input.userId } });
      await ctx.db.approvedEmail.deleteMany({ where: { email } });
      await ctx.db.pendingRequest.deleteMany({ where: { email } });

      userEvents.emit("user-update", { type: "user-removed", userId: input.userId });
      return { success: true };
    }),

  blacklistMember: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      const email = user.email.toLowerCase().trim();

      if (isPrimaryAdminEmail(email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the primary administrator." });
      }

      await ctx.db.user.delete({ where: { id: input.userId } });
      await ctx.db.approvedEmail.deleteMany({ where: { email } });
      await ctx.db.pendingRequest.upsert({
        where: { email },
        update: {
          name: user.name || "",
          provider: "credentials",
          status: "BLACKLISTED",
          requestedAt: new Date(),
        },
        create: {
          email,
          name: user.name || "",
          provider: "credentials",
          status: "BLACKLISTED",
          requestedAt: new Date(),
        },
      });

      userEvents.emit("user-update", { type: "user-blacklisted", userId: input.userId });
      return { success: true };
    }),

  // ─── Module Access — raw SQL ─────────────────────────────────────────────────

  getUserModuleAccess: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.userModuleAccess.findMany({
        where: { userId: input.userId },
        select: { module: true },
      });
      return rows.map((row) => row.module);
    }),

  setUserModuleAccess: adminProcedure
    .input(z.object({ userId: z.string(), modules: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(async (tx) => {
        await tx.userModuleAccess.deleteMany({ where: { userId: input.userId } });
        if (input.modules.length > 0) {
          await tx.userModuleAccess.createMany({
            data: input.modules.map((module) => ({
              id: randomUUID(),
              userId: input.userId,
              module,
            })),
          });
        }
      });

      // Sync with Google Sheets
      try {
        const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
        if (user) {
          await writeUserPermissionsToSheets(
            user.email,
            user.id,
            input.modules,
            user.role
          );
        }
      } catch (error) {
        logger.error("Sheets sync failed after module access update", { userId: input.userId, error });
      }

      // Emit real-time event
      userEvents.emit("user-update", {
        type: "module-access-updated",
        userId: input.userId,
        modules: input.modules
      });

      return { success: true };
    }),

  unlinkAccount: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id as string;
      
      await ctx.db.account.deleteMany({
        where: {
          userId,
          provider: input.provider,
        },
      });

      // Emit event to refresh frontend session
      userEvents.emit("user-linked", { userId, provider: `unlinked-${input.provider}` });
      
      return { success: true };
    }),

  // ── Profile Picture ───────────────────────────────────────────────────────

  uploadAvatar: protectedProcedure
    .input(z.object({
      // base64 data URL, e.g. "data:image/png;base64,iVBOR..."
      dataUrl: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const fs = await import("fs/promises");
      const path = await import("path");

      // Extract extension from data URL
      const match = input.dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image format" });

      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      const base64Data = input.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Limit to 2MB
      if (buffer.length > 2 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be under 2MB" });
      }

      const dir = path.join(process.cwd(), "public", "avatars");
      await fs.mkdir(dir, { recursive: true });

      const filename = `${userId}.${ext}`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, buffer);

      const imageUrl = `/avatars/${filename}?t=${Date.now()}`;
      await ctx.db.user.update({
        where: { id: userId },
        data: { image: imageUrl },
      });

      return { image: imageUrl };
    }),

  deleteAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const fs = await import("fs/promises");
    const path = await import("path");

    // Try to remove avatar files
    const dir = path.join(process.cwd(), "public", "avatars");
    for (const ext of ["png", "jpg", "webp", "gif"]) {
      try {
        await fs.unlink(path.join(dir, `${userId}.${ext}`));
      } catch { /* file may not exist */ }
    }

    await ctx.db.user.update({
      where: { id: userId },
      data: { image: null },
    });
    return { success: true };
  }),

  // ── ACC Project Intelligence ──────────────────────────────────────────────

  getAccProfile: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      const { email, forceRefresh } = input;

      // 1. Cache check — skip if forceRefresh requested
      if (!forceRefresh) {
        const cached = await ctx.db.accMemberCache.findUnique({
          where: { email },
        });
        if (
          cached &&
          Date.now() - cached.syncedAt.getTime() < ACC_CACHE_TTL_MS
        ) {
          return JSON.parse(cached.data as string) as {
            found: boolean;
            syncedAt: string;
            autodeskId?: string;
            name?: string;
            status?: string;
            projects?: AccProject[];
          };
        }
      }

      // 2. Get 2-legged app token for HQ Admin API
      let accessToken: string;
      try {
        accessToken = await get2LeggedAutodeskToken();
      } catch (error) {
        throw toAccRouterError(
          error,
          "ACC Admin API: APS app credentials are not configured."
        );
      }

      // 3. Get accountId from Project table
      // CRITICAL: Strip "b." prefix — ACC Admin API uses bare UUID, not Data Management hub format
      const project = await ctx.db.project.findFirst({
        select: { apsHubId: true },
      });
      const accountId = project?.apsHubId?.replace(/^b\./, "");
      if (!accountId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "APS Hub ID is not configured. Set APS_HUB-ID in Railway environment variables.",
        });
      }

      // 4. Search ACC for the person by email
      // Returns null if not found (empty results) — NOT a 404 error per ACC API design
      let accUser;
      try {
        accUser = await fetchAccUserByEmail(accountId, email, accessToken);
      } catch (error) {
        // 403 here means admin's Autodesk account lacks Account Admin privilege in the hub
        throw toAccRouterError(
          error,
          "ACC Admin API request failed. Ensure your Autodesk account has Account Admin privileges."
        );
      }

      // 5. Person not found in ACC — cache the negative result and return
      if (!accUser) {
        const result = { found: false as const, syncedAt: new Date().toISOString() };
        await ctx.db.accMemberCache.upsert({
          where: { email },
          create: { email, data: JSON.stringify(result), syncedAt: new Date() },
          update: { data: JSON.stringify(result), syncedAt: new Date() },
        });
        return result;
      }

      // 6. Fetch project list and roles in parallel
      const [projects, rolesByProject, productsByProject] = await Promise.all([
        fetchAccUserProjects(accountId, accUser.id, accessToken).catch((error) => {
          throw toAccRouterError(error, "ACC Admin API: Failed to fetch project list.");
        }),
        fetchAccUserRoles(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
        fetchAccUserProducts(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
      ]);

      console.info(`[acc] roles map keys (${rolesByProject.size}):`, [...rolesByProject.keys()].slice(0, 5));
      console.info(`[acc] project ids (${projects.length}):`, projects.map((p) => p.id).slice(0, 5));

      const enrichedProjects: AccProject[] = projects.map((proj) => ({
        ...proj,
        roles: rolesByProject.get(proj.id) ?? proj.roles,
        modules: productsByProject.get(proj.id) ?? [],
      }));

      const result = {
        found: true as const,
        autodeskId: accUser.id,
        name: accUser.name,
        status: accUser.status,
        role: accUser.role,
        projects: enrichedProjects,
        syncedAt: new Date().toISOString(),
      };

      // 7. Upsert cache
      await ctx.db.accMemberCache.upsert({
        where: { email },
        create: { email, data: JSON.stringify(result), syncedAt: new Date() },
        update: { data: JSON.stringify(result), syncedAt: new Date() },
      });

      return result;
    }),
});
