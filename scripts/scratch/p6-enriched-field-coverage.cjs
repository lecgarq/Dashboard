#!/usr/bin/env node
/**
 * P6 Task 0 — Enriched-field coverage gate (READ-ONLY).
 *
 * Measures, against the SAME source tables the access-analysis graph feed consumes
 * (AccDcProjectUser as the instance set, joined to AccDcUser / roles / folder perms /
 * AccActivity exactly as lib/server/acc-hot-cache.ts + lib/acc/dcUserAssembly.ts do),
 * the real per-(user,project) coverage of the five P6 dimension fields:
 *
 *   membershipBucket      <- AccDcProjectUser.addedOn          (non-null)
 *   activityRecencyBucket <- AccActivity last-activity  OR  AccDcProjectUser.lastSignIn
 *   permissionStrength    <- MAX folder-grant tier strength via roles (>0)
 *   riskScore             <- replicated computeRiskFlags() (>0)
 *   activityMix           <- AccActivity grouped categories  (non-empty)
 *
 * Node = UserProjectInstance, id = lower(email)::projectId. Instance set is
 * AccDcProjectUser (projectId, userId). Reconciles to the ~16,942 baseline.
 *
 * SELECT/aggregate only. No INSERT/UPDATE/DELETE/DDL. Uses the `pg` driver directly
 * (NOT PrismaClient — Prisma 7.8 needs a driver adapter). Safe to run anytime.
 *
 * Usage:  node scripts/scratch/p6-enriched-field-coverage.cjs
 */
require("dotenv").config();
const pg = require("pg");

// Canonical internal-domain rule (matches internalDomains.classifyAffiliation).
// hermosillo.com = internal; everything else with a real domain = external;
// null/empty/malformed = unknown (NOT external). NOTE the legacy @lecg.com matches 0.
const INTERNAL_DOMAINS = ["hermosillo.com"];

// Thresholds copied from app/(dashboard)/users/access-analysis/riskFlags.ts.
const BROAD_FOLDER_THRESHOLD = 25;   // distinct folders
const HIGH_ACTIVITY_THRESHOLD = 100; // activityTotal
const HIGH_PERMISSION_STRENGTH = 4;  // edit=4, control=5
// signinBucket ">90d" (riskFlags "cold") = account lastSignIn NULL or > 90 days old.
const COLD_SIGNIN_DAYS = 90;

