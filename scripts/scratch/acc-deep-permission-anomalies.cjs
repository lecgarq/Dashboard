#!/usr/bin/env node
/**
 * scripts/scratch/acc-deep-permission-anomalies.cjs
 *
 * SUPER DEEP Cross-Referential Anomaly Engine — Level 3 (Optimized).
 * Joins AccFolder + AccFolderPermission + AccRole + AccActivity
 * to detect structural security anomalies invisible to surface-level audits.
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
    console.log("   LECG / HERMOSILLO SUPER DEEP PERMISSION × ROLE × ACTIVITY ANOMALIES   ");
    console.log("==========================================================================\n");

    // ======================================================================
    // WARNING 13: SHADOW ACCESS
    // Users uploading/deleting files in projects they have NO project membership
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 👤 [WARNING 13] SHADOW ACCESS: DESTRUCTIVE ACTIONS WITHOUT PROJECT MEMBERSHIP");
    console.log("--------------------------------------------------------------------------");

    const shadowAccess = await prisma.$queryRaw`
      WITH destructive_by_project AS (
        SELECT LOWER("userEmail") as email, "projectId", COUNT(*)::int as cnt
        FROM "AccActivity"
        WHERE "userEmail" IS NOT NULL
          AND "projectId" IS NOT NULL AND "projectId" <> ''
          AND "rawAction" IN ('delete-entity','upload-entity','move-entity','rename-entity','assign-permission')
        GROUP BY LOWER("userEmail"), "projectId"
        HAVING COUNT(*) >= 5
      ),
      known_members AS (
        SELECT DISTINCT LOWER(email) as email, "projectId"
        FROM "AccProjectMember"
        WHERE email IS NOT NULL
      )
      SELECT d.email, d."projectId", d.cnt, p.name as "projectName"
      FROM destructive_by_project d
      LEFT JOIN known_members km ON d.email = km.email AND d."projectId" = km."projectId"
      LEFT JOIN "AccProject" p ON p.id = d."projectId"
      WHERE km.email IS NULL
      ORDER BY d.cnt DESC
      LIMIT 10
    `;

    if (shadowAccess.length > 0) {
      console.log("Users performing destructive ops WITHOUT a project membership record:");
      shadowAccess.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> in "${item.projectName || item.projectId}"`);
        console.log(`       Destructive Actions: ${item.cnt} | ⚠️ No AccProjectMember record found`);
      });
    } else {
      console.log("✅ All destructive actions are attributed to registered project members.");
    }

    // ======================================================================
    // WARNING 14: OVER-PERMISSIONED ROLES (Full Control but zero destructive use)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔓 [WARNING 14] OVER-PERMISSIONED: FULL-CONTROL ROLES WITH ZERO DESTRUCTIVE USE");
    console.log("--------------------------------------------------------------------------");

    const adminRoles = await prisma.$queryRaw`
      SELECT r.name as "roleName", r."memberCount",
             COUNT(DISTINCT fp."folderId")::int as "folderCount",
             p.name as "projectName", p.id as "projectId"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE (fp."permType" LIKE '%Control%' OR fp."permType" LIKE '%Admin%' OR 'admin' = ANY(fp.actions))
        AND r."memberCount" > 0
      GROUP BY r.name, r."memberCount", p.name, p.id
      ORDER BY COUNT(DISTINCT fp."folderId") DESC
      LIMIT 8
    `;

    for (const role of adminRoles) {
      const destructiveCount = await prisma.$queryRaw`
        SELECT COUNT(*)::int as cnt FROM "AccActivity"
        WHERE "projectId" = ${role.projectId}
          AND "rawAction" IN ('delete-entity','delete-sheet','move-entity','rename-entity')
      `;
      const dc = destructiveCount[0]?.cnt || 0;
      const status = dc === 0 ? "🚨 ZERO destructive use — OVER-PERMISSIONED" : `✅ ${dc} destructive actions recorded`;
      console.log(`  Role: "${role.roleName}" (${role.memberCount} mbrs) → ${role.folderCount} folders in "${role.projectName}"`);
      console.log(`    ${status}`);
    }

    // ======================================================================
    // WARNING 15: PERMISSION ORPHANS (roles with 0 members still on folders)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 💀 [WARNING 15] PERMISSION ORPHANS: ROLES WITH ZERO MEMBERS STILL ON FOLDERS");
    console.log("--------------------------------------------------------------------------");

    const orphans = await prisma.$queryRaw`
      SELECT r.name as "roleName",
             COUNT(DISTINCT fp."folderId")::int as "folderCount",
             fp."permType",
             p.name as "projectName"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE r."memberCount" = 0
      GROUP BY r.name, fp."permType", p.name
      ORDER BY "folderCount" DESC
      LIMIT 10
    `;

    if (orphans.length > 0) {
      console.log("Zombie roles (zero members) still holding folder permissions:");
      orphans.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.roleName}" | Members: 0 | Folders: ${item.folderCount} | Perm: "${item.permType}" | "${item.projectName}"`);
      });
    } else {
      console.log("✅ No orphaned role-folder permissions found.");
    }

    // ======================================================================
    // WARNING 16: SENSITIVE FOLDER EXPOSURE (contracts/budgets with write access)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 💰 [WARNING 16] SENSITIVE FOLDER EXPOSURE: CONTRACTS/BUDGETS/LEGAL WITH WRITE ACCESS");
    console.log("--------------------------------------------------------------------------");

    const sensitiveFolders = await prisma.$queryRaw`
      SELECT f.name as "folderName", f."fullPath",
             r.name as "roleName", fp."permType",
             p.name as "projectName"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE (
        LOWER(f.name) LIKE '%contrat%' OR LOWER(f.name) LIKE '%contract%'
        OR LOWER(f.name) LIKE '%budget%' OR LOWER(f.name) LIKE '%presupuest%'
        OR LOWER(f.name) LIKE '%licitaci%' OR LOWER(f.name) LIKE '%legal%'
        OR LOWER(f.name) LIKE '%pricing%' OR LOWER(f.name) LIKE '%cost%'
        OR LOWER(f.name) LIKE '%factura%' OR LOWER(f.name) LIKE '%pago%'
        OR LOWER(f.name) LIKE '%confidential%'
      )
      AND fp."permType" NOT IN ('View Only', 'No Access')
      ORDER BY fp."permType" DESC
      LIMIT 15
    `;

    if (sensitiveFolders.length > 0) {
      console.log("Sensitive folders with WRITE or higher access:");
      sensitiveFolders.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.folderName}" | Role: "${item.roleName}" | Perm: "${item.permType}"`);
        console.log(`       Project: "${item.projectName}" | Path: ${item.fullPath || "N/A"}`);
      });
    } else {
      console.log("✅ All sensitive folders are properly restricted.");
    }

    // ======================================================================
    // WARNING 17: ROLE BLAST RADIUS (single role controlling extreme folder count)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 💣 [WARNING 17] BLAST RADIUS: ROLES CONTROLLING EXTREME FOLDER COUNTS");
    console.log("--------------------------------------------------------------------------");

    const blastRadius = await prisma.$queryRaw`
      SELECT r.name as "roleName", r."memberCount",
             COUNT(DISTINCT fp."folderId")::int as "totalFolders",
             COUNT(DISTINCT f."projectId")::int as "totalProjects"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      GROUP BY r.name, r."memberCount"
      ORDER BY "totalFolders" DESC
      LIMIT 10
    `;

    blastRadius.forEach((item, idx) => {
      const risk = item.totalFolders > 5000 ? "🔴 CRITICAL" : item.totalFolders > 1000 ? "🟡 HIGH" : "🟢 NORMAL";
      console.log(`  #${idx + 1}. Role: "${item.roleName}" | ${item.memberCount} members | ${item.totalFolders.toLocaleString()} folders | ${item.totalProjects} projects | ${risk}`);
    });

    // ======================================================================
    // WARNING 18: PERMISSION SPRAWL (over-customized projects)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🕸️ [WARNING 18] PERMISSION SPRAWL: OVER-CUSTOMIZED PERMISSION CONFIGS");
    console.log("--------------------------------------------------------------------------");

    const sprawl = await prisma.$queryRaw`
      SELECT p.name as "projectName",
             COUNT(DISTINCT fp.id)::int as "totalPermEntries",
             COUNT(DISTINCT fp."roleId")::int as "uniqueRoles",
             COUNT(DISTINCT f.id)::int as "totalFolders",
             COUNT(DISTINCT fp."permType")::int as "uniquePermTypes"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccProject" p ON p.id = f."projectId"
      GROUP BY p.name
      ORDER BY "totalPermEntries" DESC
      LIMIT 10
    `;

    sprawl.forEach((item, idx) => {
      const ratio = (item.totalPermEntries / Math.max(item.totalFolders, 1)).toFixed(1);
      console.log(`  #${idx + 1}. "${item.projectName}"`);
      console.log(`       ${item.totalPermEntries.toLocaleString()} perms | ${item.totalFolders.toLocaleString()} folders | ${item.uniqueRoles} roles | ${item.uniquePermTypes} perm types | Ratio: ${ratio}x`);
    });

    // ======================================================================
    // WARNING 19: EXTERNAL COMPANY WRITE ACCESS
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🏢 [WARNING 19] EXTERNAL COMPANY WRITE ACCESS ON INTERNAL DIRECTORIES");
    console.log("--------------------------------------------------------------------------");

    const externalWrite = await prisma.$queryRaw`
      SELECT r.name as "roleName", fp."permType",
             COUNT(DISTINCT f.id)::int as "folderCount",
             p.name as "projectName"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE fp."permType" IN ('View+Download+Upload', 'View+Download+Upload+Edit', 'Full Controller')
        AND (
          LOWER(r.name) LIKE '%subcontrat%' OR LOWER(r.name) LIKE '%subcont%'
          OR LOWER(r.name) LIKE '%proveedor%' OR LOWER(r.name) LIKE '%vendor%'
          OR LOWER(r.name) LIKE '%client%' OR LOWER(r.name) LIKE '%consultor%'
          OR LOWER(r.name) LIKE '%extern%' OR LOWER(r.name) LIKE '%visitante%'
          OR LOWER(r.name) LIKE '%guest%' OR LOWER(r.name) LIKE '%contratista%'
        )
      GROUP BY r.name, fp."permType", p.name
      ORDER BY "folderCount" DESC
      LIMIT 10
    `;

    if (externalWrite.length > 0) {
      console.log("External/Vendor/Client roles with write-level access:");
      externalWrite.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.roleName}" | "${item.permType}" | ${item.folderCount} folders | "${item.projectName}"`);
      });
    } else {
      console.log("✅ No external/vendor roles found with write-level permissions.");
    }

    // ======================================================================
    // WARNING 20: FOLDER DEPTH ANOMALY (excessively deep nesting >6 levels)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 📂 [WARNING 20] FOLDER DEPTH ANOMALY: EXCESSIVELY DEEP DIRECTORY NESTING");
    console.log("--------------------------------------------------------------------------");

    const deepFolders = await prisma.$queryRaw`
      SELECT f."fullPath", p.name as "projectName",
             LENGTH(f."fullPath") - LENGTH(REPLACE(f."fullPath", '/', '')) as depth
      FROM "AccFolder" f
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE f."fullPath" IS NOT NULL
      ORDER BY LENGTH(f."fullPath") - LENGTH(REPLACE(f."fullPath", '/', '')) DESC
      LIMIT 10
    `;

    deepFolders.forEach((item, idx) => {
      const risk = item.depth > 8 ? "🔴" : item.depth > 6 ? "🟡" : "🟢";
      console.log(`  #${idx + 1}. ${risk} Depth: ${item.depth} levels | "${item.projectName}"`);
      console.log(`       Path: "${item.fullPath}"`);
    });

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
