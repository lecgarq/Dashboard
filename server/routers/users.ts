import { z } from "zod";
import { Prisma } from "@prisma/client";
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
import pLimit from "p-limit";
import { get2LeggedAutodeskToken } from "@/lib/server/aps-user-token";
import { runSimulation, type PhysicsEdge, type PhysicsNode } from "@/lib/acc/graphSimulation";
import {
  buildAccGraphSnapshot,
  normalizeAccGraphPositions,
  type AccGraphNode,
  type AccGraphStats,
} from "@/lib/acc/graphSnapshot";
import {
  fetchAccUserByEmail,
  fetchAllAccUsers,
  fetchAccUserProjects,
  fetchAccUserRoles,
  fetchAccUserProducts,
  type AccProject,
} from "@/lib/server/acc-admin";
import { getAccountId } from "@/lib/server/acc-helpers";

const logger = createLogger("users");
const ACC_GRAPH_CACHE_ID = "singleton";
const EMPTY_ACC_GRAPH_STATS: AccGraphStats = {
  uniqueFoundUsers: 0,
  uniqueProjects: 0,
  totalProjectInstances: 0,
  roleCount: 0,
  moduleCount: 0,
  nodeCount: 0,
  edgeCount: 0,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeGraphNodes(nodes: AccGraphNode[], fallbackNodes: readonly AccGraphNode[]) {
  let usedFallback = false;
  const safeNodes = nodes.map((node, index) => {
    const fallback = fallbackNodes[index] ?? node;
    const x = isFiniteNumber(node.x) ? node.x : fallback.x;
    const y = isFiniteNumber(node.y) ? node.y : fallback.y;
    const vx = isFiniteNumber(node.vx) ? node.vx : fallback.vx;
    const vy = isFiniteNumber(node.vy) ? node.vy : fallback.vy;
    usedFallback ||= x !== node.x || y !== node.y || vx !== node.vx || vy !== node.vy;
    return { ...node, x, y, vx, vy };
  });
  return { safeNodes, usedFallback };
}

function sanitizeGraphPositions(rawPositions: unknown, fallbackPositions: number[]) {
  if (!Array.isArray(rawPositions) || rawPositions.length !== fallbackPositions.length) {
    return { safePositions: fallbackPositions, usedFallback: true };
  }

  let usedFallback = false;
  const safePositions = rawPositions.map((value, index) => {
    if (isFiniteNumber(value)) return value;
    usedFallback = true;
    return fallbackPositions[index];
  });

  return { safePositions, usedFallback };
}

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

async function rebuildAccGraphCache(db: any) {
  const rows = await db.accMemberCache.findMany({ orderBy: { email: "asc" } });
  const snapshot = buildAccGraphSnapshot(rows);
  const physicsNodes: PhysicsNode[] = snapshot.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    x: node.x,
    y: node.y,
    vx: node.vx,
    vy: node.vy,
  }));
  const physicsEdges: PhysicsEdge[] = snapshot.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
  }));
  const settled = runSimulation(physicsNodes, physicsEdges);
  const settledById = new Map(settled.map((node) => [node.id, node]));
  const nodes = snapshot.nodes.map((node) => {
    const settledNode = settledById.get(node.id);
    return settledNode
      ? { ...node, x: settledNode.x, y: settledNode.y, vx: settledNode.vx, vy: settledNode.vy }
      : node;
  });
  const fallbackPositions = normalizeAccGraphPositions(snapshot.nodes);
  const { safeNodes, usedFallback: usedNodeFallback } = sanitizeGraphNodes(nodes, snapshot.nodes);
  const { safePositions: positions, usedFallback: usedPositionFallback } = sanitizeGraphPositions(
    normalizeAccGraphPositions(safeNodes),
    fallbackPositions,
  );

  if (usedNodeFallback || usedPositionFallback) {
    logger.warn("ACC graph cache rebuild produced invalid numeric values; falling back to semantic seed positions", {
      usedNodeFallback,
      usedPositionFallback,
      nodeCount: snapshot.stats.nodeCount,
    });
  }

  await db.accGraphLayoutCache.upsert({
    where: { id: ACC_GRAPH_CACHE_ID },
    create: {
      id: ACC_GRAPH_CACHE_ID,
      nodes: safeNodes as unknown as Prisma.InputJsonValue,
      edges: snapshot.edges as unknown as Prisma.InputJsonValue,
      positions,
      dataHash: snapshot.dataHash,
      nodeCount: snapshot.stats.nodeCount,
      edgeCount: snapshot.stats.edgeCount,
      instanceCount: snapshot.stats.totalProjectInstances,
      projectCount: snapshot.stats.uniqueProjects,
      nodeIds: snapshot.nodeIds,
    },
    update: {
      nodes: safeNodes as unknown as Prisma.InputJsonValue,
      edges: snapshot.edges as unknown as Prisma.InputJsonValue,
      positions,
      dataHash: snapshot.dataHash,
      nodeCount: snapshot.stats.nodeCount,
      edgeCount: snapshot.stats.edgeCount,
      instanceCount: snapshot.stats.totalProjectInstances,
      projectCount: snapshot.stats.uniqueProjects,
      nodeIds: snapshot.nodeIds,
    },
  });

  return { ...snapshot, nodes: safeNodes, positions };
}

