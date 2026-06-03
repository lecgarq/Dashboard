#!/usr/bin/env node
/**
 * scripts/scratch/acc-deep-anomaly-detector.cjs
 *
 * DEEP Anomaly Detection Engine — Level 2.
 * Goes far beyond surface-level spikes to uncover structural, behavioral, and
 * identity-based anomalies hidden inside the 214,080+ activity records.
 *
 * WARNING CATEGORIES:
 *   5. Ghost Users (activity from deleted/unregistered accounts)
 *   6. External Domain Leakage (non-hermosillo emails on sensitive actions)
 *   7. Public Link Exposure (users creating public share links — data exfiltration risk)
 *   8. Upload-then-Delete Pattern (data laundering / staging attacks)
 *   9. Review Process Manipulation (terminated or overridden approvals)
 *  10. Inactive Admin Accounts (admins who never log in)
 *  11. Single-File Obsession (same file viewed 50+ times by one user — screenshot harvesting)
 *  12. Permission Change Anomalies (assign-permission and delete-permission spikes)
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
    console.log("       LECG / HERMOSILLO DEEP ANOMALY DETECTION ENGINE — LEVEL 2          ");
    console.log("==========================================================================\n");

    // ======================================================================
    // WARNING 5: GHOST USERS (Activity from unregistered/deleted accounts)
    // ======================================================================
    console.log("--------------------------------------------------------------------------");
    console.log(" 👻 [WARNING 5] GHOST USERS: ACTIVITY FROM UNREGISTERED ACCOUNTS");
    console.log("--------------------------------------------------------------------------");

    const ghosts = await prisma.$queryRaw`
      SELECT a."autodeskId", COUNT(*)::int as cnt
      FROM "AccActivity" a
      LEFT JOIN "AccMemberCache" m ON a."autodeskId" = m.id
      WHERE a."userEmail" IS NULL AND m.id IS NULL
      GROUP BY a."autodeskId"
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (ghosts.length > 0) {
      console.log("Detected Activity from Autodesk IDs with NO matching member record:");
      ghosts.forEach((g, idx) => {
        console.log(`  #${idx + 1}. Ghost ID: ${g.autodeskId} | Unattributed Actions: ${g.cnt}`);
      });
      console.log("  ⚠️  These could be deleted accounts, service bots, or API integrations.");
    } else {
      console.log("✅ All activity is attributed to known registered members.");
    }

    // ======================================================================
    // WARNING 6: EXTERNAL DOMAIN LEAKAGE ON SENSITIVE ACTIONS
    // Non-@hermosillo.com emails performing uploads, deletes, or admin actions
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🌍 [WARNING 6] EXTERNAL DOMAIN LEAKAGE: NON-INTERNAL USERS ON SENSITIVE OPS");
    console.log("--------------------------------------------------------------------------");

    const externalSensitive = await prisma.$queryRaw`
      SELECT
        LOWER("userEmail") as email,
        "rawAction",
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "userEmail" IS NOT NULL
        AND LOWER("userEmail") NOT LIKE '%@hermosillo.com'
        AND "rawAction" IN (
          'delete-entity', 'delete-sheet', 'asset-delete',
          'assign-admin', 'assign-permission', 'delete-permission',
          'upload-entity', 'move-entity'
        )
      GROUP BY LOWER("userEmail"), "rawAction"
      ORDER BY cnt DESC
      LIMIT 15
    `;

    if (externalSensitive.length > 0) {
      console.log("External users performing sensitive operations (uploads, deletes, admin):");
      externalSensitive.forEach((item, idx) => {
        console.log(`  #${idx + 1}. External: <${item.email}> | Action: "${item.rawAction}" | Count: ${item.cnt}`);
      });
    } else {
      console.log("✅ No external users detected on sensitive operations.");
    }

    // ======================================================================
    // WARNING 7: PUBLIC LINK EXPOSURE (Data Exfiltration Risk)
    // Users creating shareable public links to documents or folders
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔗 [WARNING 7] DATA EXPOSURE: PUBLIC LINK CREATION (SHAREABLE URLS)");
    console.log("--------------------------------------------------------------------------");

    const publicLinks = await prisma.$queryRaw`
      SELECT
        LOWER("userEmail") as email,
        "rawAction",
        "details",
        "createdAt"
      FROM "AccActivity"
      WHERE "rawAction" IN (
        'create-public-link-for-documents',
        'create-public-link-for-folders',
        'shared-with-recipients-for-documents',
        'shared-with-recipients-for-folders'
      )
      AND "userEmail" IS NOT NULL
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    if (publicLinks.length > 0) {
      console.log(`Detected ${publicLinks.length} public link / external sharing events:`);
      publicLinks.forEach((item, idx) => {
        const d = new Date(item.createdAt).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. [${d}] <${item.email}> | Action: "${item.rawAction}"`);
        if (item.details) console.log(`        Resource: "${item.details}"`);
      });
    } else {
      console.log("✅ Zero public link creation events detected.");
    }

    // ======================================================================
    // WARNING 8: UPLOAD-THEN-DELETE PATTERN (Data Laundering)
    // Users who upload AND delete files on the SAME day — possible staging attack
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔄 [WARNING 8] DATA LAUNDERING: UPLOAD-THEN-DELETE ON SAME DAY");
    console.log("--------------------------------------------------------------------------");

    const laundering = await prisma.$queryRaw`
      WITH uploads AS (
        SELECT LOWER("userEmail") as email, DATE("createdAt") as d, COUNT(*)::int as up_cnt
        FROM "AccActivity"
        WHERE "rawAction" = 'upload-entity' AND "userEmail" IS NOT NULL
        GROUP BY LOWER("userEmail"), DATE("createdAt")
      ),
      deletes AS (
        SELECT LOWER("userEmail") as email, DATE("createdAt") as d, COUNT(*)::int as del_cnt
        FROM "AccActivity"
        WHERE "rawAction" IN ('delete-entity', 'delete-sheet') AND "userEmail" IS NOT NULL
        GROUP BY LOWER("userEmail"), DATE("createdAt")
      )
      SELECT u.email, u.d as dt, u.up_cnt, d.del_cnt
      FROM uploads u
      JOIN deletes d ON u.email = d.email AND u.d = d.d
      WHERE u.up_cnt >= 5 AND d.del_cnt >= 5
      ORDER BY (u.up_cnt + d.del_cnt) DESC
      LIMIT 10
    `;

    if (laundering.length > 0) {
      console.log("Users who uploaded AND deleted significant volumes on the same day:");
      laundering.forEach((item, idx) => {
        const d = new Date(item.dt).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. <${item.email}> on ${d} | Uploaded: ${item.up_cnt} files | Deleted: ${item.del_cnt} files`);
      });
    } else {
      console.log("✅ No upload-then-delete laundering patterns detected.");
    }

    // ======================================================================
    // WARNING 9: REVIEW PROCESS MANIPULATION
    // Users terminating reviews or overriding approval workflows
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 📋 [WARNING 9] PROCESS INTEGRITY: REVIEW TERMINATION & APPROVAL OVERRIDES");
    console.log("--------------------------------------------------------------------------");

    const reviewManip = await prisma.$queryRaw`
      SELECT
        LOWER("userEmail") as email,
        "rawAction",
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "rawAction" IN (
        'terminate-review',
        'review-back-to-initiator',
        'review-push-approval-status',
        'set-approval-status'
      )
      AND "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), "rawAction"
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (reviewManip.length > 0) {
      console.log("Users overriding or terminating document review workflows:");
      reviewManip.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> | Action: "${item.rawAction}" | Count: ${item.cnt}`);
      });
    } else {
      console.log("✅ No review manipulation events detected.");
    }

    // ======================================================================
    // WARNING 10: INACTIVE ADMIN ACCOUNTS (High-privilege but zero activity)
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔑 [WARNING 10] PRIVILEGE HYGIENE: INACTIVE ADMIN ACCOUNTS");
    console.log("--------------------------------------------------------------------------");

    const admins = await prisma.$queryRaw`
      SELECT email, data->>'name' as name
      FROM "AccMemberCache"
      WHERE (data->>'isAccountAdmin')::boolean = true
    `;

    const adminEmails = admins.map(a => a.email.toLowerCase().trim());
    const activeAdminEmails = await prisma.$queryRaw`
      SELECT DISTINCT LOWER("userEmail") as email
      FROM "AccActivity"
      WHERE LOWER("userEmail") = ANY(${adminEmails})
        AND "createdAt" >= NOW() - INTERVAL '30 days'
    `;
    const activeSet = new Set(activeAdminEmails.map(r => r.email));

    const inactiveAdmins = admins.filter(a => !activeSet.has(a.email.toLowerCase().trim()));
    console.log(`Total Account Admins Registered   : ${admins.length}`);
    console.log(`Active Admins (last 30 days)      : ${activeSet.size}`);
    console.log(`Dormant Admin Accounts            : ${inactiveAdmins.length}`);

    if (inactiveAdmins.length > 0) {
      console.log("\nInactive Admin Accounts (retain full hub privileges but zero recent activity):");
      inactiveAdmins.slice(0, 10).forEach((a, idx) => {
        console.log(`  #${idx + 1}. Admin: ${a.name || "Unknown"} <${a.email}>`);
      });
      if (inactiveAdmins.length > 10) console.log(`  ... and ${inactiveAdmins.length - 10} more.`);
    }

    // ======================================================================
    // WARNING 11: SINGLE-FILE OBSESSION (Screenshot Harvesting)
    // One user viewing the EXACT same file 50+ times
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🔍 [WARNING 11] BEHAVIORAL: SINGLE-FILE OBSESSION (REPEATED VIEWS)");
    console.log("--------------------------------------------------------------------------");

    const obsession = await prisma.$queryRaw`
      SELECT
        LOWER("userEmail") as email,
        "details",
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "rawAction" = 'view-entity'
        AND "details" IS NOT NULL
        AND "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), "details"
      HAVING COUNT(*) >= 50
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (obsession.length > 0) {
      console.log("Users repeatedly viewing the exact same file (possible screenshot harvesting):");
      obsession.forEach((item, idx) => {
        console.log(`  #${idx + 1}. <${item.email}> viewed "${item.details}" ${item.cnt} times`);
      });
    } else {
      console.log("✅ No single-file obsession patterns detected.");
    }

    // ======================================================================
    // WARNING 12: PERMISSION CHANGE VELOCITY (Rapid Role Manipulation)
    // Users who trigger many assign-permission or delete-permission events
    // ======================================================================
    console.log("\n--------------------------------------------------------------------------");
    console.log(" 🛡️ [WARNING 12] ACCESS CONTROL: PERMISSION CHANGE VELOCITY");
    console.log("--------------------------------------------------------------------------");

    const permVelocity = await prisma.$queryRaw`
      SELECT
        LOWER("userEmail") as email,
        "rawAction",
        DATE("createdAt") as dt,
        COUNT(*)::int as cnt
      FROM "AccActivity"
      WHERE "rawAction" IN ('assign-permission', 'delete-permission', 'assign-admin', 'remove-member')
        AND "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), "rawAction", DATE("createdAt")
      HAVING COUNT(*) >= 5
      ORDER BY cnt DESC
      LIMIT 10
    `;

    if (permVelocity.length > 0) {
      console.log("Users executing rapid permission changes (possible privilege escalation):");
      permVelocity.forEach((item, idx) => {
        const d = new Date(item.dt).toISOString().split('T')[0];
        console.log(`  #${idx + 1}. <${item.email}> | "${item.rawAction}" x${item.cnt} on ${d}`);
      });
    } else {
      console.log("✅ No rapid permission change velocity detected.");
    }

    console.log("\n==========================================================================\n");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
