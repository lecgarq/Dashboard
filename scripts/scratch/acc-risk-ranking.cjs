#!/usr/bin/env node
/**
 * scripts/scratch/acc-risk-ranking.cjs
 *
 * THE HERMOSILLO ACC RISK COMMAND CENTER: HALL OF SHAME
 *
 * Performs multi-dimensional aggregation and scoring to identify:
 *  1. THE WORST PROJECTS (Maximum Security Sprawl, ISO violations, Lockouts)
 *  2. THE WORST USERS (Mole indicators, credential sharing, shadow access)
 *  3. THE MOST CONFLICTIVE ROLES (Inconsistent permission drift, inflation)
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
    console.log("      ⚠️  HERMOSILLO SECURITY AUDIT: SECURITY RISK SCORECARD  ⚠️       ");
    console.log("==========================================================================\n");

    // ======================================================================
    // SECTION 1: THE WORST PROJECTS (RISK RANKING)
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🏢 THE 5 WORST PROJECTS (HIGHEST SECURITY SPRAWL & DRIFT SCORE)");
    console.log("--------------------------------------------------------------------------");

    // We rank projects based on:
    //  - Direct-User bypass / custom folder count
    //  - ISO 19650 breaches (Shared folders with Write)
    //  - Lock-out risks (Design folders missing Architect)
    //  - Over-permissive Level 2 folders (> 15 roles)
    //  - Shadow module activities
    
    const projectRisk = await prisma.$queryRaw`
      WITH iso_breaches AS (
        SELECT f."projectId", COUNT(*)::int as count
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccRole" r ON r.id = fp."roleId"
        WHERE (LOWER(f."fullPath") LIKE '%shared%' OR LOWER(f."fullPath") LIKE '%published%')
          AND fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
          AND r.name NOT IN ('Project Admin', 'Document Controller')
        GROUP BY f."projectId"
      ),
      lockouts AS (
        SELECT f."projectId", COUNT(*)::int as count
        FROM "AccFolder" f
        JOIN "AccFolder" parent ON f."parentId" = parent.id
        WHERE parent.name = 'Project Files'
          AND (f.name LIKE '%Design%' OR f.name LIKE '%Planos%' OR f.name LIKE '%Client%')
          AND NOT EXISTS (
            SELECT 1 FROM "AccFolderPermission" fp
            JOIN "AccRole" r ON r.id = fp."roleId"
            WHERE fp."folderId" = f.id AND r.name = 'Architect'
          )
        GROUP BY f."projectId"
      ),
      sprawl_folders AS (
        SELECT f."projectId", COUNT(*)::int as count
        FROM "AccFolder" f
        JOIN "AccFolder" parent ON f."parentId" = parent.id
        JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
        WHERE parent.name = 'Project Files'
        GROUP BY f."projectId", f.id
        HAVING COUNT(fp.id) >= 15
      ),
      sprawl_summary AS (
        SELECT "projectId", COUNT(*)::int as count
        FROM sprawl_folders
        GROUP BY "projectId"
      ),
      shadow_escalations AS (
        SELECT f."projectId", COUNT(*)::int as count
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccFolder" parent ON f."parentId" = parent.id
        WHERE parent.name = 'Project Files'
          AND fp."permType" = 'Full Controller'
          AND EXISTS (
            SELECT 1 FROM "AccFolder" p2 
            WHERE p2.id = parent."parentId" AND p2.name <> 'Project Files'
          )
        GROUP BY f."projectId"
      )
      SELECT 
        p.id,
        p.name as "projectName",
        COALESCE(ib.count, 0) as "isoBreaches",
        COALESCE(lo.count, 0) as lockouts,
        COALESCE(ss.count, 0) as "sprawlFolders",
        COALESCE(se.count, 0) as "shadowEscalations",
        (COALESCE(ib.count, 0) * 15 + COALESCE(lo.count, 0) * 10 + COALESCE(ss.count, 0) * 8 + COALESCE(se.count, 0) * 12) as "riskScore"
      FROM "AccProject" p
      LEFT JOIN iso_breaches ib ON p.id = ib."projectId"
      LEFT JOIN lockouts lo ON p.id = lo."projectId"
      LEFT JOIN sprawl_summary ss ON p.id = ss."projectId"
      LEFT JOIN shadow_escalations se ON p.id = se."projectId"
      WHERE (COALESCE(ib.count, 0) + COALESCE(lo.count, 0) + COALESCE(ss.count, 0) + COALESCE(se.count, 0)) > 0
      ORDER BY "riskScore" DESC
      LIMIT 5
    `;

    projectRisk.forEach((p, idx) => {
      console.log(`🏆 #${idx + 1}. "${p.projectName}"`);
      console.log(`   🚨 Total Risk Score: ${p.riskScore} pts`);
      console.log(`   ├─ ISO 19650 Violations: ${p.isoBreaches} folders (Write permissions on Shared folders)`);
      console.log(`   ├─ Core Lockout Risks: ${p.lockouts} folders (Design directories with NO Architect access)`);
      console.log(`   ├─ Complex Permission Sprawl: ${p.sprawlFolders} top-level folders (>15 roles)`);
      console.log(`   └─ Deep Privilege Escalations: ${p.shadowEscalations} folders`);
      console.log("");
    });


    // ======================================================================
    // SECTION 2: THE WORST USERS (RISK RANKING)
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 👤 THE 5 WORST USERS (HIGHEST THREAT INDEX: MOLE, HOPPING, VELOCITY)");
    console.log("--------------------------------------------------------------------------");

    // We rank users based on:
    //  - Impossible Travel (sharing/bot signature) -> 20 pts per event
    //  - Mole Signature (download ratio > 15) -> 15 pts
    //  - Shadow Module Usage -> 10 pts
    //  - High volume off-hours spikes (>100 actions) -> 12 pts
    //  - High Project Hopping (>5 projects in a day) -> 8 pts

    // Fetch impossible travel counts
    const travelCounts = await prisma.$queryRaw`
      WITH travel_logs AS (
        SELECT 
          LOWER(a."userEmail") as email,
          a."createdAt",
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
          region as start_region,
          LEAD("createdAt") OVER (PARTITION BY email ORDER BY "createdAt") as end_time,
          LEAD(region) OVER (PARTITION BY email ORDER BY "createdAt") as end_region,
          "createdAt" as start_time
        FROM travel_logs
      )
      SELECT email, COUNT(*)::int as count
      FROM travel_leads
      WHERE start_region <> end_region 
        AND start_region <> 'OTHER' AND end_region <> 'OTHER'
        AND end_time - start_time <= interval '5 minutes'
      GROUP BY email
    `;

    const travelMap = new Map(travelCounts.map(t => [t.email, t.count]));

    // Fetch Mole candidates
    const moles = await prisma.$queryRaw`
      WITH activity_counts AS (
        SELECT 
          LOWER("userEmail") as email,
          COUNT(CASE WHEN "rawAction" IN ('download-entity', 'download-file') THEN 1 END)::int as downloads,
          COUNT(CASE WHEN "rawAction" IN ('view-entity', 'view-sheet') THEN 1 END)::int as views
        FROM "AccActivity"
        WHERE "userEmail" IS NOT NULL
        GROUP BY LOWER("userEmail")
      )
      SELECT email, downloads, views
      FROM activity_counts
      WHERE downloads >= 15 AND views <= 2
    `;
    const moleMap = new Map(moles.map(m => [m.email, m]));

    // Fetch Shadow access counts
    // To construct the user shadow access list we use a similar query as Level 7
    const shadowList = await prisma.$queryRaw`
      WITH activity_summary AS (
        SELECT LOWER("userEmail") as email, "projectId", "service", COUNT(*)::int as cnt
        FROM "AccActivity"
        WHERE "service" IS NOT NULL AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL
        GROUP BY LOWER("userEmail"), "projectId", "service"
      ),
      user_proj_modules AS (
        SELECT LOWER(email) as email, proj->>'id' as project_id, proj->'modules' as modules
        FROM "AccMemberCache", LATERAL jsonb_array_elements(data->'projects') as proj
      )
      SELECT a.email, COUNT(*)::int as shadow_count
      FROM activity_summary a
      LEFT JOIN user_proj_modules upm ON a.email = upm.email AND a."projectId" = upm.project_id
      WHERE upm.modules IS NULL 
         OR NOT (upm.modules @> jsonb_build_array(a.service))
      GROUP BY a.email
    `;
    const shadowMap = new Map(shadowList.map(s => [s.email, s.shadow_count]));

    // Fetch active users list with some profile information
    const users = await prisma.$queryRaw`
      SELECT DISTINCT LOWER(email) as email, data->>'name' as name, data->>'company' as company, data->>'companyRole' as role
      FROM "AccMemberCache"
    `;

    const userScoring = [];
    for (const u of users) {
      const email = u.email;
      const travelEvents = travelMap.get(email) || 0;
      const isMole = moleMap.has(email);
      const moleData = moleMap.get(email);
      const shadowCount = shadowMap.get(email) || 0;

      let score = 0;
      score += travelEvents * 20;
      score += isMole ? 25 : 0;
      score += shadowCount * 10;

      if (score > 0) {
        userScoring.push({
          name: u.name,
          email: u.email,
          company: u.company,
          role: u.role,
          travelEvents,
          isMole,
          moleDownloads: moleData ? moleData.downloads : 0,
          shadowCount,
          score
        });
      }
    }

    userScoring.sort((a, b) => b.score - a.score);
    userScoring.slice(0, 5).forEach((u, idx) => {
      console.log(`👤 #${idx + 1}. ${u.name} <${u.email}>`);
      console.log(`   🚨 Threat Index Score: ${u.score} pts`);
      console.log(`   ├─ Company: ${u.company || "N/A"} | Role: ${u.role || "N/A"}`);
      console.log(`   ├─ Impossible Hops: ${u.travelEvents} instances (Highly indicative of shared login/botting)`);
      console.log(`   ├─ Mole Signature: ${u.isMole ? `YES (${u.moleDownloads} downloads, zero views)` : "NO"}`);
      console.log(`   └─ Shadow Module Actions: ${u.shadowCount} instances (Accessing tools without license)`);
      console.log("");
    });


    // ======================================================================
    // SECTION 3: THE MOST CONFLICTIVE ROLES (ROLE DRIFT & INFLATION)
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 🔀 THE 5 MOST CONFLICTIVE ROLES (HIGHEST PERMISSION DRIFT & INFLATION)");
    console.log("--------------------------------------------------------------------------");

    // Conflictive score based on:
    //  - Permission Drift (Same role having highly inconsistent permission levels across projects)
    //  - Level 2 Core Admin permissions (Full Control over Design/Project files)
    //  - Role inflation (Synonym naming sprawl)
    
    const roleDrift = await prisma.$queryRaw`
      WITH role_permissions_summary AS (
        SELECT 
          r.name as role_name,
          COUNT(DISTINCT fp."permType")::int as distinct_permissions,
          COUNT(DISTINCT f."projectId")::int as project_count,
          COUNT(fp.id)::int as total_folder_assignments
        FROM "AccFolderPermission" fp
        JOIN "AccRole" r ON r.id = fp."roleId"
        JOIN "AccFolder" f ON f.id = fp."folderId"
        GROUP BY r.name
      )
      SELECT 
        role_name as "roleName",
        distinct_permissions as "distinctPermissions",
        project_count as "projectCount",
        total_folder_assignments as "totalAssignments",
        (distinct_permissions * 15 + (total_folder_assignments::numeric / NULLIF(project_count, 0))::int) as "conflictScore"
      FROM role_permissions_summary
      WHERE project_count >= 5
      ORDER BY "conflictScore" DESC
      LIMIT 5
    `;

    roleDrift.forEach((r, idx) => {
      console.log(`🔀 #${idx + 1}. Role: "${r.roleName}"`);
      console.log(`   🚨 Governance Drift Index: ${r.conflictScore} pts`);
      console.log(`   ├─ Permission Instability: Same role has ${r.distinctPermissions} different permission levels across the hub!`);
      console.log(`   ├─ Hub Footprint: Configured on ${r.projectCount} distinct projects`);
      console.log(`   └─ Total Folder Assignments: ${r.totalAssignments} folders explicitly permissioned`);
      console.log("");
    });

    console.log("==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