function toStringSet(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function readAccGraphShape(raw: unknown): { found: boolean; roles: string[]; modules: string[] } {
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      data = null;
    }
  }

  if (!data || typeof data !== "object") {
    return { found: false, roles: [], modules: [] };
  }

  const record = data as { found?: unknown; projects?: unknown };
  const found = record.found === true;
  if (!found || !Array.isArray(record.projects)) {
    return { found, roles: [], modules: [] };
  }

  const roleSet = new Set<string>();
  const moduleSet = new Set<string>();
  for (const project of record.projects) {
    if (!project || typeof project !== "object") continue;
    const projectRecord = project as { roles?: unknown; modules?: unknown };
    for (const role of toStringSet(projectRecord.roles)) roleSet.add(role);
    for (const moduleName of toStringSet(projectRecord.modules)) moduleSet.add(moduleName);
  }

  return {
    found,
    roles: [...roleSet].sort((a, b) => a.localeCompare(b)),
    modules: [...moduleSet].sort((a, b) => a.localeCompare(b)),
  };
}

// `getAccountId` is now imported from "@/lib/server/acc-helpers".
// The shared helper throws a plain Error (not TRPCError) so it can be
// called from non-tRPC contexts (release script, cron script). Each
// tRPC call site below wraps the helper in a try/catch that maps the
// plain Error to TRPCError({ code: "PRECONDITION_FAILED" }).
async function resolveAccountIdForRouter(db: any): Promise<string> {
  try {
    return await getAccountId(db);
  } catch (err) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        err instanceof Error
          ? `${err.message}. Set APS_HUB_ID in Railway environment variables.`
          : "APS Hub ID is not configured. Set APS_HUB_ID in Railway environment variables.",
      cause: err instanceof Error ? err : undefined,
    });
  }
}

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

  /**
   * Reads all registered users + their AccMemberCache rows in two queries.
   * Returns a full per-user summary for both Plan 7.1 filter chips and
   * Plan 7.2 hub-wide permission analysis. Fields are strictly additive.
   */
  bulkAccSummary: adminProcedure.query(async ({ ctx }) => {
    const [users, caches] = await Promise.all([
      ctx.db.user.findMany({ select: { email: true, name: true } }),
      ctx.db.accMemberCache.findMany(),
    ]);

    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u.name]));
    const cacheMap = new Map(caches.map((c) => [c.email.toLowerCase(), c]));

    const allEmails = new Set([
      ...users.map((u) => u.email.toLowerCase()),
      ...caches.map((c) => c.email.toLowerCase()),
    ]);

    type CachedProject = {
      id: string;
      name: string;
      status: string;
      isAdmin: boolean;
      roles: string[];
      modules: string[];
    };

    type CachedData = {
      found: boolean;
      name?: string;
      syncedAt?: string;
      projects?: CachedProject[];
      companyRole?: string | null;
      lastSignIn?: string | null;
      // 04-01: written by bulkAccSync when accUser.role === "account_admin".
      // Optional on read because legacy cache rows predating 04-01 do not carry it.
      isAccountAdmin?: boolean;
      // 04-02: ACC member-creation date (HQ v1 `created_at`, ISO 8601), normalized to ISO
      // at the write site. Optional on read because legacy cache rows predate this field;
      // those rows surface as `addedOn: null` to BulkAccUser consumers (DASH-06).
      addedOn?: string | null;
    };

    return Array.from(allEmails).map((emailLower) => {
      const cached = cacheMap.get(emailLower);
      const registeredName = userMap.get(emailLower);
      const email = cached?.email || users.find(u => u.email.toLowerCase() === emailLower)?.email || emailLower;

      if (!cached) {
        return {
          email,
          name: registeredName ?? "",
          found: false,
          projectCount: 0,
          activeCount: 0,
          adminCount: 0,
          hasNoProjects: true,
          syncedAt: "",
          allRoles: [] as string[],
          allModules: [] as string[],
          projects: [] as CachedProject[],
          isAccountAdmin: false,
          addedOn: null,
        };
      }

      let data: CachedData = { found: false };
      const raw = cached.data as unknown;
      if (typeof raw === "string") {
        try { data = JSON.parse(raw) as CachedData; } catch { /* ignore */ }
      } else if (raw && typeof raw === "object") {
        data = raw as CachedData;
      }

      if (!data.found) {
        return {
          email,
          name: registeredName ?? data.name ?? "",
          found: false,
          projectCount: 0,
          activeCount: 0,
          adminCount: 0,
          hasNoProjects: true,
          syncedAt: data.syncedAt ?? cached.syncedAt.toISOString(),
          allRoles: [] as string[],
          allModules: [] as string[],
          projects: [] as CachedProject[],
          isAccountAdmin: false,
          addedOn: null,
        };
      }

      const projects: CachedProject[] = data.projects ?? [];
      const activeCount = projects.filter(
        (p) => p.status?.toLowerCase() === "active"
      ).length;
      const adminCount = projects.filter((p) => p.isAdmin).length;
      const allRoles = [...new Set(projects.flatMap((p) => p.roles ?? []))];
      const allModules = [...new Set(projects.flatMap((p) => p.modules ?? []))];

      return {
        email,
        name: registeredName ?? data.name ?? "",
        found: true,
        projectCount: projects.length,
        activeCount,
        adminCount,
        hasNoProjects: projects.length === 0,
        syncedAt: data.syncedAt ?? cached.syncedAt.toISOString(),
        allRoles,
        allModules,
        projects,
        // 02.5-D fix: surface the cached HQ fields. null = ACC reported empty;
        // undefined = older cache rows synced before fields were plumbed through.
        companyRole: data.companyRole ?? null,
        lastSignIn: data.lastSignIn ?? null,
        // 04-01: ACC account-level admin (DASH-07). Default false for legacy cache rows
        // synced before this field was plumbed; will populate on next bulkAccSync run.
        isAccountAdmin: data.isAccountAdmin === true,
        // 04-02: ACC member-creation date (DASH-06). Null for legacy cache rows synced
        // before this field was plumbed; will populate on next bulkAccSync run. The widget
        // MUST treat null as "not in any 7d/30d/90d bucket" (do not show stale users as
        // recently-added).
        addedOn: typeof data.addedOn === "string" && data.addedOn.length > 0 ? data.addedOn : null,
      };
    });
  }),

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
          type CachedAccUser = {
            found: boolean;
            syncedAt: string;
            autodeskId?: string;
            name?: string;
            status?: string;
            projects?: AccProject[];
          };
          const raw = cached.data as unknown;
          if (typeof raw === "string") {
            return JSON.parse(raw) as CachedAccUser;
          }
          return raw as CachedAccUser;
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
      const accountId = await resolveAccountIdForRouter(ctx.db);

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
          create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
          update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
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
        company: accUser.company,
        addedOn: accUser.addedOn,
        projects: enrichedProjects,
        syncedAt: new Date().toISOString(),
      };

      // 7. Upsert cache
      await ctx.db.accMemberCache.upsert({
        where: { email },
        create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
        update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
      });

      return result;
    }),

  bulkAccSync: adminProcedure
    .input(
      z
        .object({
          emails: z.array(z.string().email()).optional(),
          rebuildGraphCache: z.boolean().optional().default(true),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Token + accountId — fetch once for all users
      let accessToken: string;
      try {
        accessToken = await get2LeggedAutodeskToken();
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "ACC credentials not configured. Check APS_CLIENT_ID and APS_CLIENT_SECRET.",
          cause: error instanceof Error ? error : undefined,
        });
      }

      const accountId = await resolveAccountIdForRouter(ctx.db);

      // 2. Prefetch the entire ACC user list ONCE and build an email→user map. Previously
      // fetchAccUserByEmail paginated the full hub per call (O(emails × hub_size) API calls),
      // which blew past ACC rate limits on 1197 emails. Now it's one sweep up-front.
      let accUserByEmail: Map<string, { id: string; email: string; name: string; status: string; role: string; isAccountAdmin: boolean; company?: string; addedOn?: string; companyRole?: string; lastSignIn?: string }>;
      try {
        const allAccUsers = await fetchAllAccUsers(accountId, accessToken);
        accUserByEmail = new Map(allAccUsers.map((u) => [u.email.toLowerCase(), u]));
        logger.info("[bulkAccSync] prefetched ACC hub users", { count: allAccUsers.length });
      } catch (error) {
        throw toAccRouterError(error, "Failed to prefetch ACC user list for bulk sync.");
      }

      // 3. Emails to sync. Without explicit input, we want the FULL org-wide view —
      // every ACC user, plus any local registered users who may not be in ACC (those
      // get cached as notFound so the UI still shows them with that status).
      // Previously this was just `db.user` which limited the cache to 3 rows when
      // only 3 dashboard users had ever signed in.
      const emails = input?.emails && input.emails.length > 0
        ? input.emails
        : Array.from(new Set([
            ...Array.from(accUserByEmail.values(), (u) => u.email),
            ...(await ctx.db.user.findMany({ select: { email: true } })).map((u) => u.email),
          ]));
      logger.info("[bulkAccSync] sync target", {
        accUsers: accUserByEmail.size,
        totalEmails: emails.length,
      });

      let found = 0;
      let notFound = 0;
      let errors = 0;

      // 4. Per-email work: in-memory lookup, then only call per-user APIs for the handful
      // actually in ACC. Concurrency 3 — each found user fans out to projects+roles+products
      // which each paginate internally (~75 requests per user with many projects). A burst of
      // 6 found users × 3 API × pagination blew past ACC's quota. Retry-on-429 in the core
      // fetcher handles transient spikes; concurrency keeps the steady-state request rate low.
      const limit = pLimit(3);

      await Promise.all(
        emails.map((email) =>
          limit(async () => {
            try {
              const accUser = accUserByEmail.get(email.toLowerCase());

              if (!accUser) {
                const result = { found: false as const, syncedAt: new Date().toISOString() };
                await ctx.db.accMemberCache.upsert({
                  where: { email },
                  create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
                  update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
                });
                notFound++;
                return;
              }

              const [projects, rolesByProject, productsByProject] = await Promise.all([
                fetchAccUserProjects(accountId, accUser.id, accessToken).catch(() => [] as AccProject[]),
                fetchAccUserRoles(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
                fetchAccUserProducts(accountId, accUser.id, accessToken).catch(() => new Map<string, string[]>()),
              ]);

              const enrichedProjects: AccProject[] = projects.map((proj) => ({
                ...proj,
                roles: rolesByProject.get(proj.id) ?? proj.roles,
                modules: productsByProject.get(proj.id) ?? [],
              }));

              // 04-02: normalize ACC join-date (HQ v1 `created_at`) to ISO 8601 string,
              // or null on parse failure / missing. Never write `Date.now()` here — that
              // would defeat the field's purpose by stamping every sync as "added now".
              let normalizedAddedOn: string | null = null;
              if (typeof accUser.addedOn === "string" && accUser.addedOn.length > 0) {
                const ts = Date.parse(accUser.addedOn);
                normalizedAddedOn = Number.isFinite(ts) && ts > 0
                  ? new Date(ts).toISOString()
                  : null;
              }

              const result = {
                found: true as const,
                autodeskId: accUser.id,
                name: accUser.name,
                status: accUser.status,
                role: accUser.role,
                company: accUser.company,
                addedOn: normalizedAddedOn,
                // 02.5-D fix: previously dropped here, leaving cached.data.companyRole and
                // cached.data.lastSignIn permanently undefined → "Unspecified" in the UI.
                companyRole: accUser.companyRole,
                lastSignIn: accUser.lastSignIn,
                // 04-01: ACC account-level admin flag (DASH-07). Derived from HQ v1
                // role === "account_admin"; distinct from per-project accessLevels.projectAdmin.
                isAccountAdmin: accUser.isAccountAdmin,
                projects: enrichedProjects,
                syncedAt: new Date().toISOString(),
              };

              await ctx.db.accMemberCache.upsert({
                where: { email },
                create: { email, data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
                update: { data: result as unknown as Prisma.InputJsonValue, syncedAt: new Date() },
              });
              found++;
            } catch (err) {
              logger.error("[bulkAccSync] failed for user", {
                email,
                error: err instanceof Error ? err.message : String(err),
              });
              errors++;
            }
          })
        )
      );

      let graphCache: { rebuilt: boolean; nodeCount?: number; edgeCount?: number; instanceCount?: number; projectCount?: number; error?: string } = {
        rebuilt: false,
      };
      if (input?.rebuildGraphCache ?? true) {
        try {
          const graph = await rebuildAccGraphCache(ctx.db);
          graphCache = {
            rebuilt: true,
            nodeCount: graph.stats.nodeCount,
            edgeCount: graph.stats.edgeCount,
            instanceCount: graph.stats.totalProjectInstances,
            projectCount: graph.stats.uniqueProjects,
          };
        } catch (error) {
          logger.error("[bulkAccSync] ACC graph cache rebuild failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          graphCache = {
            rebuilt: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      return { total: emails.length, found, notFound, errors, graphCache };
    }),

  getPrecomputedGraph: adminProcedure.query(async ({ ctx }) => {
    let currentStats = EMPTY_ACC_GRAPH_STATS;
    let currentDataHash = "";

    try {
      // 1. Compute current dataHash from ALL AccMemberCache rows — server-side only
      //    Sort by email for determinism. Hash only fields that affect graph topology.
      const allRows = await ctx.db.accMemberCache.findMany({ orderBy: { email: "asc" } });
      const current = buildAccGraphSnapshot(allRows);
      currentStats = current.stats;
      currentDataHash = current.dataHash;

      // 2. Fetch stored layout
      const cached = await ctx.db.accGraphLayoutCache.findUnique({
        where: { id: ACC_GRAPH_CACHE_ID },
      });

      const cacheValid =
        cached &&
        cached.dataHash === current.dataHash &&
        cached.nodeCount === current.stats.nodeCount &&
        cached.edgeCount === current.stats.edgeCount &&
        cached.instanceCount === current.stats.totalProjectInstances &&
        cached.projectCount === current.stats.uniqueProjects &&
        cached.nodeIds.length === current.nodeIds.length &&
        cached.positions.length === current.stats.nodeCount * 2;

      if (!cacheValid) {
        return {
          hit: false as const,
          stale: !!cached,
          dataHash: current.dataHash,
          nodes: [] as unknown[],
          edges: [] as unknown[],
          positions: null,
          nodeIds: [] as string[],
          stats: current.stats,
        };
      }

      const fallbackPositions = normalizeAccGraphPositions(current.nodes);
      const { safePositions, usedFallback } = sanitizeGraphPositions(cached.positions, fallbackPositions);
      if (usedFallback) {
        logger.warn("ACC graph cache returned invalid positions; using semantic fallback positions", {
          nodeCount: current.stats.nodeCount,
        });
      }

      return {
        hit: true as const,
        stale: false,
        nodes: current.nodes as unknown[],
        edges: current.edges as unknown[],
        positions: safePositions,
        dataHash: current.dataHash,
        nodeIds: current.nodeIds,
        stats: current.stats,
      };
    } catch (error) {
      logger.error("Failed to load ACC graph cache", {
        error: error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
      });
      return {
        hit: false as const,
        stale: false,
        dataHash: currentDataHash,
        nodes: [] as unknown[],
        edges: [] as unknown[],
        positions: null,
        nodeIds: [] as string[],
        stats: currentStats,
      };
    }
  }),

  rebuildAccGraphCache: adminProcedure.mutation(async ({ ctx }) => {
    try {
      const graph = await rebuildAccGraphCache(ctx.db);
      return {
        ok: true,
        dataHash: graph.dataHash,
        nodeCount: graph.stats.nodeCount,
        edgeCount: graph.stats.edgeCount,
        instanceCount: graph.stats.totalProjectInstances,
        projectCount: graph.stats.uniqueProjects,
        positionsLength: graph.positions.length,
        nodeIdsLength: graph.nodeIds.length,
        stats: graph.stats,
      };
    } catch (error) {
      logger.error("Failed to rebuild ACC graph cache", {
        error: error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
      });
      throw toAccRouterError(error, "Failed to rebuild ACC graph cache.");
    }
  }),

  saveGraphLayout: adminProcedure
    .input(
      z.object({
        positions: z.array(z.number()),
        dataHash: z.string(),
        nodeCount: z.number().int().positive(),
        nodeIds: z.array(z.string()),
      })
    )
    .mutation(async () => {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Client-side ACC graph layout writes are disabled. Use rebuildAccGraphCache.",
      });
    }),

  invalidateGraphLayout: adminProcedure.mutation(async ({ ctx }) => {
    // Delete the singleton row — next getGraphLayout call will return hit: false
    // deleteMany is used because deleteUnique throws if row doesn't exist yet
    await ctx.db.accGraphLayoutCache.deleteMany({});
    return { ok: true };
  }),

  // -------------------------------------------------------------------------
  // Hub role definitions — roles that exist in ACC regardless of assignment
  // -------------------------------------------------------------------------

  getHubRoles: adminProcedure.query(async ({ ctx }) => {
    const cached = await ctx.db.accHubRoleCache.findUnique({ where: { id: "singleton" } });
    if (!cached) return { roles: [] as { id: string; name: string; memberCount: number }[], syncedAt: null };
    return {
      roles: cached.roles as { id: string; name: string; memberCount: number }[],
      syncedAt: cached.syncedAt,
    };
  }),

  syncHubRoles: adminProcedure.mutation(async ({ ctx }) => {
    let accessToken: string;
    try {
      accessToken = await get2LeggedAutodeskToken();
    } catch (error) {
      throw toAccRouterError(error, "ACC Admin API: APS app credentials are not configured.");
    }
    const accountId = await resolveAccountIdForRouter(ctx.db);
    const { fetchAccHubRoles } = await import("@/lib/server/acc-admin");
    const roles = await fetchAccHubRoles(accountId, accessToken);
    await ctx.db.accHubRoleCache.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", roles },
      update: { roles },
    });
    return { count: roles.length, roles };
  }),

});
