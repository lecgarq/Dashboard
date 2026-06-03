#!/usr/bin/env node
/**
 * scripts/scratch/acc-level7-module-anomalies.cjs
 *
 * LEVEL 7 — MODULE USAGE & PROVISIONING ANOMALIES (SEMANTICALLY MAPPED)
 *
 * Semantic service-to-product mapping used:
 *  - 'issues'     -> 'build', 'docs', 'designCollaboration'
 *  - 'rfis'       -> 'build'
 *  - 'submittals' -> 'build'
 *  - 'sheets'     -> 'build'
 *  - 'docs'       -> 'docs'
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
    console.log("    LECG / HERMOSILLO LEVEL 7 — MODULE & SERVICE USE ANOMALY ENGINE      ");
    console.log("==========================================================================\n");

    // ======================================================================
    // 45. SHADOW MODULE USAGE (SEMANTICALLY MAPPED)
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🕵️ [WARNING 45] SHADOW MODULE USAGE: ACTIVE WITHOUT PROVISIONED ACCESS");
    console.log("--------------------------------------------------------------------------");

    // We fetch activity, then filter programmatically based on semantic product mapping
    const activityList = await prisma.$queryRaw`
      WITH activity_summary AS (
        SELECT 
          LOWER("userEmail") as email, 
          "projectId", 
          "service",
          COUNT(*)::int as action_count
        FROM "AccActivity"
        WHERE "service" IS NOT NULL AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
          AND "service" IN ('issues', 'rfis', 'submittals', 'sheets', 'docs')
        GROUP BY LOWER("userEmail"), "projectId", "service"
      ),
      user_proj_modules AS (
        SELECT 
          LOWER(email) as email,
          proj->>'id' as project_id,
          proj->>'name' as project_name,
          proj->'modules' as modules
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj
      )
      SELECT 
        a.email, 
        a."projectId", 
        upm.project_name as "projectName",
        a.service, 
        a.action_count,
        upm.modules
      FROM activity_summary a
      LEFT JOIN user_proj_modules upm ON a.email = upm.email AND a."projectId" = upm.project_id
    `;

    // Semantic validator
    const isServiceAuthorized = (service, modules) => {
      if (!modules || !Array.isArray(modules)) return false;
      const mods = modules.map(m => m.toLowerCase());
      
      if (service === 'docs') return mods.includes('docs');
      if (service === 'issues') {
        return mods.includes('docs') || mods.includes('build') || mods.includes('designcollaboration') || mods.includes('modelcoordination');
      }
      if (['rfis', 'submittals', 'sheets'].includes(service)) {
        return mods.includes('build');
      }
      return false;
    };

    const shadowUsage = activityList
      .filter(item => !isServiceAuthorized(item.service, item.modules))
      .sort((a, b) => b.action_count - a.action_count)
      .slice(0, 10);

    if (shadowUsage.length > 0) {
      console.log("Users performing actions in services they are not semantically assigned to:");
      shadowUsage.forEach((item, idx) => {
        const assigned = item.modules ? JSON.stringify(item.modules) : "No project membership";
        console.log(`  #${idx + 1}. <${item.email}> in "${item.projectName || item.projectId}"`);
        console.log(`       ⚠️ Service used: "${item.service}" (${item.action_count} actions recorded)`);
        console.log(`       Provisioned modules: ${assigned}`);
      });
    } else {
      console.log("✅ No shadow module usage detected under semantic validation.");
    }

    // ======================================================================
    // 46. SHELFWARE (UNUSED PROVISIONED MODULES - SEMANTICALLY AUDITED)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 💰 [WARNING 46] SHELFWARE: PROVISIONED MODULES WITH ZERO USER ACTIVITY");
    console.log("--------------------------------------------------------------------------");

    const userProjModules = await prisma.$queryRaw`
      SELECT 
        LOWER(email) as email,
        data->>'name' as name,
        proj->>'id' as project_id,
        proj->>'name' as project_name,
        proj->'modules' as modules,
        data->>'company' as company
      FROM "AccMemberCache",
      LATERAL jsonb_array_elements(data->'projects') as proj
    `;

    const userActivityMap = new Map();
    const allActivities = await prisma.$queryRaw`
      SELECT DISTINCT LOWER("userEmail") as email, "projectId", "service"
      FROM "AccActivity"
      WHERE "service" IS NOT NULL AND "userEmail" IS NOT NULL
    `;
    
    for (const act of allActivities) {
      const key = `${act.email}:${act.projectId}`;
      if (!userActivityMap.has(key)) userActivityMap.set(key, new Set());
      userActivityMap.get(key).add(act.service);
    }

    const shelfwareList = [];
    for (const upm of userProjModules) {
      const key = `${upm.email}:${upm.project_id}`;
      const activeServices = userActivityMap.get(key) || new Set();
      const mods = upm.modules || [];

      for (const mod of mods) {
        const m = mod.toLowerCase();
        let hasActivity = false;

        if (m === 'docs') {
          hasActivity = activeServices.has('docs') || activeServices.has('issues');
        } else if (m === 'build') {
          hasActivity = activeServices.has('issues') || activeServices.has('rfis') || 
                        activeServices.has('submittals') || activeServices.has('sheets');
        } else if (m === 'designcollaboration' || m === 'modelcoordination') {
          hasActivity = activeServices.has('docs') || activeServices.has('issues');
        } else {
          hasActivity = activeServices.has(m);
        }

        if (!hasActivity) {
          shelfwareList.push({
            name: upm.name,
            email: upm.email,
            projectName: upm.project_name,
            module: mod,
            company: upm.company
          });
        }
      }
    }

    if (shelfwareList.length > 0) {
      console.log(`Active product/module licenses with zero actions in the database (potential cost savings):`);
      shelfwareList
        .sort((a,b) => a.projectName.localeCompare(b.projectName))
        .slice(0, 10)
        .forEach((item, idx) => {
          console.log(`  #${idx + 1}. ${item.name} <${item.email}> [${item.company || "N/A"}]`);
          console.log(`       Provisioned with "${item.module}" in "${item.projectName}" but zero usage.`);
        });
    } else {
      console.log("✅ No shelfware detected (all provisioned users are active).");
    }

    // ======================================================================
    // 47. CROSS-DISCIPLINE MODULE VIOLATION
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🚫 [WARNING 47] CROSS-DISCIPLINE VIOLATION: ADMINISTRATIVE ROLES IN FIELD MODULES");
    console.log("--------------------------------------------------------------------------");

    const crossDiscipline = await prisma.$queryRaw`
      SELECT 
        LOWER(a."userEmail") as email,
        mc.data->>'companyRole' as role,
        a."service",
        a."rawAction",
        COUNT(*)::int as count,
        p.name as "projectName"
      FROM "AccActivity" a
      JOIN "AccMemberCache" mc ON LOWER(mc.email) = LOWER(a."userEmail")
      JOIN "AccProject" p ON p.id = a."projectId"
      WHERE a."service" IN ('issues', 'rfis', 'submittals')
        AND mc.data->>'companyRole' IN ('Contabilidad', 'Marketing', 'Legal', 'Treasury', 'Recursos Humanos', 'Intern', 'Estudiante')
      GROUP BY LOWER(a."userEmail"), mc.data->>'companyRole', a."service", a."rawAction", p.name
      ORDER BY count DESC
      LIMIT 10
    `;

    if (crossDiscipline.length > 0) {
      console.log("Administrative/support roles actively modifying field/technical modules:");
      crossDiscipline.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> | Registered Role: "${item.role}"`);
        console.log(`       ⚠️ Service used: "${item.service}" → Action: "${item.rawAction}" (${item.count} times)`);
        console.log(`       Project: "${item.projectName}"`);
      });
    } else {
      console.log("✅ All administrative roles are staying in their domains.");
    }

    // ======================================================================
    // 48. MULTI-MODULE HOPPING
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🚀 [WARNING 48] MULTI-MODULE HOPPING: AUTOMATED HARVESTING SIGNAL");
    console.log("--------------------------------------------------------------------------");

    const multiModule = await prisma.$queryRaw`
      SELECT 
        LOWER("userEmail") as email,
        DATE_TRUNC('hour', "createdAt") as hr,
        COUNT(DISTINCT "service")::int as distinct_services,
        COUNT(*)::int as total_actions
      FROM "AccActivity"
      WHERE "userEmail" IS NOT NULL AND "service" IS NOT NULL
      GROUP BY LOWER("userEmail"), DATE_TRUNC('hour', "createdAt")
      HAVING COUNT(DISTINCT "service") >= 4
      ORDER BY distinct_services DESC, total_actions DESC
      LIMIT 10
    `;

    if (multiModule.length > 0) {
      console.log("Users hopping across 4+ different modules in under an hour:");
      multiModule.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> at ${new Date(item.hr).toISOString()}`);
        console.log(`       Distinct Services: ${item.distinct_services} | Total Actions: ${item.total_actions}`);
      });
    } else {
      console.log("✅ No rapid multi-module hopping detected.");
    }

    // ======================================================================
    // 49. ORPHANED MODULE ACTIONS (SEMANTICALLY MAPPED)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🕸️ [WARNING 49] ORPHANED MODULE ACTIONS: SERVICE ACTIVE BUT ZERO USERS ASSIGNED");
    console.log("--------------------------------------------------------------------------");

    const orphanedModules = [];
    const activeProjectServices = await prisma.$queryRaw`
      SELECT "projectId", "service", COUNT(*)::int as action_count
      FROM "AccActivity"
      WHERE "service" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
      GROUP BY "projectId", "service"
    `;

    const projectAssignedMap = new Map();
    for (const upm of userProjModules) {
      const key = upm.project_id;
      if (!projectAssignedMap.has(key)) projectAssignedMap.set(key, new Set());
      const mods = upm.modules || [];
      mods.forEach(m => projectAssignedMap.get(key).add(m.toLowerCase()));
    }

    for (const aps of activeProjectServices) {
      const assigned = projectAssignedMap.get(aps.projectId) || new Set();
      let isOrphan = false;

      if (aps.service === 'docs') isOrphan = !assigned.has('docs');
      else if (aps.service === 'issues') {
        isOrphan = !assigned.has('docs') && !assigned.has('build') && !assigned.has('designcollaboration') && !assigned.has('modelcoordination');
      } else if (['rfis', 'submittals', 'sheets'].includes(aps.service)) {
        isOrphan = !assigned.has('build');
      }

      if (isOrphan) {
        const proj = await prisma.accProject.findUnique({ where: { id: aps.projectId }, select: { name: true } });
        orphanedModules.push({
          projectName: proj?.name || aps.projectId,
          service: aps.service,
          actionCount: aps.action_count
        });
      }
    }

    if (orphanedModules.length > 0) {
      console.log("Projects registering service activity with ZERO active user assignments for that service:");
      orphanedModules
        .sort((a,b) => b.actionCount - a.actionCount)
        .slice(0, 10)
        .forEach((item, idx) => {
          console.log(`  #${idx + 1}. "${item.projectName}"`);
          console.log(`       ⚠️ Service: "${item.service}" (${item.actionCount} actions recorded) but ZERO users assigned!`);
        });
    } else {
      console.log("✅ No orphaned module activity detected.");
    }

    // ======================================================================
    // 50. ADMIN BYPASS ON FIELD MODULES
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔑 [WARNING 50] ADMIN BYPASS: ACCOUNT ADMINS BYPASSING FIELD WORKFLOWS");
    console.log("--------------------------------------------------------------------------");

    const adminBypass = await prisma.$queryRaw`
      WITH admin_users AS (
        SELECT email FROM "AccMemberCache" WHERE (data->>'isAccountAdmin')::boolean = true
      ),
      admin_field_actions AS (
        SELECT 
          LOWER(a."userEmail") as email, 
          a."projectId", 
          a."service", 
          a."rawAction",
          COUNT(*)::int as cnt
        FROM "AccActivity" a
        JOIN admin_users au ON LOWER(a."userEmail") = LOWER(au.email)
        WHERE a."service" IN ('issues', 'rfis', 'submittals')
        GROUP BY LOWER(a."userEmail"), a."projectId", a."service", a."rawAction"
      ),
      user_field_provisions AS (
        SELECT 
          LOWER(email) as email,
          proj->>'id' as project_id
        FROM "AccMemberCache",
        LATERAL jsonb_array_elements(data->'projects') as proj,
        LATERAL jsonb_array_elements_text(proj->'modules') as mod_name
        WHERE mod_name::text IN ('build')
      )
      SELECT 
        mc.data->>'name' as "adminName",
        afa.email,
        p.name as "projectName",
        afa.service,
        afa."rawAction",
        afa.cnt
      FROM admin_field_actions afa
      LEFT JOIN user_field_provisions ufp ON afa.email = ufp.email AND afa."projectId" = ufp.project_id
      JOIN "AccMemberCache" mc ON LOWER(mc.email) = afa.email
      JOIN "AccProject" p ON p.id = afa."projectId"
      WHERE ufp.email IS NULL
      ORDER BY afa.cnt DESC
      LIMIT 10
    `;

    if (adminBypass.length > 0) {
      console.log("Account Admins bypassing standard workflow gates by executing direct field operations:");
      adminBypass.forEach((item, idx) => {
        console.log(`  #${idx + 1}. Admin: ${item.adminName} <${item.email}>`);
        console.log(`       ⚠️ Bypass action: "${item.rawAction}" (${item.cnt} times) in field service "${item.service}"`);
        console.log(`       Project: "${item.projectName}"`);
      });
    } else {
      console.log("✅ No admin field bypass detected.");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
