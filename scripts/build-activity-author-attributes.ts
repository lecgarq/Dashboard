/**
 * build-activity-author-attributes.ts — v2.7 Phase 38 (ACT-02 + EMB-07 input).
 *
 * 1. Exports the author-attribute sidecar (.embedding/activity-author-attributes.json):
 *    one row per (emailLower, projectId) with role (mergeRoleNames-backed bulk-user
 *    path), company, provisioned modules — the join source for
 *    scripts/compute_activity_embeddings.py.
 * 2. Measures the ACT-02 author-coverage rates of the UNIFIED activity corpus
 *    (accds full + AccActivity rows before the per-project accds boundary or with
 *    no project — mergeActivitySources semantics) and writes
 *    .embedding/activity-author-coverage.json.
 *
 * Read-only against the DB; writes only under .embedding/ (gitignored).
 */
import fs from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import path, { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCachedAccDcBulkUsers } from "../lib/server/acc-hot-cache";
import { countUnifiedActivityRows } from "../lib/server/unifiedActivitySource";
import { buildGraphNodesFromUsers } from "../app/(dashboard)/users/access-analysis/graphNodesFromUsers";
import {
  buildAuthorAttributeMap,
  mergeMembershipsByEmailProject,
} from "../lib/server/activityAuthorAttributes";
import { roleBucketLabel } from "../lib/acc/roleCounts";
import { accessBucketLabel } from "../lib/acc/accessBucket";

function loadEnvFile(file: string) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function createPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] }) as unknown as PrismaClient;
}

interface EmailProjectCount {
  e: string;
  p: string | null;
  c: bigint | number;
}

async function main(): Promise<void> {
  const db = createPrisma();
  try {
    // --- 1. Sidecar ---------------------------------------------------------
    const users = await getCachedAccDcBulkUsers(db as never, {
      includePermissionSummary: true,
      includeActivityMix: true,
    });
    const { features } = buildGraphNodesFromUsers(users);
    const rows = buildAuthorAttributeMap(features);

    // Membership buckets ride the SAME AccDcProjectUser view the /access-analysis
    // donuts read, so "Removed member", "Multiple roles" and the access split mean
    // exactly one thing across both surfaces. Attaching them here (not in the
    // payload builder) keeps the DB join in one place: the builder then works from
    // the sidecar alone.
    // Imported lazily: lib/server/accessInstanceView pulls server/db, which builds
    // its Prisma client at MODULE load — i.e. before this file's loadEnvFile() has
    // run — so a static import here fails with "DATABASE_URL must be set".
    const { loadInstanceView } = await import("../lib/server/accessInstanceView");
    const memberships = mergeMembershipsByEmailProject(
      (await loadInstanceView(true)).map((v) => ({
        email: v.email,
        projectId: v.projectId,
        roles: v.roles,
        status: v.status,
        modules: v.modules,
        adminModules: v.adminModules,
      })),
    );
    let bucketed = 0;
    for (const row of rows) {
      const m = memberships.get(`${row.emailLower}::${row.projectId}`);
      if (!m) continue;
      row.roleBucket = roleBucketLabel(m);
      row.accessBucket = accessBucketLabel(m);
      bucketed += 1;
    }
    console.log(
      `membership buckets: ${bucketed}/${rows.length} sidecar rows matched ` +
        `(${memberships.size} distinct email+project memberships)`,
    );

    const outDir = join(process.cwd(), ".embedding");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "activity-author-attributes.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), rows }),
      "utf8",
    );
    console.log(`sidecar: ${rows.length} (email, project) attribute rows`);

    // --- 2. Coverage (unified-corpus semantics) -----------------------------
    const total = await countUnifiedActivityRows(db as never, {});
    const nullEmail = await countUnifiedActivityRows(db as never, { userEmailNull: true });

    // Per-(email, project) event counts across both sources, applying the
    // mergeActivitySources boundary to AccActivity rows: kept when the project
    // has no accds coverage, no project id, or createdAt precedes the accds start.
    const accdsCounts = await db.$queryRawUnsafe<EmailProjectCount[]>(`
      SELECT LOWER("userEmail") AS e, "projectId" AS p, COUNT(*)::bigint AS c
      FROM "AccActivityAccds" WHERE "userEmail" IS NOT NULL
      GROUP BY 1, 2
    `);
    const dcCounts = await db.$queryRawUnsafe<EmailProjectCount[]>(`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s FROM "AccActivityAccds" GROUP BY "projectId"
      )
      SELECT LOWER(d."userEmail") AS e, d."projectId" AS p, COUNT(*)::bigint AS c
      FROM "AccActivity" d
      LEFT JOIN astart a ON a."projectId" = d."projectId"
      WHERE d."userEmail" IS NOT NULL
        AND (d."projectId" IS NULL OR d."projectId" = '' OR a.s IS NULL OR d."createdAt" < a.s)
      GROUP BY 1, 2
    `);

    const pairKeys = new Set(rows.map((r) => `${r.emailLower}::${r.projectId}`));
    const emailKeys = new Set(rows.map((r) => r.emailLower));
    let matchedPair = 0;
    let matchedEmailOnly = 0;
    let unmatchedEmail = 0;
    for (const { e, p, c } of [...accdsCounts, ...dcCounts]) {
      const n = Number(c);
      if (p && pairKeys.has(`${e}::${p}`)) matchedPair += n;
      else if (emailKeys.has(e)) matchedEmailOnly += n;
      else unmatchedEmail += n;
    }
    const withEmail = matchedPair + matchedEmailOnly + unmatchedEmail;
    if (withEmail + nullEmail !== total) {
      console.warn(
        `[coverage] reconciliation drift: withEmail(${withEmail}) + nullEmail(${nullEmail}) != total(${total})`,
      );
    }
    const coverage = {
      measuredAt: new Date().toISOString(),
      total,
      nullEmail,
      matchedPair,
      matchedEmailOnly,
      unmatchedEmail,
      resolvedPairRate: matchedPair / total,
      resolvedEmailRate: (matchedPair + matchedEmailOnly) / total,
      unknownAuthorRate: (nullEmail + unmatchedEmail) / total,
    };
    writeFileSync(
      join(outDir, "activity-author-coverage.json"),
      JSON.stringify(coverage, null, 2),
      "utf8",
    );
    console.log(
      `coverage: total=${total} nullEmail=${nullEmail} matchedPair=${matchedPair} ` +
        `matchedEmailOnly=${matchedEmailOnly} unmatchedEmail=${unmatchedEmail} ` +
        `resolvedEmailRate=${(coverage.resolvedEmailRate * 100).toFixed(2)}% ` +
        `unknownAuthorRate=${(coverage.unknownAuthorRate * 100).toFixed(2)}%`,
    );
  } finally {
    await db.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
