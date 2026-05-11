// lib/server/acc-helpers.ts
// Shared ACC ID helpers — pure module (no "server-only" import).
// Safe to call from tRPC routers AND non-tRPC contexts (release script, cron script).
//
// Throws plain Error on misconfiguration so non-tRPC callers don't need @trpc/server.
// tRPC callers wrap the thrown Error into TRPCError at the call site.

type ProjectFindFirst = {
  project: {
    // Accept Prisma's actual return type (`apsHubId: string | null`) — the
    // helper performs the null check internally, so callers passing a real
    // PrismaClient typecheck without a cast.
    findFirst: (args: {
      select: { apsHubId: true };
    }) => Promise<{ apsHubId: string | null } | null>;
  };
};

/**
 * Resolves the bare ACC account/hub ID from the Project table.
 *
 * The `apsHubId` column stores the hub ID with the `b.` prefix that the
 * Data Management API uses. The ACC Admin API expects the bare UUID, so
 * this helper strips the `b.` prefix when present.
 *
 * @throws Error when no project row exists or `apsHubId` is empty.
 */
export async function getAccountId(db: ProjectFindFirst): Promise<string> {
  const hub = await db.project.findFirst({ select: { apsHubId: true } });
  if (!hub || !hub.apsHubId) {
    throw new Error("ACC hub is not configured (project.apsHubId missing)");
  }
  return hub.apsHubId.replace(/^b\./, "");
}

/**
 * Returns a project ID suitable for Data Management API calls — i.e. the
 * raw ID with the `b.` prefix preserved. Callers are responsible for
 * supplying the correctly-formatted ID; this helper does not add or
 * remove the prefix.
 *
 * The helper exists so that future callers can `import` an explicit,
 * named function (rather than passing the raw string around), making
 * intent obvious and testable.
 *
 * @throws Error when the raw ID is empty.
 */
export function getProjectIdForDM(rawId: string): string {
  if (!rawId) {
    throw new Error("getProjectIdForDM requires a non-empty project id");
  }
  return rawId;
}
