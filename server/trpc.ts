import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";
import superjson from "superjson";

const getSession = cache(() => auth());

// Project ID is stable for the process lifetime — cache to avoid repeated lookups
let _cachedProjectId: string | null = null;

async function getOrCreateProjectId(): Promise<string> {
  if (_cachedProjectId) return _cachedProjectId;
  let project = await db.project.findFirst();
  if (!project) {
    project = await db.project.create({ data: { name: "Default Project" } });
  }
  _cachedProjectId = project.id;
  return _cachedProjectId;
}

export async function createTRPCContext() {
  const session = await getSession();
  const projectId = await getOrCreateProjectId();
  return { session, db, projectId };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if ((ctx.session.user as any).role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const editorProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const role = (ctx.session.user as any).role;
  if (!["EDITOR", "ADMIN"].includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

