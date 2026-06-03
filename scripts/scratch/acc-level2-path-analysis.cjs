#!/usr/bin/env node
/**
 * scripts/scratch/acc-level2-path-analysis.cjs
 *
 * AUDIT OF LEVEL 2 DIRECTORY PATHS (Direct Children of '/Project Files')
 *
 * Analyses:
 *  - What folders exist at Level 2 under 'Project Files'
 *  - What roles/permissions are configured on these Level 2 folders
 *  - Structural anomalies at this critical governance level:
 *     1. LOCK-OUT RISK — Level 2 folders missing core roles (Architect/PM) completely.
 *     2. WIDE-OPEN PATHS — Level 2 folders with excessive role permissions configured (sprawl).
 *     3. STANDARD PATH DRIFT — Inconsistent permissions for Architect role on equivalent Level 2 folders.
 *     4. COMPROMISED CORE PATHS — Non-governance roles holding administrative rights on design directories.
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
    console.log("    LECG / HERMOSILLO — LEVEL 2 FOLDER PATH & GOVERNANCE AUDIT ENGINE     ");
    console.log("==========================================================================\n");

    // 1. Identify distinct Level 2 folder names under '/Project Files'
    console.log("--------------------------------------------------------------------------");
    console.log(" 📂 DISTINCT FOLDER NAMES AT LEVEL 2 (UNDER 'Project Files')");
    console.log("--------------------------------------------------------------------------");
    const level2Folders = await prisma.$queryRaw`
      SELECT f.name as folder_name, COUNT(*)::int as project_count
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      WHERE parent.name = 'Project Files'
      GROUP BY f.name
      ORDER BY project_count DESC
      LIMIT 12
    `;
    level2Folders.forEach(f => {
      console.log(`  - 📁 "${f.folder_name}": configured in ${f.project_count} projects`);
    });

    // 2. Anomaly: Lock-out Risk (Level 2 folders missing critical roles)
    // Critical design or construction Level 2 folders that completely lock out the 'Architect' or 'Project Manager' role.
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔒 [ANOMALY 1] LOCK-OUT RISK: LEVEL 2 FOLDERS MISSING CORE ROLES");
    console.log("--------------------------------------------------------------------------");
    
    // Find folders under Project Files that have zero permission entries for 'Architect'
    const lockoutRisk = await prisma.$queryRaw`
      WITH l2_folders AS (
        SELECT f.id, f.name as folder_name, f."fullPath", f."projectId", p.name as project_name
        FROM "AccFolder" f
        JOIN "AccFolder" parent ON f."parentId" = parent.id
        JOIN "AccProject" p ON p.id = f."projectId"
        WHERE parent.name = 'Project Files'
          AND (f.name LIKE '%Design%' OR f.name LIKE '%Planos%' OR f.name LIKE '%Client%')
      ),
      architect_perms AS (
        SELECT fp."folderId"
        FROM "AccFolderPermission" fp
        JOIN "AccRole" r ON r.id = fp."roleId"
        WHERE r.name = 'Architect'
      )
      SELECT DISTINCT lf.project_name, lf.folder_name, lf."fullPath"
      FROM l2_folders lf
      LEFT JOIN architect_perms ap ON lf.id = ap."folderId"
      WHERE ap."folderId" IS NULL
      LIMIT 10
    `;

    if (lockoutRisk.length > 0) {
      console.log("Design/Client folders completely missing permission configuration for 'Architect' role:");
      lockoutRisk.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Project: "${item.project_name}"`);
        console.log(`       ⚠️ Folder: "${item.folder_name}" has NO permission entries for the Architect role!`);
        console.log(`       Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ All Level 2 design/client folders are accessible by the Architect role.");
    }

    // 3. Anomaly: Wide-Open Level 2 Folders (Permission Sprawl at top level)
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔓 [ANOMALY 2] WIDE-OPEN PATHS: EXCESSIVE ROLE PRIVILEGES ON LEVEL 2");
    console.log("--------------------------------------------------------------------------");
    
    const wideOpen = await prisma.$queryRaw`
      SELECT 
        f.name as folder_name,
        f."fullPath",
        p.name as "projectName",
        COUNT(fp.id)::int as "permissionEntries",
        COUNT(CASE WHEN fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller') THEN 1 END)::int as "writeAccessCount"
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE parent.name = 'Project Files'
      GROUP BY f.name, f."fullPath", p.name
      HAVING COUNT(fp.id) >= 15
      ORDER BY "permissionEntries" DESC
      LIMIT 10
    `;

    if (wideOpen.length > 0) {
      console.log("Level 2 folders with highly complex permission configurations:");
      wideOpen.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.folder_name}" in "${item.projectName}"`);
        console.log(`       Total roles configured: ${item.permissionEntries} | Roles with edit/admin access: ${item.writeAccessCount}`);
        console.log(`       Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ No excessively configured Level 2 folders found.");
    }

    // 4. Anomaly: Inconsistent Direct Permissions on Standard Folders
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔀 [ANOMALY 3] STANDARD PATH DRIFT: ARCHITECT PERMISSIONS ON '01_Client Documents'");
    console.log("--------------------------------------------------------------------------");
    
    const standardDrift = await prisma.$queryRaw`
      SELECT 
        p.name as "projectName",
        f.name as folder_name,
        fp."permType" as "architectPermission"
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE parent.name = 'Project Files'
        AND (f.name LIKE '%01_Client%' OR f.name = 'Client Documents')
        AND r.name = 'Architect'
      ORDER BY "architectPermission" DESC, p.name
      LIMIT 10
    `;

    if (standardDrift.length > 0) {
      console.log("Architect role permissions on standard 'Client Documents' Level 2 folder across projects:");
      standardDrift.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Project: "${item.projectName}"`);
        console.log(`       Folder: "${item.folder_name}" → Architect Permission: [${item.architectPermission}]`);
      });
    } else {
      console.log("✅ Standard folders have perfectly consistent role permissions.");
    }

    // 5. Anomaly: Technical/Field Folders holding Non-governance Admin
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔴 [ANOMALY 4] COMPROMISED CORE PATHS: NON-GOVERNANCE ROLES AS ADMINS ON LEVEL 2");
    console.log("--------------------------------------------------------------------------");
    
    const compromisedCore = await prisma.$queryRaw`
      SELECT 
        f.name as folder_name,
        f."fullPath",
        p.name as "projectName",
        r.name as "roleName",
        fp."permType"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccFolder" parent ON f."parentId" = parent.id
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE parent.name = 'Project Files'
        AND f.name LIKE '%03_Design%'
        AND fp."permType" = 'Full Controller'
        AND r.name NOT IN ('Project Admin', 'Document Controller', 'Dirección', 'Director General', 'BIM Manager')
      ORDER BY p.name
      LIMIT 10
    `;

    if (compromisedCore.length > 0) {
      console.log("Non-BIM/Admin roles holding administrative (Full Control) rights on Design directories:");
      compromisedCore.forEach((item, idx) => {
        console.log(`  #${idx + 1}. 📁 "${item.folder_name}" in project "${item.projectName}"`);
        console.log(`       ⚠️ Administrative Access granted to role: "${item.roleName}"`);
        console.log(`       Path: ${item.fullPath}`);
      });
    } else {
      console.log("✅ Pure governance is maintained on core Level 2 folders.");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