const num = (n) => (n == null ? "—" : Number(n).toLocaleString());

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const q = (sql, params) => client.query(sql, params).then((r) => r.rows);
  const one = async (sql, params) => (await q(sql, params))[0];

  try {
    console.log("=========================================================");
    console.log("  P6 ENRICHED-FIELD COVERAGE GATE (read-only)");
    console.log("=========================================================");

    // ---- 0. Instance reconciliation -------------------------------------
    // The feed builds one node per (userId, projectId) row in AccDcProjectUser
    // (dcUserAssembly: membersByUser excludes orphan users with 0 projects, but
    // AccDcProjectUser rows ARE the memberships, so the raw row count is the
    // instance universe). projectId='' admin sentinel does NOT exist in
    // AccDcProjectUser (that sentinel is an AccActivity concern) — we still guard.
    const totals = await one(`
      SELECT
        count(*)::int                                   AS rows_all,
        count(*) FILTER (WHERE "projectId" <> '')::int  AS instances,
        count(DISTINCT "userId")::int                   AS distinct_users,
        count(DISTINCT "projectId")::int                AS distinct_projects
      FROM "AccDcProjectUser"`);
    // Instances whose user has a resolvable email (node id = email::projectId).
    const withEmail = await one(`
      SELECT count(*)::int AS n
      FROM "AccDcProjectUser" pu
      JOIN "AccDcUser" u ON u.id = pu."userId"
      WHERE pu."projectId" <> '' AND u.email IS NOT NULL AND u.email <> ''`);
    const N = totals.instances;
    console.log(`\n[0] INSTANCE RECONCILIATION`);
    console.log(`  AccDcProjectUser rows (all)      = ${num(totals.rows_all)}`);
    console.log(`  instances (projectId<>'')        = ${num(N)}   <- node universe`);
    console.log(`  distinct users / projects        = ${num(totals.distinct_users)} / ${num(totals.distinct_projects)}`);
    console.log(`  instances w/ resolvable email    = ${num(withEmail.n)}`);
    console.log(`  baseline target                  = 16,942  (delta ${N - 16942})`);

    const pct = (n) => (N === 0 ? "0.0" : ((100 * n) / N).toFixed(1));

    // ---- 1. membershipBucket <- addedOn non-null ------------------------
    const member = await one(`
      SELECT count(*) FILTER (WHERE "addedOn" IS NOT NULL)::int AS n
      FROM "AccDcProjectUser" WHERE "projectId" <> ''`);
    console.log(`\n[1] membershipBucket (addedOn non-null)`);
    console.log(`  count=${num(member.n)}  pct=${pct(member.n)}%`);

    // ---- 2. activityRecencyBucket <- real last-activity OR instance signin
    // featureSnapshot: lastActivity (AccActivity, joined email::projectId) wins;
    // falls back to AccDcProjectUser.lastSignIn (instance sign-in). Bucket "none"
    // only when BOTH are null. Count instances with EITHER signal.
    const recency = await one(`
      WITH inst AS (
        SELECT pu."projectId" AS pid, lower(u.email) AS em, pu."lastSignIn" AS inst_signin
        FROM "AccDcProjectUser" pu
        JOIN "AccDcUser" u ON u.id = pu."userId"
        WHERE pu."projectId" <> ''
      ),
      act AS (
        SELECT lower("userEmail") AS em, "projectId" AS pid
        FROM "AccActivity"
        WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
        GROUP BY 1, 2
      )
      SELECT
        count(*) FILTER (WHERE inst.inst_signin IS NOT NULL OR a.em IS NOT NULL)::int AS either_n,
        count(*) FILTER (WHERE a.em IS NOT NULL)::int                                 AS act_n,
        count(*) FILTER (WHERE inst.inst_signin IS NOT NULL)::int                     AS signin_n
      FROM inst
      LEFT JOIN act a ON a.em = inst.em AND a.pid = inst.pid`);
    console.log(`\n[2] activityRecencyBucket (real activity OR instance sign-in)`);
    console.log(`  either=${num(recency.either_n)} (${pct(recency.either_n)}%)  ` +
      `activity-join=${num(recency.act_n)} (${pct(recency.act_n)}%)  ` +
      `instance-signin=${num(recency.signin_n)} (${pct(recency.signin_n)}%)`);

    // ---- 3. permissionStrength > 0 --------------------------------------
    // Replicates dcUserAssembly: MAX permTierStrength over folder grants joined
    // via the instance's raw roleIds. Only crawled projects (folderCrawlStatus
    // in ok/partial) contribute grants (matches the hot-cache where clause).
    const permStrength = await one(`
      WITH grant_strength AS (
        SELECT fp."roleId", f."projectId" AS pid,
          MAX(CASE
            WHEN lower(fp."permType") LIKE '%full%' OR lower(fp."permType") LIKE '%control%' THEN 5
            WHEN lower(fp."permType") LIKE '%edit%'     THEN 4
            WHEN lower(fp."permType") LIKE '%upload%'   THEN 3
            WHEN lower(fp."permType") LIKE '%download%' THEN 2
            ELSE 1 END) AS strength
        FROM "AccFolderPermission" fp
        JOIN "AccFolder" f ON f.id = fp."folderId"
        JOIN "AccProject" p ON p.id = f."projectId"
        WHERE p."folderCrawlStatus" IN ('ok','partial')
        GROUP BY 1, 2
      ),
      inst_strength AS (
        SELECT pur."projectId" AS pid, pur."userId" AS uid, MAX(gs.strength) AS perm_strength
        FROM "AccDcProjectUserRole" pur
        JOIN grant_strength gs ON gs."roleId" = pur."roleId" AND gs.pid = pur."projectId"
        GROUP BY 1, 2
      )
      SELECT count(*) FILTER (WHERE s.perm_strength > 0)::int AS n
      FROM "AccDcProjectUser" pu
      LEFT JOIN inst_strength s ON s.pid = pu."projectId" AND s.uid = pu."userId"
      WHERE pu."projectId" <> ''`);
    console.log(`\n[3] permissionStrength > 0`);
    console.log(`  count=${num(permStrength.n)}  pct=${pct(permStrength.n)}%`);

    // ---- 5. activityMix non-empty (compute first; feeds risk activityTotal)
    // Grouped per (email, projectId): non-empty mix == any project activity row.
    // activityTotal per instance = sum of those grouped counts.
    const mix = await one(`
      WITH act AS (
        SELECT lower("userEmail") AS em, "projectId" AS pid, count(*)::int AS total
        FROM "AccActivity"
        WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
        GROUP BY 1, 2
      )
      SELECT count(*) FILTER (WHERE a.em IS NOT NULL)::int AS n
      FROM "AccDcProjectUser" pu
      JOIN "AccDcUser" u ON u.id = pu."userId"
      LEFT JOIN act a ON a.em = lower(u.email) AND a.pid = pu."projectId"
      WHERE pu."projectId" <> ''`);
    console.log(`\n[5] activityMix non-empty`);
    console.log(`  count=${num(mix.n)}  pct=${pct(mix.n)}%`);

    // ---- 4. riskScore > 0 -----------------------------------------------
    // Replicate computeRiskFlags per instance with REAL inputs:
    //   isExternal: email has real domain not in INTERNAL_DOMAINS (unknown=false)
    //   isAdmin   : any AccDcProjectUserProduct.accessLevel='project_admin' for instance
    //   cold      : account AccDcUser.lastSignIn NULL or >90d (signinBucket '>90d')
    //   accountStatus active : AccDcUser.status='active'
    //   hasAccess : true (instance is in feed)
    //   permStrength / folderBreadth : via folder grants joined by roles (crawled)
    //   activityTotal : grouped AccActivity count for email::projectId
    // riskScore>0 == ANY of the 5 primitives true.
    const allow = INTERNAL_DOMAINS.map((d) => `'${d}'`).join(", ");
    const risk = await one(`
      WITH grants AS (
        SELECT pur."projectId" AS pid, pur."userId" AS uid,
          MAX(CASE
            WHEN lower(fp."permType") LIKE '%full%' OR lower(fp."permType") LIKE '%control%' THEN 5
            WHEN lower(fp."permType") LIKE '%edit%'     THEN 4
            WHEN lower(fp."permType") LIKE '%upload%'   THEN 3
            WHEN lower(fp."permType") LIKE '%download%' THEN 2
            ELSE 1 END)               AS perm_strength,
          count(DISTINCT fp."folderId") AS folder_breadth
        FROM "AccDcProjectUserRole" pur
        JOIN "AccFolderPermission" fp ON fp."roleId" = pur."roleId"
        JOIN "AccFolder" f ON f.id = fp."folderId" AND f."projectId" = pur."projectId"
        JOIN "AccProject" p ON p.id = f."projectId"
        WHERE p."folderCrawlStatus" IN ('ok','partial')
        GROUP BY 1, 2
      ),
      admin AS (
        SELECT DISTINCT "projectId" AS pid, "userId" AS uid
        FROM "AccDcProjectUserProduct" WHERE "accessLevel" = 'project_admin'
      ),
      act AS (
        SELECT lower("userEmail") AS em, "projectId" AS pid, count(*)::int AS total
        FROM "AccActivity"
        WHERE "sourceFile" = 'project' AND "userEmail" IS NOT NULL AND "projectId" <> ''
        GROUP BY 1, 2
      ),
      inst AS (
        SELECT
          pu."projectId" AS pid, pu."userId" AS uid,
          lower(u.email)  AS em,
          (u.email IS NOT NULL AND u.email <> '' AND position('@' in u.email) > 0
            AND split_part(u.email,'@',2) <> ''
            AND lower(split_part(u.email,'@',2)) NOT IN (${allow})) AS is_external,
          (u.status = 'active')                                     AS status_active,
          (u."lastSignIn" IS NULL
            OR u."lastSignIn" < now() - interval '${COLD_SIGNIN_DAYS} days') AS cold,
          (a.uid IS NOT NULL)                                       AS is_admin,
          COALESCE(g.perm_strength, 0)                              AS perm_strength,
          COALESCE(g.folder_breadth, 0)                             AS folder_breadth,
          COALESCE(ac.total, 0)                                     AS activity_total
        FROM "AccDcProjectUser" pu
        JOIN "AccDcUser" u ON u.id = pu."userId"
        LEFT JOIN grants g ON g.pid = pu."projectId" AND g.uid = pu."userId"
        LEFT JOIN admin  a ON a.pid = pu."projectId" AND a.uid = pu."userId"
        LEFT JOIN act    ac ON ac.em = lower(u.email) AND ac.pid = pu."projectId"
        WHERE pu."projectId" <> ''
      )
      SELECT
        count(*) FILTER (WHERE is_external AND perm_strength >= ${HIGH_PERMISSION_STRENGTH})::int AS external_high_perm,
        count(*) FILTER (WHERE cold AND status_active)::int                                       AS stale_but_active,
        count(*) FILTER (WHERE is_external AND is_admin)::int                                     AS external_admin,
        count(*) FILTER (WHERE folder_breadth >= ${BROAD_FOLDER_THRESHOLD})::int                  AS broad_folder,
        count(*) FILTER (WHERE activity_total >= ${HIGH_ACTIVITY_THRESHOLD}
                          AND perm_strength >= ${HIGH_PERMISSION_STRENGTH})::int                  AS high_act_high_perm,
        count(*) FILTER (WHERE
              (is_external AND perm_strength >= ${HIGH_PERMISSION_STRENGTH})
           OR (cold AND status_active)
           OR (is_external AND is_admin)
           OR (folder_breadth >= ${BROAD_FOLDER_THRESHOLD})
           OR (activity_total >= ${HIGH_ACTIVITY_THRESHOLD} AND perm_strength >= ${HIGH_PERMISSION_STRENGTH})
        )::int AS any_risk
      FROM inst`);
    console.log(`\n[4] riskScore > 0 (replicated computeRiskFlags; hasAccess=true)`);
    console.log(`  externalHighPerm     = ${num(risk.external_high_perm)}`);
    console.log(`  staleButActive       = ${num(risk.stale_but_active)}`);
    console.log(`  externalProjectAdmin = ${num(risk.external_admin)}`);
    console.log(`  broadFolderAccess    = ${num(risk.broad_folder)}`);
    console.log(`  highActivityHighPerm = ${num(risk.high_act_high_perm)}`);
    console.log(`  ANY (riskScore>0)    = ${num(risk.any_risk)}  pct=${pct(risk.any_risk)}%`);

    // ---- Traps ----------------------------------------------------------
    const lecg = await one(`
      SELECT count(*)::int AS n FROM "AccDcUser" WHERE lower(email) LIKE '%@lecg.com'`);
    const herm = await one(`
      SELECT count(*)::int AS n FROM "AccDcUser" WHERE lower(split_part(email,'@',2)) = 'hermosillo.com'`);
    const adminSentinel = await one(`
      SELECT count(*)::int AS n FROM "AccActivity" WHERE "projectId" = '' OR "projectId" IS NULL`);
    console.log(`\n[TRAPS]`);
    console.log(`  @lecg.com users (should be 0)        = ${num(lecg.n)}`);
    console.log(`  hermosillo.com (internal) users      = ${num(herm.n)}`);
    console.log(`  AccActivity admin-sentinel rows      = ${num(adminSentinel.n)} (excluded by projectId<>'')`);

    // ---- Machine-readable summary --------------------------------------
    console.log(`\n[SUMMARY JSON]`);
    console.log(JSON.stringify({
      instances: N,
      baseline: 16942,
      delta: N - 16942,
      withEmail: withEmail.n,
      coverage: {
        membershipBucket: { count: member.n, pct: Number(pct(member.n)) },
        activityRecency: { count: recency.either_n, pct: Number(pct(recency.either_n)) },
        permissionStrength: { count: permStrength.n, pct: Number(pct(permStrength.n)) },
        riskScore: { count: risk.any_risk, pct: Number(pct(risk.any_risk)) },
        activityMix: { count: mix.n, pct: Number(pct(mix.n)) },
      },
      riskPrimitives: risk,
      traps: { lecgUsers: lecg.n, hermosilloUsers: herm.n, activityAdminSentinel: adminSentinel.n },
    }, null, 2));
    console.log("\nDone.");
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
