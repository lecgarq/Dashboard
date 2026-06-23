import "server-only";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { toClashIssue, type ClashIssue } from "@/app/(dashboard)/access-analysis/coordinationClash";

/**
 * Server-only helper: per-project clash drill-down query.
 *
 * Moved verbatim from app/(dashboard)/access-analysis/coordinationActions.ts
 * (BND-01 boundary fix — Phase 10 Plan 01). The auth() gate is preserved so the
 * function is safe to call from any server context, including the tRPC
 * acc-coordination router.
 *
 * Zero behavior change: same Prisma models (accIssue, accProjectMember,
 * accDcUser), same select/where/orderBy/take:500, same DC-wins author
 * resolution. Workshop impact: invisible.
 */
export async function loadProjectClashes(projectId: string): Promise<ClashIssue[]> {
  const session = await auth();
  if (!session || !projectId) return [];

  const rows = await db.accIssue.findMany({
    where: { projectId, isCoordination: true },
    select: {
      displayId: true,
      title: true,
      description: true,
      status: true,
      createdBy: true,
      confidence: true,
      coordinationSource: true,
      clashValidated: true,
      createdAt: true,
      rawJson: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  // Resolve the opaque ACC author ids to a name + email. The DC user snapshot
  // covers all creators; project membership is a fallback for anyone it misses.
  // The email keys the shared UserProfilePanel when the name is clicked.
  const creatorIds = [...new Set(rows.map((r) => r.createdBy).filter((id): id is string => !!id))];
  const infoById = new Map<string, { name: string | null; email: string | null }>();
  if (creatorIds.length > 0) {
    const [members, dcUsers] = await Promise.all([
      db.accProjectMember.findMany({
        where: { autodeskId: { in: creatorIds } },
        select: { autodeskId: true, name: true, email: true },
      }),
      db.accDcUser.findMany({
        where: { autodeskId: { in: creatorIds } },
        select: { autodeskId: true, name: true, email: true },
      }),
    ]);
    for (const m of members) {
      if (m.autodeskId && !infoById.has(m.autodeskId)) infoById.set(m.autodeskId, { name: m.name || null, email: m.email || null });
    }
    for (const u of dcUsers) {
      if (u.autodeskId) infoById.set(u.autodeskId, { name: u.name || null, email: u.email || null }); // DC snapshot wins
    }
  }

  return rows.map((r) => toClashIssue(r, (id) => infoById.get(id) ?? null));
}
