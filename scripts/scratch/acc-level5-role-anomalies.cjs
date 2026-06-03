#!/usr/bin/env node
/**
 * scripts/scratch/acc-level5-role-anomalies.cjs
 *
 * LEVEL 5 — DEEP ROLE-CENTRIC ANOMALY ENGINE
 * Cross-references AccRole, AccFolderPermission, AccFolder, AccProjectRole,
 * AccProjectMember, and AccActivity to uncover role architecture anomalies.
 *
 *  29. ROLE SYNONYM DUPLICATION — Same role spelled differently (Architect vs Arquitecto)
 *  30. ROLE-PERMISSION DRIFT — Same role name has DIFFERENT permission levels across projects
 *  31. ROLE MONOPOLY — One role holding >80% of all folder permissions in a project
 *  32. PHANTOM ROLES — Roles that exist in AccRole but are never assigned any folder permissions
 *  33. ROLE INFLATION — Projects with an abnormally high number of distinct roles
 *  34. ROLE-ACTIVITY DISCIPLINE MISMATCH — Users with design roles performing admin/destructive actions
 *  35. ROLES WITHOUT FOLDER ACCESS — Roles assigned to projects but zero folder permission entries
 *  36. PERMISSION TYPE DISTRIBUTION PER ROLE — Mapping exactly what each role CAN do across the hub
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
    console.log("        LECG / HERMOSILLO LEVEL 5 — DEEP ROLE-CENTRIC ANOMALY ENGINE      ");
    console.log("==========================================================================\n");

    // ======================================================================
    // 29. ROLE SYNONYM DUPLICATION
    // Detect roles that are semantically identical but spelled differently
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🔤 [WARNING 29] ROLE SYNONYM DUPLICATION: SAME ROLE, DIFFERENT SPELLING");
    console.log("--------------------------------------------------------------------------");

    const allRoles = await prisma.$queryRaw`
      SELECT id, name, "memberCount" FROM "AccRole" ORDER BY name
    `;

    // Build synonym groups using normalized lowercase + stripped accents
    const normalize = (s) => s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "").trim();

    const synonymGroups = new Map();
    for (const role of allRoles) {
      const key = normalize(role.name);
      if (!synonymGroups.has(key)) synonymGroups.set(key, []);
      synonymGroups.get(key).push(role);
    }

    const duplicateGroups = [...synonymGroups.entries()]
      .filter(([, roles]) => roles.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    if (duplicateGroups.length > 0) {
      console.log(`Found ${duplicateGroups.length} synonym groups (same role, different spellings):`);
      duplicateGroups.forEach(([key, roles], idx) => {
        const variants = roles.map(r => `"${r.name}" (${r.memberCount} mbrs)`).join(" | ");
        console.log(`  #${idx + 1}. [${key}] → ${variants}`);
      });
    } else {
      console.log("✅ No role synonym duplications detected.");
    }

    // ======================================================================
    // 30. ROLE-PERMISSION DRIFT ACROSS PROJECTS
    // Same role name has DIFFERENT permType values on equivalent folders
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔀 [WARNING 30] ROLE-PERMISSION DRIFT: SAME ROLE, DIFFERENT ACCESS ACROSS PROJECTS");
    console.log("--------------------------------------------------------------------------");

    const drift = await prisma.$queryRaw`
      SELECT r.name as "roleName",
             COUNT(DISTINCT fp."permType")::int as "uniquePermTypes",
             COUNT(DISTINCT f."projectId")::int as "projectCount",
             ARRAY_AGG(DISTINCT fp."permType") as "permVariants"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      GROUP BY r.name
      HAVING COUNT(DISTINCT fp."permType") >= 3
      ORDER BY COUNT(DISTINCT fp."permType") DESC
      LIMIT 10
    `;

    if (drift.length > 0) {
      console.log("Roles with 3+ different permission levels across projects (inconsistent governance):");
      drift.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.roleName}" across ${item.projectCount} projects`);
        console.log(`       Permission variants: [${item.permVariants.join(", ")}]`);
      });
    } else {
      console.log("✅ All roles have consistent permission levels across projects.");
    }

    // ======================================================================
    // 31. ROLE MONOPOLY
    // One role holding >60% of all folder permissions in a project
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 👑 [WARNING 31] ROLE MONOPOLY: SINGLE ROLE DOMINATING PROJECT PERMISSIONS");
    console.log("--------------------------------------------------------------------------");

    const monopoly = await prisma.$queryRaw`
      WITH role_counts AS (
        SELECT f."projectId", r.name as "roleName", COUNT(fp.id)::int as perm_count
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccRole" r ON r.id = fp."roleId"
        GROUP BY f."projectId", r.name
      ),
      project_totals AS (
        SELECT "projectId", SUM(perm_count)::int as total FROM role_counts GROUP BY "projectId"
      )
      SELECT rc."roleName", p.name as "projectName",
             rc.perm_count, pt.total,
             ROUND(rc.perm_count * 100.0 / NULLIF(pt.total, 0), 1) as pct
      FROM role_counts rc
      JOIN project_totals pt ON rc."projectId" = pt."projectId"
      JOIN "AccProject" p ON p.id = rc."projectId"
      WHERE rc.perm_count * 100.0 / NULLIF(pt.total, 0) >= 5
      ORDER BY rc.perm_count DESC
      LIMIT 10
    `;

    if (monopoly.length > 0) {
      console.log("Roles with the highest permission share per project:");
      monopoly.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.roleName}" in "${item.projectName}"`);
        console.log(`       ${item.perm_count.toLocaleString()} of ${item.total.toLocaleString()} perms = ${item.pct}% share`);
      });
    }

    // ======================================================================
    // 32. PHANTOM ROLES — Exist in AccRole but have ZERO folder permissions
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 👻 [WARNING 32] PHANTOM ROLES: EXIST IN SYSTEM BUT ZERO FOLDER PERMISSIONS");
    console.log("--------------------------------------------------------------------------");

    const phantomRoles = await prisma.$queryRaw`
      SELECT r.name, r."memberCount"
      FROM "AccRole" r
      LEFT JOIN "AccFolderPermission" fp ON fp."roleId" = r.id
      WHERE fp.id IS NULL
      ORDER BY r."memberCount" DESC
      LIMIT 10
    `;

    if (phantomRoles.length > 0) {
      console.log("Roles with zero folder permission entries (exist but control nothing):");
      phantomRoles.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.name}" | Members: ${item.memberCount} | ⚠️ Zero folder access configured`);
      });
    } else {
      console.log("✅ All roles have at least one folder permission entry.");
    }

    // ======================================================================
    // 33. ROLE INFLATION — Projects with abnormally many distinct roles
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 📈 [WARNING 33] ROLE INFLATION: PROJECTS WITH EXTREME ROLE COUNTS");
    console.log("--------------------------------------------------------------------------");

    const inflation = await prisma.$queryRaw`
      SELECT p.name as "projectName",
             COUNT(DISTINCT fp."roleId")::int as "roleCount",
             COUNT(DISTINCT f.id)::int as "folderCount"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccProject" p ON p.id = f."projectId"
      GROUP BY p.name
      ORDER BY "roleCount" DESC
      LIMIT 10
    `;

    inflation.forEach((item, idx) => {
      const risk = item.roleCount > 35 ? "🔴 INFLATED" : item.roleCount > 20 ? "🟡 HIGH" : "🟢 NORMAL";
      console.log(`  #${idx + 1}. "${item.projectName}" | ${item.roleCount} roles | ${item.folderCount.toLocaleString()} folders | ${risk}`);
    });

    // ======================================================================
    // 34. ROLE-ACTIVITY DISCIPLINE MISMATCH
    // Users with design-only roles performing admin/destructive actions
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ⚠️ [WARNING 34] ROLE-ACTIVITY MISMATCH: DESIGNERS PERFORMING ADMIN ACTIONS");
    console.log("--------------------------------------------------------------------------");

    // Get users with design-only roles from AccMemberCache
    const designerActivity = await prisma.$queryRaw`
      SELECT LOWER(a."userEmail") as email, a."rawAction", COUNT(*)::int as cnt
      FROM "AccActivity" a
      JOIN "AccMemberCache" mc ON LOWER(mc.email) = LOWER(a."userEmail")
      WHERE mc.data->>'companyRole' IN ('Drafter', 'Designer', 'Estudiante', 'Student', 'Intern')
        AND a."rawAction" IN ('assign-permission', 'delete-permission', 'assign-admin', 'assign-member',
                              'remove-member', 'delete-entity', 'edit-project', 'terminate-review')
        AND a."userEmail" IS NOT NULL
      GROUP BY LOWER(a."userEmail"), a."rawAction"
      HAVING COUNT(*) >= 2
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (designerActivity.length > 0) {
      console.log("Users with design/student roles performing admin-level actions:");
      designerActivity.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> | Role: Designer/Student | Action: "${item.rawAction}" x${item.cnt}`);
      });
    } else {
      console.log("✅ No discipline mismatch detected. Design roles are staying within their lane.");
    }

    // ======================================================================
    // 35. ROLES WITHOUT FOLDER ACCESS BUT WITH PROJECT MEMBERS
    // Roles assigned to project members but with zero folder permissions
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🚫 [WARNING 35] ROLES WITH MEMBERS BUT ZERO FOLDER ACCESS");
    console.log("--------------------------------------------------------------------------");

    const noAccess = await prisma.$queryRaw`
      SELECT r.name as "roleName", r."memberCount",
             COUNT(DISTINCT pr."projectId")::int as "projectAssignments"
      FROM "AccRole" r
      JOIN "AccProjectRole" pr ON pr."roleId" = r.id
      LEFT JOIN "AccFolderPermission" fp ON fp."roleId" = r.id
      WHERE fp.id IS NULL AND r."memberCount" > 0
      GROUP BY r.name, r."memberCount"
      ORDER BY r."memberCount" DESC
      LIMIT 10
    `;

    if (noAccess.length > 0) {
      console.log("Roles with active members assigned but ZERO folder permissions:");
      noAccess.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Role: "${item.roleName}" | ${item.memberCount} members | ${item.projectAssignments} project assignments | ⚠️ Can't access ANY folder`);
      });
    } else {
      console.log("✅ All roles with members have folder access configured.");
    }

    // ======================================================================
    // 36. PERMISSION TYPE DISTRIBUTION PER ROLE (Hub-Wide Role Access Map)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🗺️ [WARNING 36] HUB-WIDE ROLE ACCESS MAP: WHAT EACH ROLE CAN DO");
    console.log("--------------------------------------------------------------------------");

    const roleMap = await prisma.$queryRaw`
      SELECT r.name as "roleName",
             fp."permType",
             COUNT(fp.id)::int as cnt
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      WHERE r."memberCount" > 0
      GROUP BY r.name, fp."permType"
      ORDER BY r.name, cnt DESC
    `;

    // Group by role
    const roleAccessMap = new Map();
    for (const row of roleMap) {
      if (!roleAccessMap.has(row.roleName)) roleAccessMap.set(row.roleName, []);
      roleAccessMap.get(row.roleName).push({ perm: row.permType, count: row.cnt });
    }

    console.log("Complete permission distribution for active roles:");
    let roleIdx = 0;
    for (const [roleName, perms] of roleAccessMap) {
      if (roleIdx >= 15) break;
      roleIdx++;
      const total = perms.reduce((s, p) => s + p.count, 0);
      const breakdown = perms.map(p => `${p.perm}: ${p.count} (${(p.count * 100 / total).toFixed(0)}%)`).join(" | ");
      console.log(`  ${roleIdx}. "${roleName}" [${total.toLocaleString()} total]`);
      console.log(`     ${breakdown}`);
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
