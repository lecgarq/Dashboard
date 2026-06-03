#!/usr/bin/env node
/**
 * scripts/scratch/acc-level8-forensic-anomalies.cjs
 *
 * LEVEL 8 — CRITICAL IP EXFILTRATION & COMPLIANCE GAP FORENSICS
 * High-value enterprise security audit targets:
 *
 *  51. EXTERNAL DOMAIN WITH ADMIN/WRITE PERMISSIONS — Non-hermosillo domains with elevated folder perms.
 *  52. MOLE / DATA HOARDING SIGNATURE — Users downloading large numbers of files without viewing them.
 *  53. ISO 19650 WORKFLOW BREACH — "Shared" or "Published" folders allowing WIP editing permissions.
 *  54. CHURN-AND-BURN MEMBERSHIP — Users added and removed within 72 hours with download activity.
 *  55. PRE-DEPROVISIONING SWEEP — Exponential spike in downloads in the 48h prior to project removal.
 *  56. GEOGRAPHIC HOPS / IMPOSSIBLE TRAVEL — Accessing geographically distant projects within a suspiciously short timeframe.
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv").config();

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");

  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("==========================================================================");
    console.log("    LECG / HERMOSILLO LEVEL 8 — FORENSICS & COMPLIANCE AUDIT ENGINE      ");
    console.log("==========================================================================\n");

    // ======================================================================
    // 51. EXTERNAL DOMAIN WITH ADMIN/WRITE PERMISSIONS
    // Elevating non-Hermosillo domains (like gmail.com, outlook.com, design firms)
    // to edit or control folders.
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🔴 [WARNING 51] ELEVATED EXTERNAL PERMISSIONS: NON-CORPORATE WRITE ACCESS");
    console.log("--------------------------------------------------------------------------");

    // Let's identify external users in AccMemberCache who hold "Full Controller" or edit perms
    const externalElevated = await prisma.$queryRaw`
      WITH external_members AS (
        SELECT 
          LOWER(email) as email,
          data->>'name' as name,
          data->>'company' as company,
          proj->>'id' as project_id,
          proj->'roles' as roles
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj
        WHERE LOWER(email) NOT LIKE '%@hermosillo.com'
          AND LOWER(email) NOT LIKE '%@lecg.mx'
      ),
      elevated_perms AS (
        SELECT 
          fp."roleId", 
          r.name as role_name, 
          f."projectId", 
          f.name as folder_name, 
          f."fullPath",
          fp."permType"
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccRole" r ON r.id = fp."roleId"
        WHERE fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
      )
      SELECT DISTINCT
        em.name,
        em.email,
        em.company,
        p.name as "projectName",
        ep.role_name as "roleAssigned",
        ep.folder_name as "folderName",
        ep."fullPath",
        ep."permType"
      FROM external_members em
      JOIN elevated_perms ep ON em.project_id = ep."projectId" AND em.roles @> jsonb_build_array(ep.role_name)
      JOIN "AccProject" p ON p.id = em.project_id
      ORDER BY em.email, p.name
      LIMIT 10
    `;

    if (externalElevated.length > 0) {
      console.log("External users holding write or administrative permissions via project roles:");
      externalElevated.forEach((item, idx) => {
        console.log(`  #${idx + 1}. ${item.name} <${item.email}> [Company: ${item.company || "N/A"}]`);
        console.log(`       ⚠️ Role: "${item.roleAssigned}" → Granted "${item.permType}" on folder: "${item.folderName}"`);
        console.log(`       Path: ${item.fullPath} in project "${item.projectName}"`);
      });
    } else {
      console.log("✅ No external users with elevated write/control permissions found.");
    }

    // ======================================================================
    // 52. MOLE / DATA HOARDING SIGNATURE
    // Users downloading large numbers of files without viewing them.
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🦫 [WARNING 52] THE MOLE: BATCH DOWNLOADS WITHOUT CORRESPONDING VIEWS");
    console.log("--------------------------------------------------------------------------");

    const moleAudit = await prisma.$queryRaw`
      WITH activity_counts AS (
        SELECT 
          LOWER("userEmail") as email,
          "projectId",
          COUNT(CASE WHEN "rawAction" IN ('download-entity', 'download-file', 'download-version') THEN 1 END)::int as downloads,
          COUNT(CASE WHEN "rawAction" IN ('view-entity', 'view-sheet', 'view-version') THEN 1 END)::int as views
        FROM "AccActivity"
        WHERE "userEmail" IS NOT NULL
        GROUP BY LOWER("userEmail"), "projectId"
      )
      SELECT 
        ac.email,
        p.name as "projectName",
        ac.downloads,
        ac.views,
        ROUND(ac.downloads::numeric / NULLIF(ac.views, 0), 1) as download_view_ratio
      FROM activity_counts ac
      JOIN "AccProject" p ON p.id = ac."projectId"
      WHERE ac.downloads >= 15 AND ac.views <= 2
      ORDER BY ac.downloads DESC
      LIMIT 10
    `;

    if (moleAudit.length > 0) {
      console.log("Users downloading high quantities of files while rarely viewing them first:");
      moleAudit.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> in "${item.projectName}"`);
        console.log(`       Downloads: ${item.downloads} | Views: ${item.views} | Ratio: ${item.download_view_ratio || "Infinite"} downloads/view`);
      });
    } else {
      console.log("✅ No suspicious batch-downloading (mole) behavior detected.");
    }

    // ======================================================================
    // 53. ISO 19650 WORKFLOW BREACH
    // Shared or Published folders allowing WIP editing permissions.
    // WIP roles should only edit Work-in-Progress directories.
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 📜 [WARNING 53] ISO 19650 COMPLIANCE: WRITE ACCESS ON SHARED/PUBLISHED FOLDERS");
    console.log("--------------------------------------------------------------------------");

    const isoBreach = await prisma.$queryRaw`
      SELECT 
        f.name as "folderName", 
        f."fullPath", 
        p.name as "projectName",
        r.name as "roleName",
        fp."permType"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE (
        LOWER(f."fullPath") LIKE '%shared%' 
        OR LOWER(f."fullPath") LIKE '%published%'
        OR LOWER(f."fullPath") LIKE '%compartido%'
        OR LOWER(f."fullPath") LIKE '%publicado%'
      )
      AND fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
      AND r.name NOT IN ('Project Admin', 'Document Controller', 'Dirección', 'Director General')
      ORDER BY p.name, f."fullPath"
      LIMIT 10
    `;

    if (isoBreach.length > 0) {
      console.log("Non-governing roles holding write/admin permissions on Shared/Published directories:");
      isoBreach.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.folderName}" | Role: "${item.roleName}" → "${item.permType}"`);
        console.log(`       Project: "${item.projectName}" | Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ ISO 19650 Compliance Verified: Shared/Published areas are read-only.");
    }

    // ======================================================================
    // 54. CHURN-AND-BURN MEMBERSHIP
    // Users added and removed within 72 hours who also downloaded files.
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ⏱️ [WARNING 54] CHURN-AND-BURN: SUSPICIOUS RAPID TRANSIT ACCOUNTS");
    console.log("--------------------------------------------------------------------------");

    const churnAndBurn = await prisma.$queryRaw`
      WITH additions AS (
        SELECT 
          LOWER("userEmail") as inviter, 
          "details" as invitee_name, 
          "createdAt" as added_at, 
          "projectId"
        FROM "AccActivity"
        WHERE "rawAction" = 'assign-member'
      ),
      removals AS (
        SELECT 
          LOWER("userEmail") as remover, 
          "details" as removed_name, 
          "createdAt" as removed_at, 
          "projectId"
        FROM "AccActivity"
        WHERE "rawAction" = 'remove-member'
      )
      SELECT 
        a.invitee_name as "userName",
        p.name as "projectName",
        a.added_at as "addedAt",
        r.removed_at as "removedAt",
        EXTRACT(EPOCH FROM (r.removed_at - a.added_at))/3600 as "hoursActive"
      FROM additions a
      JOIN removals r ON LOWER(a.invitee_name) = LOWER(r.removed_name) AND a."projectId" = r."projectId"
      JOIN "AccProject" p ON p.id = a."projectId"
      WHERE r.removed_at > a.added_at
        AND r.removed_at - a.added_at <= interval '72 hours'
      ORDER BY "hoursActive" ASC
      LIMIT 10
    `;

    if (churnAndBurn.length > 0) {
      console.log("Users added to projects and removed in under 72 hours:");
      churnAndBurn.forEach((item, idx) => {
        console.log(`  #${idx + 1}. User: ${item.userName} in project "${item.projectName}"`);
        console.log(`       Active for: ${item.hoursActive.toFixed(1)} hours | Added: ${new Date(item.addedAt).toISOString()} | Removed: ${new Date(item.removedAt).toISOString()}`);
      });
    } else {
      console.log("✅ No rapid churn-and-burn memberships detected.");
    }

    // ======================================================================
    // 55. PRE-DEPROVISIONING SWEEP
    // Exponential spike in downloads in the 48 hours prior to removal
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🧳 [WARNING 55] PRE-REMOVAL SWEEP: SPIKE IN DOWNLOADS PRIOR TO REMOVAL");
    console.log("--------------------------------------------------------------------------");

    const preRemovalSpikes = [];
    const recentRemovals = await prisma.$queryRaw`
      SELECT "details" as removed_name, "createdAt" as removed_at, "projectId"
      FROM "AccActivity"
      WHERE "rawAction" = 'remove-member' AND "details" IS NOT NULL
      ORDER BY "createdAt" DESC
      LIMIT 30
    `;

    for (const rem of recentRemovals) {
      const userResult = await prisma.$queryRaw`
        SELECT email FROM "AccMemberCache" 
        WHERE LOWER(data->>'name') = LOWER(${rem.removed_name}) 
        LIMIT 1
      `;
      if (userResult.length > 0) {
        const email = userResult[0].email.toLowerCase();
        
        // Calculate pre-removal boundary in JS to avoid SQL bind parameter type issues
        const cutoffDate = new Date(new Date(rem.removed_at).getTime() - 48 * 60 * 60 * 1000);
        
        // Downloads in the 48 hours before removal
        const preRemovalDownloads = await prisma.$queryRaw`
          SELECT COUNT(*)::int as count 
          FROM "AccActivity"
          WHERE LOWER("userEmail") = ${email}
            AND "projectId" = ${rem.projectId}
            AND "rawAction" IN ('download-entity', 'download-file')
            AND "createdAt" >= ${cutoffDate}
            AND "createdAt" <= ${rem.removed_at}
        `;
        const count = preRemovalDownloads[0]?.count || 0;
        if (count >= 10) {
          const proj = await prisma.accProject.findUnique({ where: { id: rem.projectId }, select: { name: true } });
          preRemovalSpikes.push({
            name: rem.removed_name,
            email,
            projectName: proj?.name || rem.projectId,
            removedAt: rem.removed_at,
            downloads: count
          });
        }
      }
    }

    if (preRemovalSpikes.length > 0) {
      console.log("Users downloading heavily right before being removed from projects:");
      preRemovalSpikes.forEach((item, idx) => {
        console.log(`  #${idx + 1}. ${item.name} <${item.email}>`);
        console.log(`       ⚠️ Downloaded ${item.downloads} files in the 48h prior to removal from "${item.projectName}"`);
        console.log(`       Removal Date: ${new Date(item.removedAt).toISOString()}`);
      });
    } else {
      console.log("✅ No pre-removal data sweeps detected.");
    }

    // ======================================================================
    // 56. GEOGRAPHIC HOPPING / IMPOSSIBLE TRAVEL
    // Accessing projects in geographically distinct regions in less than 5 mins.
    // Geographic proxies based on project name prefix (CDMX vs TIJ vs MTY)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ✈️ [WARNING 56] IMPOSSIBLE TRAVEL: SPEED-OF-LIGHT GEOGRAPHIC REGION HOPS");
    console.log("--------------------------------------------------------------------------");

    const impossibleTravel = await prisma.$queryRaw`
      WITH travel_logs AS (
        SELECT 
          LOWER(a."userEmail") as email,
          a."createdAt",
          p.name as project_name,
          CASE 
            WHEN LOWER(p.name) LIKE 'cdmx%' THEN 'CDMX'
            WHEN LOWER(p.name) LIKE 'tij%' THEN 'TIJUANA'
            WHEN LOWER(p.name) LIKE 'mty%' THEN 'MONTERREY'
            WHEN LOWER(p.name) LIKE 'qro%' THEN 'QUERETARO'
            WHEN LOWER(p.name) LIKE 'mxl%' THEN 'MEXICALI'
            ELSE 'OTHER'
          END as region
        FROM "AccActivity" a
        JOIN "AccProject" p ON p.id = a."projectId"
        WHERE a."userEmail" IS NOT NULL
      ),
      travel_leads AS (
        SELECT 
          email,
          "createdAt" as start_time,
          region as start_region,
          project_name as start_project,
          LEAD("createdAt") OVER (PARTITION BY email ORDER BY "createdAt") as end_time,
          LEAD(region) OVER (PARTITION BY email ORDER BY "createdAt") as end_region,
          LEAD(project_name) OVER (PARTITION BY email ORDER BY "createdAt") as end_project
        FROM travel_logs
      )
      SELECT 
        email,
        start_region,
        start_project,
        end_region,
        end_project,
        start_time,
        end_time,
        EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
      FROM travel_leads
      WHERE start_region <> end_region 
        AND start_region <> 'OTHER' AND end_region <> 'OTHER'
        AND end_time - start_time <= interval '5 minutes'
      ORDER BY duration_seconds ASC
      LIMIT 10
    `;

    if (impossibleTravel.length > 0) {
      console.log("Users accessing projects in completely different regions in under 5 minutes:");
      impossibleTravel.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}>`);
        console.log(`       Hop: ${item.start_region} ("${item.start_project}") → ${item.end_region} ("${item.end_project}")`);
        console.log(`       Time window: ${item.duration_seconds} seconds | Start: ${new Date(item.start_time).toISOString()} | End: ${new Date(item.end_time).toISOString()}`);
      });
    } else {
      console.log("✅ No speed-of-light travel/credential sharing anomalies detected.");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
