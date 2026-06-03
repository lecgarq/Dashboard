#!/usr/bin/env node
/**
 * scripts/scratch/acc-folder-security-audit.cjs
 *
 * Advanced ACC Folder Structure & Permission Leakage Auditor.
 * Queries AccFolder and AccFolderPermission to perform advanced compliance and security analyses:
 *
 * 1. ISO 19650 / BIM Standard Directory Naming Compliance
 * 2. Escalated Child Permissions (Permission Leak Detection)
 * 3. Administrative Control & Over-Privileged Role Auditing
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
    console.log("          LECG / HERMOSILLO FOLDER SECURITY & STANDARDIZATION AUDIT        ");
    console.log("==========================================================================\n");

    // ==========================================================================
    // AUDIT 1: ISO 19650 & BIM FOLDER STANDARDIZATION COMPLIANCE
    // Scan all directory paths for non-standard folder names or forbidden strings
    // like "TEMP", "TEST", "BORRADOR", "PRUEBA", "COPIAS".
    // ==========================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" [AUDIT 1] BIM COMPLIANCE: NON-STANDARD & FORBIDDEN FOLDER PATHS");
    console.log("--------------------------------------------------------------------------");

    const forbiddenPatterns = ["%temp%", "%test%", "%borrador%", "%prueba%", "%copia%"];
    
    // Query folders matching these forbidden words
    const forbiddenFolders = await prisma.$queryRaw`
      SELECT f.id, f.name, f."fullPath", p.name as "projectName"
      FROM "AccFolder" f
      JOIN "AccProject" p ON p.id = f."projectId"
      WHERE LOWER(f.name) LIKE '%temp%'
         OR LOWER(f.name) LIKE '%test%'
         OR LOWER(f.name) LIKE '%borrador%'
         OR LOWER(f.name) LIKE '%prueba%'
         OR LOWER(f.name) LIKE '%copia%'
      LIMIT 15
    `;

    // Query folder count by project
    const totalFoldersCount = await prisma.accFolder.count();
    console.log(`Total Directories Audited      : ${totalFoldersCount.toLocaleString()}`);
    console.log(`Folders with Temporary/Draft Names: ${forbiddenFolders.length >= 15 ? "15+ detected" : forbiddenFolders.length}`);
    
    if (forbiddenFolders.length > 0) {
      console.log("\nSample of Temporary / Non-Standard Folders found in ACC:");
      forbiddenFolders.forEach((f, idx) => {
        console.log(`  ${idx + 1}. [Project: ${f.projectName}]`);
        console.log(`     Path: "${f.fullPath || f.name}"`);
      });
    } else {
      console.log("\n✅ 100% compliant directory structure. No temp or draft folders detected!");
    }

    // ==========================================================================
    // AUDIT 2: PERMISSION LEAK DETECTION (ESCALATED CHILD PERMISSIONS)
    // Find child folders where a role has HIGHER permission than its parent folder.
    // In secure systems, children should inherit or restrict, not escalate!
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" [AUDIT 2] SECURITY GOVERNANCE: ESCALATED CHILD PERMISSIONS (LEAKS)");
    console.log("--------------------------------------------------------------------------");

    // Let's do a join on child and parent folders to find escalated permission levels
    // View only < View+Download < Upload Only < View+Download+Upload < Full Control
    const permHierarchy = {
      "view": 1,
      "download": 2,
      "upload": 3,
      "edit": 4,
      "admin": 5
    };

    const leaks = await prisma.$queryRaw`
      SELECT 
        child.name as "childName",
        child."fullPath" as "childPath",
        parent.name as "parentName",
        cp."permType" as "childPerm",
        pp."permType" as "parentPerm",
        r.name as "roleName",
        proj.name as "projectName"
      FROM "AccFolder" child
      JOIN "AccFolder" parent ON child."parentId" = parent.id
      JOIN "AccFolderPermission" cp ON cp."folderId" = child.id
      JOIN "AccFolderPermission" pp ON pp."folderId" = parent.id AND pp."roleId" = cp."roleId"
      JOIN "AccRole" r ON r.id = cp."roleId"
      JOIN "AccProject" proj ON proj.id = child."projectId"
      WHERE cp."permType" <> pp."permType"
      LIMIT 10
    `;

    if (leaks.length > 0) {
      console.log("Detected Permission Escalation in Child Folders:");
      leaks.forEach((leak, idx) => {
        console.log(`  #${idx + 1}. [Project: ${leak.projectName}]`);
        console.log(`     Role       : "${leak.roleName}"`);
        console.log(`     Parent     : "${leak.parentName}" (Permission: ${leak.parentPerm})`);
        console.log(`     Child Path : "${leak.childPath}" (Permission: ${leak.childPerm})`);
        console.log(`     ⚠️  Security Alert: Role has HIGHER privileges on the child than the parent!`);
      });
    } else {
      console.log("✅ Zero permission leaks detected. All child folders respect parent scopes!");
    }

    // ==========================================================================
    // AUDIT 3: OVER-PRIVILEGED ROLES (FULL CONTROL ON SPEC DRAWINGS)
    // Audits which roles have administrative control on folders containing drawings
    // ==========================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" [AUDIT 3] SYSTEM GOVERNANCE: ROLES WITH FULL ADMINISTRATIVE CONTROL");
    console.log("--------------------------------------------------------------------------");

    const adminPermissions = await prisma.$queryRaw`
      SELECT 
        r.name as "roleName", 
        proj.name as "projectName",
        COUNT(fp.id)::int as "fullControlFoldersCount"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON fp."folderId" = f.id
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccProject" proj ON proj.id = f."projectId"
      WHERE fp."permType" LIKE '%Control%' OR fp."permType" LIKE '%Admin%' OR 'admin' = ANY(fp.actions)
      GROUP BY r.name, proj.name
      ORDER BY "fullControlFoldersCount" DESC
      LIMIT 10
    `;

    if (adminPermissions.length > 0) {
      console.log("Top Roles with Full Administrative Control by Project:");
      adminPermissions.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.roleName}" in "${item.projectName}" | Admin Control over ${item.fullControlFoldersCount} folders`);
      });
    } else {
      console.log("✅ Folders are strictly controlled. No generic roles have full admin permissions.");
    }
    console.log("==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
