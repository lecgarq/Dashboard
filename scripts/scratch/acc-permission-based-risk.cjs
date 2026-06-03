#!/usr/bin/env node
/**
 * scripts/scratch/acc-permission-based-risk.cjs
 *
 * PERMISSION-BASED GOVERNANCE RISK ENGINE
 * Ranks the worst users and roles based strictly on permission structures:
 *  1. USER BLAST RADIUS — Users with access to the highest number of projects and folders
 *  2. USER ROLE COMPLEXITY — Users holding the highest count of different roles across the hub
 *  3. ROLE OVER-PRIVILEGE — Non-admin roles holding the highest count of "Full Controller" permissions
 *  4. ROLE PERMISSION INHERITANCE BREAKS — Roles with the most manual folder permissions (breaking inheritance)
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
    console.log("      📂  HERMOSILLO GOVERNANCE AUDIT: PURE PERMISSION ANALYSIS  📂       ");
    console.log("==========================================================================\n");

    // ======================================================================
    // 1. THE WORST USERS BY CUMULATIVE PROJECT & ROLE FOOTPRINT
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 👤 THE 5 WORST USERS BY PROJECT FOOTPRINT & ROLE DRIFT");
    console.log("--------------------------------------------------------------------------");

    // Let's aggregate project count and distinct role names assigned to users in AccMemberCache
    const userFootprint = await prisma.$queryRaw`
      WITH user_projects AS (
        SELECT 
          LOWER(email) as email,
          data->>'name' as name,
          data->>'company' as company,
          proj->>'id' as project_id,
          role_name::text as role_assigned
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj,
        LATERAL jsonb_array_elements_text(proj->'roles') as role_name
      )
      SELECT 
        name,
        email,
        company,
        COUNT(DISTINCT project_id)::int as "projectCount",
        COUNT(DISTINCT role_assigned)::int as "distinctRoles",
        ARRAY_AGG(DISTINCT role_assigned) as "rolesHeld"
      FROM user_projects
      GROUP BY name, email, company
      ORDER BY "projectCount" DESC, "distinctRoles" DESC
      LIMIT 5
    `;

    userFootprint.forEach((u, idx) => {
      console.log(`👤 #${idx + 1}. ${u.name} <${u.email}> [${u.company || "N/A"}]`);
      console.log(`   ├─ Project Presence: Member of **${u.projectCount} projects**`);
      console.log(`   ├─ Role Complexity: Holds **${u.distinctRoles} distinct role names** across projects`);
      console.log(`   └─ Roles List: ${JSON.stringify(u.rolesHeld)}`);
      console.log("");
    });


    // ======================================================================
    // 2. THE WORST USERS BY FOLDER BLAST RADIUS
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 💥 THE 5 WORST USERS BY FOLDER BLAST RADIUS (CUMULATIVE WRITE ACCESS)");
    console.log("--------------------------------------------------------------------------");

    // We join AccMemberCache (roles) against AccFolderPermission and AccFolder to see
    // how many folders they have View+Download+Upload+Edit or Full Controller access on
    const userBlastRadius = await prisma.$queryRaw`
      WITH user_roles AS (
        SELECT 
          LOWER(email) as email,
          data->>'name' as name,
          data->>'company' as company,
          proj->>'id' as project_id,
          role_name::text as role_assigned
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj,
        LATERAL jsonb_array_elements_text(proj->'roles') as role_name
      ),
      folder_perms AS (
        SELECT 
          fp."roleId", 
          r.name as role_name, 
          f."projectId", 
          f.id as folder_id,
          fp."permType"
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccRole" r ON r.id = fp."roleId"
        WHERE fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
      )
      SELECT 
        ur.name,
        ur.email,
        ur.company,
        COUNT(DISTINCT fp.folder_id)::int as "writeFolderCount",
        COUNT(DISTINCT CASE WHEN fp."permType" = 'Full Controller' THEN fp.folder_id END)::int as "adminFolderCount"
      FROM user_roles ur
      JOIN folder_perms fp ON ur.project_id = fp."projectId" AND ur.role_assigned = fp.role_name
      GROUP BY ur.name, ur.email, ur.company
      ORDER BY "writeFolderCount" DESC
      LIMIT 5
    `;

    userBlastRadius.forEach((u, idx) => {
      console.log(`💥 #${idx + 1}. ${u.name} <${u.email}> [${u.company || "N/A"}]`);
      console.log(`   ├─ Cumulative Folder Blast Radius: **${u.writeFolderCount} folders** with Write/Edit access`);
      console.log(`   └─ Administrative Authority: **${u.adminFolderCount} folders** where they are "Full Controller"`);
      console.log("");
    });


    // ======================================================================
    // 3. THE MOST CONFLICTIVE / OVER-PRIVILEGED ROLES
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 👑 THE 5 MOST OVER-PRIVILEGED ROLES (NON-ADMIN FULL CONTROLLERS)");
    console.log("--------------------------------------------------------------------------");

    // Roles that are not standard project admins/directors but hold the highest count of "Full Controller" permissions
    const overPrivilegedRoles = await prisma.$queryRaw`
      SELECT 
        r.name as "roleName",
        COUNT(fp.id)::int as "fullControllerCount",
        COUNT(DISTINCT f."projectId")::int as "projectCount"
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      WHERE fp."permType" = 'Full Controller'
        AND r.name NOT IN ('Project Admin', 'Document Controller', 'Dirección', 'Director General', 'BIM Manager')
      GROUP BY r.name
      ORDER BY "fullControllerCount" DESC
      LIMIT 5
    `;

    overPrivilegedRoles.forEach((r, idx) => {
      console.log(`👑 #${idx + 1}. Role: "${r.roleName}"`);
      console.log(`   ├─ Full Control Folder Assignments: **${r.fullControllerCount} folders**`);
      console.log(`   └─ Project Footprint: Active in **${r.projectCount} projects** as administrator`);
      console.log("");
    });


    // ======================================================================
    // 4. THE WORST ROLES BY PERMISSION INHERITANCE BREAKS
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🧩 THE 5 ROLES WITH THE HIGHEST MANUAL CONFIGURATION BREAKS");
    console.log("--------------------------------------------------------------------------");

    // Roles with the most folder permission entries. A high number indicates manual permission setting
    // on child folders instead of relying on top-level inheritance.
    const inheritanceBreaks = await prisma.$queryRaw`
      SELECT 
        r.name as "roleName",
        COUNT(fp.id)::int as "totalFolderAssignments",
        COUNT(DISTINCT f."projectId")::int as "projectCount",
        ROUND(COUNT(fp.id)::numeric / NULLIF(COUNT(DISTINCT f."projectId"), 0), 1) as "averageAssignmentsPerProject"
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      GROUP BY r.name
      ORDER BY "totalFolderAssignments" DESC
      LIMIT 5
    `;

    inheritanceBreaks.forEach((r, idx) => {
      console.log(`🧩 #${idx + 1}. Role: "${r.roleName}"`);
      console.log(`   ├─ Total Folder Permission Breaks: **${r.totalFolderAssignments} folders** explicitly configured`);
      console.log(`   ├─ Average Explicit Overrides: **${r.averageAssignmentsPerProject} manual overrides** per project`);
      console.log(`   └─ Project Footprint: Configured in ${r.projectCount} projects`);
      console.log("");
    });

    console.log("==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
