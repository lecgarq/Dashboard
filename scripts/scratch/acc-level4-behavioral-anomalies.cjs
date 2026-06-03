#!/usr/bin/env node
/**
 * scripts/scratch/acc-level4-behavioral-anomalies.cjs
 *
 * LEVEL 4 — BEHAVIORAL & STRUCTURAL ANOMALY ENGINE
 * Goes beyond permissions into behavioral fingerprinting and cross-entity correlation.
 *
 *  21. VELOCITY SPIKE — Users whose single-day activity is 10x+ their personal daily average
 *  22. WEEKEND WARRIORS — Heavy activity on Saturday/Sunday (abnormal for construction)
 *  23. RUBBER-STAMP APPROVALS — Users approving docs they NEVER viewed (set-approval without view)
 *  24. CROSS-PROJECT FILE MOVEMENT BY EXTERNALS — Non-hermosillo users sending files between projects
 *  25. ROLE ACCUMULATION RISK — Single users assigned to an extreme number of projects (insider threat)
 *  26. COMPANY-EMAIL IDENTITY MISMATCH — Email domain doesn't match registered company name
 *  27. FOLDER TEMPLATE DRIFT — Projects missing standard top-level folders (template non-compliance)
 *  28. ACTIVITY AFTER REMOVAL — Users with activity AFTER they were removed from a project
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
    console.log("    LECG / HERMOSILLO LEVEL 4 — BEHAVIORAL & STRUCTURAL ANOMALY ENGINE    ");
    console.log("==========================================================================\n");

    // ======================================================================
    // WARNING 21: VELOCITY SPIKE
    // Users whose single-day peak is 10x+ their personal daily average
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" ⚡ [WARNING 21] VELOCITY SPIKE: SINGLE-DAY PEAK vs PERSONAL DAILY AVERAGE");
    console.log("--------------------------------------------------------------------------");

    const velocity = await prisma.$queryRaw`
      WITH daily AS (
        SELECT LOWER("userEmail") as email, DATE("createdAt") as d, COUNT(*)::int as cnt
        FROM "AccActivity"
        WHERE "userEmail" IS NOT NULL
        GROUP BY LOWER("userEmail"), DATE("createdAt")
      ),
      stats AS (
        SELECT email, AVG(cnt)::numeric as avg_daily, MAX(cnt)::int as peak_daily,
               COUNT(*)::int as active_days
        FROM daily
        GROUP BY email
        HAVING COUNT(*) >= 5 AND AVG(cnt) >= 5
      )
      SELECT s.email, ROUND(s.avg_daily, 1) as avg_daily, s.peak_daily,
             ROUND(s.peak_daily / NULLIF(s.avg_daily, 0), 1) as spike_ratio,
             s.active_days
      FROM stats s
      WHERE s.peak_daily / NULLIF(s.avg_daily, 0) >= 10
      ORDER BY spike_ratio DESC
      LIMIT 10
    `;

    if (velocity.length > 0) {
      console.log("Users with extreme single-day spikes relative to their personal baseline:");
      velocity.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}>`);
        console.log(`       Avg Daily: ${item.avg_daily} actions | Peak Day: ${item.peak_daily} actions | Spike: ${item.spike_ratio}x | Active Days: ${item.active_days}`);
      });
    } else {
      console.log("✅ No extreme velocity spikes detected.");
    }

    // ======================================================================
    // WARNING 22: WEEKEND WARRIORS
    // Heavy activity on Saturday (6) or Sunday (0) — abnormal for construction
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🗓️ [WARNING 22] WEEKEND WARRIORS: HEAVY SATURDAY/SUNDAY ACTIVITY");
    console.log("--------------------------------------------------------------------------");

    const weekendWarriors = await prisma.$queryRaw`
      SELECT LOWER("userEmail") as email,
             EXTRACT(DOW FROM "createdAt")::int as dow,
             COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "userEmail" IS NOT NULL
        AND EXTRACT(DOW FROM "createdAt") IN (0, 6)
      GROUP BY LOWER("userEmail"), EXTRACT(DOW FROM "createdAt")
      HAVING COUNT(*) >= 50
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (weekendWarriors.length > 0) {
      console.log("Users with 50+ actions on weekends (possible credential sharing or automation):");
      weekendWarriors.forEach((item, idx) => {
        const day = item.dow === 0 ? "Sunday" : "Saturday";
        console.log(`  #${idx + 1}. <${item.email}> | ${item.cnt} actions on ${day}s`);
      });
    } else {
      console.log("✅ No abnormal weekend activity detected.");
    }

    // ======================================================================
    // WARNING 23: RUBBER-STAMP APPROVALS
    // Users who set-approval-status but NEVER performed a view-entity on the
    // same project within a reasonable window — approving without reviewing
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" ✅❌ [WARNING 23] RUBBER-STAMP: APPROVALS WITHOUT PRIOR DOCUMENT VIEW");
    console.log("--------------------------------------------------------------------------");

    const rubberStamp = await prisma.$queryRaw`
      WITH approvers AS (
        SELECT LOWER("userEmail") as email, "projectId", COUNT(*)::int as approvals
        FROM "AccActivity"
        WHERE "rawAction" IN ('set-approval-status', 'review-push-approval-status')
          AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
        GROUP BY LOWER("userEmail"), "projectId"
        HAVING COUNT(*) >= 10
      ),
      viewers AS (
        SELECT DISTINCT LOWER("userEmail") as email, "projectId"
        FROM "AccActivity"
        WHERE "rawAction" IN ('view-entity', 'view-sheet', 'view-existing-review')
          AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
      )
      SELECT a.email, a."projectId", a.approvals, p.name as "projectName"
      FROM approvers a
      LEFT JOIN viewers v ON a.email = v.email AND a."projectId" = v."projectId"
      LEFT JOIN "AccProject" p ON p.id = a."projectId"
      WHERE v.email IS NULL
      ORDER BY a.approvals DESC
      LIMIT 10
    `;

    if (rubberStamp.length > 0) {
      console.log("Users approving documents they NEVER viewed in the same project:");
      rubberStamp.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> approved ${item.approvals} documents in "${item.projectName || item.projectId}"`);
        console.log(`       ⚠️ ZERO view-entity / view-sheet logs found for this user in this project`);
      });
    } else {
      console.log("✅ All approvers have corresponding document view logs.");
    }

    // ======================================================================
    // WARNING 24: CROSS-PROJECT FILE MOVEMENT BY EXTERNAL USERS
    // Non-hermosillo emails using send-entity-to-project or receive-entity
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔀 [WARNING 24] CROSS-PROJECT FILE MOVEMENT BY EXTERNAL USERS");
    console.log("--------------------------------------------------------------------------");

    const crossProject = await prisma.$queryRaw`
      SELECT LOWER("userEmail") as email, "rawAction",
             COUNT(*)::int as cnt,
             COUNT(DISTINCT "projectId")::int as projects
      FROM "AccActivity"
      WHERE "rawAction" IN ('send-entity-to-project', 'receive-entity-from-project', 'copy-file')
        AND "userEmail" IS NOT NULL
        AND LOWER("userEmail") NOT LIKE '%@hermosillo.com'
      GROUP BY LOWER("userEmail"), "rawAction"
      HAVING COUNT(*) >= 3
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (crossProject.length > 0) {
      console.log("External users moving or copying files between projects:");
      crossProject.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> | "${item.rawAction}" x${item.cnt} across ${item.projects} projects`);
      });
    } else {
      console.log("✅ No external users found moving files between projects.");
    }

    // ======================================================================
    // WARNING 25: ROLE ACCUMULATION RISK
    // Single users assigned to an extreme number of projects (insider threat surface)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🎯 [WARNING 25] ROLE ACCUMULATION: USERS ON EXTREME PROJECT COUNTS");
    console.log("--------------------------------------------------------------------------");

    const roleAccum = await prisma.$queryRaw`
      SELECT email, data->>'name' as name, data->>'company' as company,
             jsonb_array_length(data->'projects') as project_count
      FROM "AccMemberCache"
      WHERE data->'projects' IS NOT NULL
        AND jsonb_array_length(data->'projects') >= 5
      ORDER BY jsonb_array_length(data->'projects') DESC
      LIMIT 10
    `;

    if (roleAccum.length > 0) {
      console.log("Users assigned to the most projects (widest insider threat surface):");
      roleAccum.forEach((item, idx) => {
        const risk = item.project_count > 15 ? "🔴 CRITICAL" : item.project_count > 8 ? "🟡 HIGH" : "🟢 NORMAL";
        console.log(`  #${idx + 1}. ${item.name || "Unknown"} <${item.email}> | [${item.company || "N/A"}] | ${item.project_count} projects | ${risk}`);
      });
    } else {
      console.log("✅ No excessive project accumulation detected.");
    }

    // ======================================================================
    // WARNING 26: COMPANY-EMAIL IDENTITY MISMATCH
    // Users whose email domain doesn't match their registered company name
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🪪 [WARNING 26] IDENTITY MISMATCH: EMAIL DOMAIN ≠ REGISTERED COMPANY");
    console.log("--------------------------------------------------------------------------");

    const identityMismatch = await prisma.$queryRaw`
      SELECT email, data->>'name' as name, data->>'company' as company
      FROM "AccMemberCache"
      WHERE data->>'company' IS NOT NULL
        AND data->>'company' <> ''
        AND LOWER(data->>'company') = 'hermosillo'
        AND LOWER(email) NOT LIKE '%@hermosillo.com'
      LIMIT 10
    `;

    if (identityMismatch.length > 0) {
      console.log("Users registered as 'Hermosillo' company but using NON-hermosillo email:");
      identityMismatch.forEach((item, idx) => {
        console.log(`  #${idx + 1}. ${item.name} <${item.email}> | Registered Company: "${item.company}"`);
        console.log(`       ⚠️ Email domain does not match company affiliation`);
      });
    } else {
      console.log("✅ All Hermosillo-affiliated members use @hermosillo.com emails.");
    }

    // Also check reverse: hermosillo emails registered under wrong company
    const reverseMismatch = await prisma.$queryRaw`
      SELECT email, data->>'name' as name, data->>'company' as company
      FROM "AccMemberCache"
      WHERE LOWER(email) LIKE '%@hermosillo.com'
        AND data->>'company' IS NOT NULL
        AND data->>'company' <> ''
        AND LOWER(data->>'company') <> 'hermosillo'
        AND LOWER(data->>'company') NOT LIKE '%hermosillo%'
      LIMIT 10
    `;

    if (reverseMismatch.length > 0) {
      console.log("\n@hermosillo.com emails registered under a DIFFERENT company:");
      reverseMismatch.forEach((item, idx) => {
        console.log(`  #${idx + 1}. ${item.name} <${item.email}> | Registered Company: "${item.company}"`);
      });
    }

    // ======================================================================
    // WARNING 27: FOLDER TEMPLATE DRIFT
    // Projects missing standard top-level folders expected by Hermosillo's template
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 📐 [WARNING 27] TEMPLATE DRIFT: PROJECTS MISSING STANDARD TOP-LEVEL FOLDERS");
    console.log("--------------------------------------------------------------------------");

    // Standard Hermosillo top-level folders based on what we've seen
    const standardFolders = [
      "Project Files",
      "Plans",
      "Shared"
    ];

    const projects = await prisma.accProject.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      take: 50
    });

    const driftResults = [];
    for (const proj of projects) {
      const topFolders = await prisma.accFolder.findMany({
        where: { projectId: proj.id, parentId: null },
        select: { name: true }
      });
      const topNames = topFolders.map(f => f.name);
      const missing = standardFolders.filter(sf => !topNames.some(tn => tn.toLowerCase().includes(sf.toLowerCase())));
      if (missing.length > 0 && topNames.length > 0) {
        driftResults.push({ project: proj.name, topFolders: topNames, missing });
      }
    }

    if (driftResults.length > 0) {
      console.log(`Projects deviating from standard folder template (${driftResults.length} of ${projects.length} audited):`);
      driftResults.slice(0, 8).forEach((item, idx) => {
        console.log(`  #${idx + 1}. "${item.project}"`);
        console.log(`       Has: [${item.topFolders.join(", ")}]`);
        console.log(`       Missing: [${item.missing.join(", ")}]`);
      });
    } else {
      console.log("✅ All audited projects follow the standard folder template.");
    }

    // ======================================================================
    // WARNING 28: ACTIVITY AFTER REMOVAL
    // Users who have activity logs AFTER the date they were removed from a project
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🚪 [WARNING 28] POST-REMOVAL ACTIVITY: ACTIONS AFTER remove-member EVENT");
    console.log("--------------------------------------------------------------------------");

    const removals = await prisma.$queryRaw`
      SELECT LOWER("userEmail") as remover, "details" as removed_name, "createdAt" as removed_at, "projectId"
      FROM "AccActivity"
      WHERE "rawAction" = 'remove-member'
        AND "details" IS NOT NULL
        AND "projectId" IS NOT NULL AND "projectId" <> ''
      ORDER BY "createdAt" DESC
      LIMIT 20
    `;

    const postRemovalAlerts = [];
    for (const removal of removals) {
      // Try to find the removed user's email from AccMemberCache by name
      const removedUser = await prisma.$queryRaw`
        SELECT email FROM "AccMemberCache"
        WHERE LOWER(data->>'name') = LOWER(${removal.removed_name})
        LIMIT 1
      `;
      if (removedUser.length > 0) {
        const removedEmail = removedUser[0].email.toLowerCase();
        // Check if this user has ANY activity AFTER the removal date in the same project
        const postActivity = await prisma.$queryRaw`
          SELECT COUNT(*)::int as cnt
          FROM "AccActivity"
          WHERE LOWER("userEmail") = ${removedEmail}
            AND "projectId" = ${removal.projectId}
            AND "createdAt" > ${removal.removed_at}
        `;
        if (postActivity[0]?.cnt > 0) {
          const proj = await prisma.accProject.findUnique({ where: { id: removal.projectId }, select: { name: true } });
          postRemovalAlerts.push({
            removedName: removal.removed_name,
            removedEmail,
            project: proj?.name || removal.projectId,
            removedAt: removal.removed_at,
            postActions: postActivity[0].cnt
          });
        }
      }
    }

    if (postRemovalAlerts.length > 0) {
      console.log("Users with activity AFTER being removed from a project:");
      postRemovalAlerts.forEach((item, idx) => {
        const d = new Date(item.removedAt).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. ${item.removedName} <${item.removedEmail}>`);
        console.log(`       Removed on: ${d} from "${item.project}"`);
        console.log(`       ⚠️ ${item.postActions} actions recorded AFTER removal`);
      });
    } else {
      console.log("✅ No post-removal activity detected.");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
