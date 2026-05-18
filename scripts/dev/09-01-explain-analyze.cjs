/**
 * Phase 09 plan 09-01 — one-shot EXPLAIN ANALYZE harness for the
 * `getLastFileActivityBatch` query (RESEARCH Open Question 1 / Pitfall 2).
 *
 * Runs once locally against the dev DB; output is captured into
 * .planning/phases/09-v2.0-list-wave-gap-closure/09-01-EXPLAIN.md.
 *
 * Safe to re-run — read-only. Does NOT modify data.
 */
"use strict";

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const FILE_RAW_ACTIONS = [
  // view bucket
  "File Viewed",
  "Document Viewed",
  "File Downloaded",
  "view-entity",
  "view-existing-review",
  "download-entity",
  // upload bucket
  "File Uploaded",
  "Document Version Created",
  "upload-entity",
  // edit bucket
  "File Edited",
  "Markup Created",
  "Comment Added",
  "edit-office-file",
  "lock-entity",
  "unlock-entity",
  // delete bucket
  "File Deleted",
  "File Restored",
  "delete-entity",
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set in the environment");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }),
    log: ["error"],
  });
  try {
    const totalRows = await prisma.accActivity.count();
    console.log(`Total AccActivity rows: ${totalRows}`);

    // Pull up to 200 distinct user emails for a realistic batch.
    const distinctRows = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT "userEmail" FROM "AccActivity" WHERE "userEmail" IS NOT NULL LIMIT 200`,
    );
    const emails = distinctRows.map((r) => String(r.userEmail).toLowerCase());
    console.log(`Sampled ${emails.length} distinct emails.`);

    if (emails.length === 0) {
      console.log(
        "No emails available — table is empty or has no userEmail population. EXPLAIN ANALYZE skipped.",
      );
      return { totalRows, emails: 0, planText: null };
    }

    // Run EXPLAIN ANALYZE for the batch grouping query (Prisma's groupBy SQL shape).
    const planRows = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE
       SELECT LOWER("userEmail") AS email, MAX("createdAt") AS lastActivity
       FROM "AccActivity"
       WHERE LOWER("userEmail") = ANY($1::text[])
         AND "rawAction" = ANY($2::text[])
       GROUP BY LOWER("userEmail")`,
      emails,
      FILE_RAW_ACTIONS,
    );
    const planText = planRows.map((r) => r["QUERY PLAN"]).join("\n");
    console.log("\n--- EXPLAIN ANALYZE ---\n");
    console.log(planText);

    // Also EXPLAIN ANALYZE the sort-path query so the artifact covers BOTH procedures.
    const sortPlanRows = await prisma.$queryRawUnsafe(
      `EXPLAIN ANALYZE
       SELECT LOWER("userEmail") AS email, MAX("createdAt") AS lastActivity
       FROM "AccActivity"
       WHERE "userEmail" IS NOT NULL
         AND "rawAction" = ANY($1::text[])
       GROUP BY LOWER("userEmail")
       ORDER BY MAX("createdAt") DESC NULLS LAST, LOWER("userEmail") ASC
       LIMIT 200`,
      FILE_RAW_ACTIONS,
    );
    const sortPlanText = sortPlanRows.map((r) => r["QUERY PLAN"]).join("\n");
    console.log("\n--- EXPLAIN ANALYZE (sort path) ---\n");
    console.log(sortPlanText);

    return {
      totalRows,
      emails: emails.length,
      planText,
      sortPlanText,
    };
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((r) => {
    if (r) {
      console.log(
        `\nResult: rows=${r.totalRows} sampled=${r.emails}`,
      );
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("EXPLAIN ANALYZE harness failed:", err);
    process.exit(1);
  });
