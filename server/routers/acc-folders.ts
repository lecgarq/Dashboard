/**
 * accFolders tRPC router — Phase 04 Plan 05 (Wave 2).
 *
 * Procedures:
 *   - getMatrix:      flat (folder × role × permission) rows enriched with
 *                     project/role names + crawl status + orphanReasons[].
 *   - getOrphanRoles: convenience — same data filtered to rows with ≥1
 *                     orphanReason. Used by the Plan 06 Recommendations widget.
 *
 * Pure orphan-detection logic lives in `lib/acc/orphanDetection.ts` so it
 * stays unit-testable independently of tRPC.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { detectOrphans, type OrphanReason } from "@/lib/acc/orphanDetection";
import type { PermTier } from "@/lib/acc/permissionMapping";

export interface FolderMatrixRow {
  folderId: string;
  folderPath: string;
  projectId: string;
  projectName: string;
  projectCrawlStatus: string; // never | ok | partial | failed
  roleId: string;
  roleName: string;
  permType: PermTier | string;
  actions: string[];
  orphanReasons: OrphanReason[];
}

export interface FolderOnlyOrphan {
  folderId: string;
  reasons: OrphanReason[];
}

type FolderMemberCounts = {
  roleCounts: Array<{ projectId: string; roleId: string; memberCount: number }>;
  projectMemberCounts: Array<{ projectId: string; memberCount: number }>;
};

function projectIdWhere(projectIds?: string[]) {
  return projectIds?.length ? { projectId: { in: projectIds } } : {};
}

async function getFolderMemberCounts(db: any, projectIds?: string[]): Promise<FolderMemberCounts> {
  const where = projectIdWhere(projectIds);
  const [legacyRoleCounts, legacyProjectMemberCounts] = await Promise.all([
    db.accProjectRole.groupBy({
      by: ["projectId", "roleId"],
      where: { ...where, memberId: { not: null } },
      _count: { memberId: true },
    }),
    db.accProjectMember.groupBy({
      by: ["projectId"],
      where,
      _count: { id: true },
    }),
  ]);

  const roleCounts = legacyRoleCounts.length > 0
    ? legacyRoleCounts.map((r: any) => ({
        projectId: r.projectId,
        roleId: r.roleId,
        memberCount: r._count.memberId,
      }))
    : (await db.accDcProjectUserRole.groupBy({
        by: ["projectId", "roleId"],
        where,
        _count: { userId: true },
      })).map((r: any) => ({
        projectId: r.projectId,
        roleId: r.roleId,
        memberCount: r._count.userId,
      }));

  const projectMemberCounts = legacyProjectMemberCounts.length > 0
    ? legacyProjectMemberCounts.map((m: any) => ({
        projectId: m.projectId,
        memberCount: m._count.id,
      }))
    : (await db.accDcProjectUser.groupBy({
        by: ["projectId"],
        where,
        _count: { userId: true },
      })).map((m: any) => ({
        projectId: m.projectId,
        memberCount: m._count.userId,
      }));

  return { roleCounts, projectMemberCounts };
}

export const accFoldersRouter = router({
  /**
   * Lightweight coverage signal for the Users data strip.
   * `getMatrix` remains the detailed role-folder-permission view.
   */
  getCoverage: protectedProcedure.query(async ({ ctx }) => {
    const [folderCount, permissionCount, crawlStatuses] = await Promise.all([
      ctx.db.accFolder.count(),
      ctx.db.accFolderPermission.count(),
      ctx.db.accProject.groupBy({
        by: ["folderCrawlStatus"],
        _count: { _all: true },
      }),
    ]);

    return {
      folderCount,
      permissionCount,
      crawlStatuses: crawlStatuses.map((row) => ({
        status: row.folderCrawlStatus,
        count: row._count._all,
      })),
    };
  }),

  /**
   * Returns flat rows for the folder permissions matrix.
   * One row per (folderId, roleId) permission entry.
   */
  getMatrix: protectedProcedure
    .input(z.object({ projectIds: z.array(z.string()).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const projectFilter = projectIdWhere(input?.projectIds);

      const [folders, permissions, counts, projects, roles] =
        await Promise.all([
          ctx.db.accFolder.findMany({
            where: projectFilter,
            select: {
              id: true,
              projectId: true,
              parentId: true,
              fullPath: true,
              name: true,
            },
          }),
          ctx.db.accFolderPermission.findMany({
            where: { folder: projectFilter },
            select: {
              folderId: true,
              roleId: true,
              actions: true,
              permType: true,
              folder: { select: { projectId: true } },
            },
          }),
          getFolderMemberCounts(ctx.db, input?.projectIds),
          ctx.db.accProject.findMany({
            where: { status: "active" },
            select: { id: true, name: true, folderCrawlStatus: true },
          }),
          ctx.db.accRole.findMany({ select: { id: true, name: true } }),
        ]);

      const orphanMap = detectOrphans({
        folders: folders.map((f) => ({
          id: f.id,
          projectId: f.projectId,
          parentId: f.parentId,
          fullPath: f.fullPath,
        })),
        permissions: permissions.map((p) => ({
          folderId: p.folderId,
          roleId: p.roleId,
          permType: p.permType,
          actions: p.actions,
        })),
        projectRoles: counts.roleCounts,
        projectMembers: counts.projectMemberCounts,
      });

      const projectById = new Map(projects.map((p) => [p.id, p]));
      const roleById = new Map(roles.map((r) => [r.id, r]));
      const folderById = new Map(folders.map((f) => [f.id, f]));

      const rows: FolderMatrixRow[] = permissions.map((p) => {
        const projectId = p.folder.projectId;
        const folder = folderById.get(p.folderId);
        return {
          folderId: p.folderId,
          folderPath: folder?.fullPath ?? "",
          projectId,
          projectName: projectById.get(projectId)?.name ?? "",
          projectCrawlStatus: projectById.get(projectId)?.folderCrawlStatus ?? "never",
          roleId: p.roleId,
          roleName: roleById.get(p.roleId)?.name ?? p.roleId,
          permType: p.permType,
          actions: p.actions,
          orphanReasons: orphanMap.get(`${p.folderId}::${p.roleId}`) ?? [],
        };
      });

      const folderOnlyOrphans: FolderOnlyOrphan[] = Array.from(orphanMap.entries())
        .filter(([k]) => k.endsWith("::"))
        .map(([k, reasons]) => ({ folderId: k.slice(0, -2), reasons }));

      return {
        rows,
        folderOnlyOrphans,
        projectCrawlStatuses: projects,
      };
    }),

  /**
   * Convenience procedure: returns only the rows that have ≥1 orphan reason,
   * plus all folder-level orphans (folders with no permissions at all).
   */
  getOrphanRoles: protectedProcedure.query(async ({ ctx }) => {
    const [folders, permissions, counts, projects, roles] =
      await Promise.all([
        ctx.db.accFolder.findMany({
          select: {
            id: true,
            projectId: true,
            parentId: true,
            fullPath: true,
            name: true,
          },
        }),
        ctx.db.accFolderPermission.findMany({
          select: {
            folderId: true,
            roleId: true,
            actions: true,
            permType: true,
            folder: { select: { projectId: true } },
          },
        }),
        getFolderMemberCounts(ctx.db),
        ctx.db.accProject.findMany({
          where: { status: "active" },
          select: { id: true, name: true, folderCrawlStatus: true },
        }),
        ctx.db.accRole.findMany({ select: { id: true, name: true } }),
      ]);

    const orphanMap = detectOrphans({
      folders: folders.map((f) => ({
        id: f.id,
        projectId: f.projectId,
        parentId: f.parentId,
        fullPath: f.fullPath,
      })),
      permissions: permissions.map((p) => ({
        folderId: p.folderId,
        roleId: p.roleId,
        permType: p.permType,
        actions: p.actions,
      })),
      projectRoles: counts.roleCounts,
      projectMembers: counts.projectMemberCounts,
    });

    const projectById = new Map(projects.map((p) => [p.id, p]));
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const folderById = new Map(folders.map((f) => [f.id, f]));

    const rows: FolderMatrixRow[] = permissions
      .map((p) => {
        const projectId = p.folder.projectId;
        const folder = folderById.get(p.folderId);
        return {
          folderId: p.folderId,
          folderPath: folder?.fullPath ?? "",
          projectId,
          projectName: projectById.get(projectId)?.name ?? "",
          projectCrawlStatus: projectById.get(projectId)?.folderCrawlStatus ?? "never",
          roleId: p.roleId,
          roleName: roleById.get(p.roleId)?.name ?? p.roleId,
          permType: p.permType,
          actions: p.actions,
          orphanReasons: orphanMap.get(`${p.folderId}::${p.roleId}`) ?? [],
        };
      })
      .filter((r) => r.orphanReasons.length > 0);

    const folderOnlyOrphans: FolderOnlyOrphan[] = Array.from(orphanMap.entries())
      .filter(([k]) => k.endsWith("::"))
      .map(([k, reasons]) => ({ folderId: k.slice(0, -2), reasons }));

    return { rows, folderOnlyOrphans };
  }),
});

export type AccFoldersRouter = typeof accFoldersRouter;
