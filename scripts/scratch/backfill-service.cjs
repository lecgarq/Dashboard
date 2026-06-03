/**
 * Backfill AccActivity.service for legacy rows where service is NULL.
 *
 * Infers the correct module/service from the rawAction pattern:
 *   - issue-*           → issues
 *   - rfi-*             → rfis
 *   - submittals-*      → submittals
 *   - view-sheet, publish-sheet → sheets
 *   - assign-member, unassign-member, assign-admin → admin
 *   - assign-permission, delete-permission → admin
 *   - File verbs (view-entity, upload-entity, etc.) → docs
 *
 * Safe to run multiple times — only touches rows where service IS NULL.
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
require("dotenv/config");

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const adapter = new PrismaPg({ connectionString: url, max: 2 });
const prisma = new PrismaClient({ adapter, log: ["error"] });

/** @type {Array<{pattern: string, service: string, type: 'prefix'|'exact'|'contains'}>} */
const RULES = [
  // Exact matches first (most specific)
  { pattern: "view-sheet", service: "sheets", type: "exact" },
  { pattern: "publish-sheet", service: "sheets", type: "exact" },
  { pattern: "assign-member", service: "admin", type: "exact" },
  { pattern: "unassign-member", service: "admin", type: "exact" },
  { pattern: "assign-admin", service: "admin", type: "exact" },
  { pattern: "assign-permission", service: "admin", type: "exact" },
  { pattern: "delete-permission", service: "admin", type: "exact" },
  { pattern: "edit-project", service: "admin", type: "exact" },

  // Prefix matches (issue-*, rfi-*, submittals-*)
  { pattern: "issue-", service: "issues", type: "prefix" },
  { pattern: "rfi-", service: "rfis", type: "prefix" },
  { pattern: "submittals-", service: "submittals", type: "prefix" },

  // Transmittals are part of docs module
  { pattern: "transmittal", service: "docs", type: "contains" },

  // Review workflow actions are docs module
  { pattern: "review", service: "docs", type: "contains" },

  // Comment/response actions
  { pattern: "comment-create", service: "docs", type: "exact" },
  { pattern: "response-create", service: "docs", type: "exact" },
  { pattern: "response-update", service: "docs", type: "exact" },

  // Public link actions
  { pattern: "create-public-link", service: "docs", type: "prefix" },
  { pattern: "delete-public-link", service: "docs", type: "exact" },

  // Collection actions
  { pattern: "create-collection", service: "docs", type: "exact" },
];

/** Known docs-module file verbs — catch-all for remaining file operations */
const DOCS_FILE_VERBS = new Set([
  "view-entity", "download-entity", "upload-entity", "create-entity",
  "delete-entity", "rename-entity", "move-entity", "copy-file",
  "lock-entity", "unlock-entity", "edit-office-file", "process-entity",
  "set-approval-status", "restore-version", "export-file", "print-entity",
  "send-entity-to-project", "add-entity-by-automation",
  "copy-review-docs-to-folder", "create-version-set",
  "view-existing-review", "view-transmittal", "view-public-link",
]);

function inferService(rawAction) {
  // Try rules in order
  for (const rule of RULES) {
    if (rule.type === "exact" && rawAction === rule.pattern) return rule.service;
    if (rule.type === "prefix" && rawAction.startsWith(rule.pattern)) return rule.service;
    if (rule.type === "contains" && rawAction.includes(rule.pattern)) return rule.service;
  }
  // Docs file verbs catch-all
  if (DOCS_FILE_VERBS.has(rawAction)) return "docs";
  return null;
}

(async () => {
  // 1. Fetch all distinct rawActions with NULL service
  const nullServiceActions = await prisma.$queryRawUnsafe(`
    SELECT "rawAction", COUNT(*)::int as cnt
    FROM "AccActivity"
    WHERE "service" IS NULL
    GROUP BY "rawAction"
    ORDER BY cnt DESC
  `);

  console.log(`Found ${nullServiceActions.length} distinct rawActions with NULL service:`);

  let totalUpdated = 0;
  let totalUnmapped = 0;
  const unmapped = [];

  for (const row of nullServiceActions) {
    const service = inferService(row.rawAction);
    if (service) {
      const result = await prisma.$queryRawUnsafe(
        `UPDATE "AccActivity" SET "service" = $1 WHERE "service" IS NULL AND "rawAction" = $2`,
        service,
        row.rawAction,
      );
      console.log(`  ✓ ${row.rawAction} (${row.cnt} rows) → ${service}`);
      totalUpdated += row.cnt;
    } else {
      console.log(`  ✗ ${row.rawAction} (${row.cnt} rows) → UNMAPPED`);
      unmapped.push(row);
      totalUnmapped += row.cnt;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total updated:  ${totalUpdated}`);
  console.log(`Total unmapped: ${totalUnmapped}`);
  if (unmapped.length > 0) {
    console.log(`\nUnmapped actions:`);
    for (const u of unmapped) console.log(`  - "${u.rawAction}" (${u.cnt} rows)`);
  }

  // Verify: count remaining NULL service rows
  const remaining = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "AccActivity" WHERE "service" IS NULL`
  );
  console.log(`\nRemaining NULL service rows: ${remaining[0].cnt}`);

  await prisma.$disconnect();
})();
