/**
 * accDcGraph tRPC router — Task 4 (access-analysis-redesign).
 *
 * Sources user/project membership data exclusively from the DC snapshot
 * tables (AccDc*) and assembles it via the pure `assembleDcUsers` function.
 *
 * Procedures:
 *   - bulkUsers: returns all AccDcUser records assembled into BulkAccUser
 *     shape, enriched with project membership, roles, products, and company.
 *
 * Note: roleId in AccDcProjectUserRole joins to AccRole (not AccDcRole) —
 * confirmed by live join-count query (AccRole: 13,711 matches; AccDcRole: 0).
 */

import { router, adminProcedure } from "../trpc";
import { assembleDcUsers } from "@/lib/acc/dcUserAssembly";

export const accDcGraphRouter = router({
  bulkUsers: adminProcedure.query(async ({ ctx }) => {
    const [users, projectUsers, projectUserRoles, projectUserProducts, companies, roles, projects, rawFolderPermissions] =
      await Promise.all([
        ctx.db.accDcUser.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            companyId: true,
            lastSignIn: true,
          },
        }),
        ctx.db.accDcProjectUser.findMany({
          select: { projectId: true, userId: true },
        }),
        ctx.db.accDcProjectUserRole.findMany({
          select: { projectId: true, userId: true, roleId: true },
        }),
        ctx.db.accDcProjectUserProduct.findMany({
          select: { projectId: true, userId: true, productKey: true, accessLevel: true },
        }),
        ctx.db.accDcCompany.findMany({
          select: { id: true, name: true },
        }),
        // AccRole.id joins AccDcProjectUserRole.roleId (AccDcRole has 0 matches)
        ctx.db.accRole.findMany({
          select: { id: true, name: true },
        }),
        ctx.db.accProject.findMany({
          select: { id: true, name: true, status: true, folderCrawlStatus: true },
        }),
        ctx.db.accFolderPermission.findMany({
          where: { folder: { project: { folderCrawlStatus: { in: ["ok", "partial"] } } } },
          select: {
            folderId: true,
            roleId: true,
            permType: true,
            actions: true,
            folder: { select: { projectId: true, fullPath: true } },
          },
        }),
      ]);

    return assembleDcUsers({
      users: users.map((u) => ({
        ...u,
        lastSignIn: u.lastSignIn ? u.lastSignIn.toISOString() : null,
      })),
      projectUsers,
      projectUserRoles,
      projectUserProducts,
      companies,
      roleNames: Object.fromEntries(roles.map((r) => [r.id, r.name])),
      projectMeta: Object.fromEntries(
        projects.map((p) => [
          p.id,
          { name: p.name, status: p.status, crawlStatus: p.folderCrawlStatus },
        ])
      ),
      folderPermissions: rawFolderPermissions.map((r) => ({
        folderId: r.folderId,
        roleId: r.roleId,
        permType: r.permType,
        actions: r.actions,
        projectId: r.folder.projectId,
        folderPath: r.folder.fullPath ?? "",
      })),
    });
  }),
});
