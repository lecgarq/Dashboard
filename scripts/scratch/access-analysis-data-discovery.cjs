#!/usr/bin/env node
/**
 * Access Analysis Graph Engine — DATA-FIRST discovery script (READ-ONLY).
 *
 * Inventories the real extracted ACC/APS data behind the Access Analysis graph so
 * the dimension taxonomy + engine strategy are backed by actual values, not guesses.
 *
 * - Connects to the local/prod Postgres via Prisma + @prisma/adapter-pg (same as server/db.ts).
 * - Runs ONLY SELECT / aggregate queries. No INSERT/UPDATE/DELETE/DDL. Safe to run anytime.
 * - Prints a human summary to stdout AND writes the machine-readable inventory to
 *   docs/superpowers/research/2026-05-21-access-analysis-data-inventory.json
 *
 * Usage:  node scripts/scratch/access-analysis-data-discovery.cjs
 *
 * Node = UserProjectInstance, nodeId = userId::projectId. Authoritative user set is the
 * AccDc* Data Connector snapshot tables (AccProjectMember live table is typically empty).
 *
 * NOTE: the activity categorizer below is a SNAPSHOT COPY of the MAP/fallback in
 * lib/acc/activityCategories.ts (kept inline so this scratch script is self-contained).
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

// Configurable internal-domain allowlist (proposed canonical rule).
const INTERNAL_DOMAINS = ["hermosillo.com"];
// Domain the CURRENT featureSnapshot.ts code treats as internal (legacy / suspected defect).
const CURRENT_CODE_INTERNAL_DOMAIN = "lecg.com";

const OUT_JSON = path.join(
  process.cwd(),
  "docs",
  "superpowers",
  "research",
  "2026-05-21-access-analysis-data-inventory.json",
);

// ---------------------------------------------------------------------------
// Activity categorizer (snapshot of lib/acc/activityCategories.ts — see header)
// ---------------------------------------------------------------------------
const CAT_MAP = {
  "File Viewed": "view", "Document Viewed": "view", "File Downloaded": "view",
  "view-entity": "view", "view-existing-review": "view", "download-entity": "view",
  "view-sheet": "view", "view-transmittal": "view", "view-public-link": "view",
  "print-entity": "view", "export-file": "view", "File Uploaded": "upload",
  "Document Version Created": "upload", "upload-entity": "upload", "create-entity": "upload",
  "create-version-set": "upload", "copy-file": "upload", "send-entity-to-project": "upload",
  "add-entity-by-automation": "upload", "copy-review-docs-to-folder": "upload", "publish-sheet": "upload",
  "File Edited": "edit", "Markup Created": "edit", "Comment Added": "edit",
  "edit-office-file": "edit", "lock-entity": "edit", "unlock-entity": "edit",
  "set-approval-status": "edit", "rename-entity": "edit", "move-entity": "edit",
  "restore-version": "edit", "create-public-link": "edit", "delete-public-link": "edit",
  "create-public-link-for-documents": "edit", "create-public-link-for-folders": "edit",
  "process-entity": "edit", "File Deleted": "delete", "File Restored": "delete",
  "delete-entity": "delete", "Member Added": "memberEvent", "User Invited": "memberEvent",
  "Project Member Added": "memberEvent", "assign-member": "memberEvent", "unassign-member": "memberEvent",
  "assign-admin": "memberEvent", "Project Created": "projectEvent", "Project Updated": "projectEvent",
  "assign-permission": "projectEvent", "delete-permission": "projectEvent",
  "asset-create": "upload", "asset-update": "edit", "asset-delete": "delete",
  "export-sheet": "view", "print-sheet": "view", "delete-sheet": "delete",
  "renumber-sheet": "edit", "change-discipline-order": "edit", "review-export-files": "view",
  "create-bridge": "upload", "delete-bridge": "delete", "delete-bridge-automation": "delete",
  "view-in-autocad-web": "view", "delete-entity-by-automation": "delete",
  "receive-entity-from-project": "upload", "restore-entity": "edit",
  "shared-with-recipients-for-documents": "edit", "shared-with-recipients-for-folders": "edit",
  "remove-member": "memberEvent", "remove-admin": "memberEvent", "enable-collection": "edit",
  "shared-with-recipients-for-sheets": "edit", "update-version-set": "edit",
};

function fallbackCategory(rawAction) {
  const a = (rawAction || "").toLowerCase();
  if (a.startsWith("issue-") || a.startsWith("rfi-") || a.startsWith("submittals-")) return "projectEvent";
  if (a.includes("permission") || a === "assign-role" || a === "unassign-role") return "projectEvent";
  if (a.includes("member") || a.includes("invite")) return "memberEvent";
  if (a.startsWith("view-") || a.startsWith("download-") || a.startsWith("print-") || a.startsWith("export-")) return "view";
  if (a.startsWith("upload-") || a.startsWith("copy-") || a.startsWith("publish-")) return "upload";
  if (a.startsWith("create-") || a.startsWith("edit-") || a.startsWith("rename-") || a.startsWith("move-") || a.startsWith("process-") || a.includes("approval") || a.includes("link")) return "edit";
  if (a.startsWith("delete-") || a.startsWith("remove-")) return "delete";
  if (a.startsWith("review-") || a.includes("review") || a.includes("transmittal") || a.includes("comment") || a.startsWith("response-") || a.includes("notify-")) return "projectEvent";
  return "other";
}
function categorize(rawAction) {
  return CAT_MAP[rawAction] || fallbackCategory(rawAction);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Recursively coerce BigInt -> Number (pg COUNT returns BigInt). */
function jsonSafe(value) {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");

  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const inventory = {
    generatedAt: new Date().toISOString(),
    nodeModel: "UserProjectInstance (nodeId = userId::projectId)",
    internalDomainsProposed: INTERNAL_DOMAINS,
    currentCodeInternalDomain: CURRENT_CODE_INTERNAL_DOMAIN,
    families: {},
  };

  /** Run a labelled query; capture errors into the inventory instead of aborting. */
  async function safe(family, key, sql) {
    try {
      const rows = await prisma.$queryRawUnsafe(sql);
      const safeRows = jsonSafe(rows);
      inventory.families[family] = inventory.families[family] || {};
      inventory.families[family][key] = safeRows;
      return safeRows;
    } catch (err) {
      inventory.families[family] = inventory.families[family] || {};
      inventory.families[family][key] = { error: String(err && err.message ? err.message : err) };
      console.warn(`  ! ${family}.${key} failed: ${err && err.message ? err.message : err}`);
      return null;
    }
  }

  const line = (s = "") => console.log(s);
  const num = (n) => (n == null ? "—" : Number(n).toLocaleString());

  try {
    line("=========================================================");
    line("  ACCESS ANALYSIS — DATA DISCOVERY (read-only)");
    line("=========================================================");

    // ---- A. ACTIVITIES ----------------------------------------------------
    line("\n[A] ACTIVITIES (AccActivity)");
    const actTotals = await safe("activities", "totals", `
      SELECT count(*) AS rows,
             count(DISTINCT "autodeskId") AS distinct_actors,
             count(DISTINCT NULLIF("projectId", '')) AS distinct_projects,
             min("createdAt") AS first_event,
             max("createdAt") AS last_event
      FROM "AccActivity"`);
    if (actTotals && actTotals[0]) {
      const t = actTotals[0];
      line(`  rows=${num(t.rows)} actors=${num(t.distinct_actors)} projects=${num(t.distinct_projects)}`);
      line(`  range: ${t.first_event || "—"} -> ${t.last_event || "—"}`);
    }
    await safe("activities", "by_service", `
      SELECT COALESCE("service", '(null)') AS service, count(*) AS events,
             count(DISTINCT "autodeskId") AS actors, count(DISTINCT NULLIF("projectId",'')) AS projects
      FROM "AccActivity" GROUP BY 1 ORDER BY 2 DESC`);
    await safe("activities", "by_source_file", `
      SELECT "sourceFile", count(*) AS events FROM "AccActivity" GROUP BY 1 ORDER BY 2 DESC`);
    const byAction = await safe("activities", "by_raw_action", `
      SELECT "rawAction", count(*) AS events,
             count(DISTINCT "autodeskId") AS actors,
             count(DISTINCT NULLIF("projectId",'')) AS projects,
             min("createdAt") AS first_event, max("createdAt") AS last_event
      FROM "AccActivity" GROUP BY 1 ORDER BY 2 DESC`);
    if (Array.isArray(byAction)) {
      // Roll raw actions up to normalized category (via inline categorizer).
      const catRoll = {};
      for (const r of byAction) {
        const cat = categorize(r.rawAction);
        catRoll[cat] = catRoll[cat] || { category: cat, events: 0, distinctActions: 0 };
        catRoll[cat].events += Number(r.events);
        catRoll[cat].distinctActions += 1;
      }
      inventory.families.activities.by_normalized_category = Object.values(catRoll)
        .sort((a, b) => b.events - a.events);
      line(`  distinct raw actions=${num(byAction.length)} -> ${Object.keys(catRoll).length} normalized categories`);
    }
    await safe("activities", "unresolved_attribution", `
      SELECT "reason", count(*) AS rows FROM "UnresolvedAttribution" GROUP BY 1 ORDER BY 2 DESC`);

    // ---- B. PRODUCTS / MODULES -------------------------------------------
    line("\n[B] PRODUCTS / MODULES (AccDcProjectUserProduct)");
    const prod = await safe("products", "by_product", `
      SELECT "productKey", count(*) AS rows,
             count(DISTINCT "userId") AS users, count(DISTINCT "projectId") AS projects,
             sum(CASE WHEN "accessLevel" = 'project_admin' THEN 1 ELSE 0 END) AS admin_rows,
             sum(CASE WHEN "accessLevel" = 'project_user' THEN 1 ELSE 0 END) AS user_rows
      FROM "AccDcProjectUserProduct" GROUP BY 1 ORDER BY 2 DESC`);
    if (Array.isArray(prod)) prod.forEach((p) =>
      line(`  ${String(p.productKey).padEnd(22)} rows=${num(p.rows)} users=${num(p.users)} projects=${num(p.projects)} admin=${num(p.admin_rows)}`));
    await safe("products", "project_product_totals", `
      SELECT count(*) AS rows, count(DISTINCT "productKey") AS distinct_products,
             count(DISTINCT "projectId") AS projects
      FROM "AccDcProjectProduct"`);

    // ---- C. ROLES ---------------------------------------------------------
    line("\n[C] ROLES (AccDcProjectUserRole + AccRole)");
    await safe("roles", "by_role", `
      SELECT COALESCE(r.name, '(unmapped roleId)') AS role_name, ur."roleId",
             count(*) AS assignments,
             count(DISTINCT ur."userId") AS users, count(DISTINCT ur."projectId") AS projects
      FROM "AccDcProjectUserRole" ur
      LEFT JOIN "AccRole" r ON r.id = ur."roleId"
      GROUP BY 1, 2 ORDER BY 3 DESC`);
    await safe("roles", "roles_per_node_distribution", `
      SELECT roles_per_node, count(*) AS nodes FROM (
        SELECT "projectId", "userId", count(*) AS roles_per_node
        FROM "AccDcProjectUserRole" GROUP BY 1, 2
      ) t GROUP BY 1 ORDER BY 1`);
    await safe("roles", "project_role_access_levels", `
      SELECT
        sum(CASE WHEN "docsAccessLevel" IS NULL THEN 1 ELSE 0 END) AS docs_null,
        sum(CASE WHEN "docsAccessLevel" = 'admin' THEN 1 ELSE 0 END) AS docs_admin,
        sum(CASE WHEN "docsAccessLevel" = 'user' THEN 1 ELSE 0 END) AS docs_user,
        sum(CASE WHEN "projectAdminAccessLevel" IS NOT NULL THEN 1 ELSE 0 END) AS project_admin_set,
        count(*) AS total
      FROM "AccProjectRole"`);

    // ---- D. COMPANIES / FIRMS --------------------------------------------
    line("\n[D] COMPANIES / FIRMS (AccDcProjectUserCompany + AccDcCompany)");
    await safe("companies", "totals", `
      SELECT count(DISTINCT c.id) AS distinct_companies,
             count(DISTINCT uc."userId") AS users_with_company,
             count(*) AS instance_company_rows
      FROM "AccDcProjectUserCompany" uc LEFT JOIN "AccDcCompany" c ON c.id = uc."companyId"`);
    await safe("companies", "top_by_users", `
      SELECT COALESCE(c.name, '(unmapped companyId)') AS company,
             count(DISTINCT uc."userId") AS users,
             count(DISTINCT uc."projectId") AS projects,
             count(*) AS instances
      FROM "AccDcProjectUserCompany" uc LEFT JOIN "AccDcCompany" c ON c.id = uc."companyId"
      GROUP BY 1 ORDER BY 2 DESC LIMIT 40`);

    // ---- E. INTERNAL vs EXTERNAL -----------------------------------------
    line("\n[E] INTERNAL vs EXTERNAL (AccDcUser.email)");
    await safe("internal_external", "by_domain", `
      SELECT COALESCE(NULLIF(lower(split_part(email, '@', 2)), ''), '(no domain)') AS domain,
             count(*) AS users
      FROM "AccDcUser" GROUP BY 1 ORDER BY 2 DESC LIMIT 60`);
    const allow = INTERNAL_DOMAINS.map((d) => `'${d.toLowerCase()}'`).join(", ");
    await safe("internal_external", "current_code_rule_lecg", `
      SELECT
        sum(CASE WHEN lower(email) LIKE '%@${CURRENT_CODE_INTERNAL_DOMAIN}' THEN 1 ELSE 0 END) AS internal,
        sum(CASE WHEN lower(email) LIKE '%@${CURRENT_CODE_INTERNAL_DOMAIN}' THEN 0 ELSE 1 END) AS external_incl_null,
        count(*) AS total
      FROM "AccDcUser"`);
    await safe("internal_external", "proposed_rule_allowlist", `
      SELECT
        sum(CASE WHEN lower(split_part(email,'@',2)) IN (${allow}) THEN 1 ELSE 0 END) AS internal,
        sum(CASE WHEN (email IS NULL OR email = '' OR position('@' in email) = 0
                       OR split_part(email,'@',2) = '') THEN 1 ELSE 0 END) AS unknown,
        sum(CASE WHEN email IS NOT NULL AND email <> '' AND position('@' in email) > 0
                  AND split_part(email,'@',2) <> ''
                  AND lower(split_part(email,'@',2)) NOT IN (${allow}) THEN 1 ELSE 0 END) AS external,
        count(*) AS total
      FROM "AccDcUser"`);
    // Users whose label flips between the two rules (the impactful ones).
    await safe("internal_external", "classification_changes", `
      SELECT
        sum(CASE WHEN lower(split_part(email,'@',2)) IN (${allow})
                  AND lower(email) NOT LIKE '%@${CURRENT_CODE_INTERNAL_DOMAIN}'
                 THEN 1 ELSE 0 END) AS now_internal_was_external,
        sum(CASE WHEN lower(email) LIKE '%@${CURRENT_CODE_INTERNAL_DOMAIN}'
                  AND lower(split_part(email,'@',2)) NOT IN (${allow})
                 THEN 1 ELSE 0 END) AS was_internal_now_external,
        sum(CASE WHEN (email IS NULL OR email = '' OR position('@' in email) = 0)
                 THEN 1 ELSE 0 END) AS was_external_now_unknown
      FROM "AccDcUser"`);
    // High-permission users (proxy: project_admin product access) affected by the flip to internal.
    await safe("internal_external", "high_priv_now_internal", `
      SELECT count(DISTINCT u.id) AS users
      FROM "AccDcUser" u
      JOIN "AccDcProjectUserProduct" p ON p."userId" = u.id AND p."accessLevel" = 'project_admin'
      WHERE lower(split_part(u.email,'@',2)) IN (${allow})`);
    await safe("internal_external", "external_users_with_admin_access", `
      SELECT count(DISTINCT u.id) AS users
      FROM "AccDcUser" u
      JOIN "AccDcProjectUserProduct" p ON p."userId" = u.id AND p."accessLevel" = 'project_admin'
      WHERE email IS NOT NULL AND email <> '' AND position('@' in email) > 0
        AND lower(split_part(u.email,'@',2)) NOT IN (${allow})`);

    // ---- F. FOLDER PERMISSIONS -------------------------------------------
    line("\n[F] FOLDER PERMISSIONS (AccFolderPermission)");
    const perm = await safe("folder_permissions", "by_perm_type", `
      SELECT "permType", count(*) AS rows,
             count(DISTINCT "folderId") AS folders, count(DISTINCT "roleId") AS roles
      FROM "AccFolderPermission" GROUP BY 1 ORDER BY 2 DESC`);
    if (Array.isArray(perm)) perm.forEach((p) =>
      line(`  ${String(p.permType).padEnd(28)} rows=${num(p.rows)} folders=${num(p.folders)} roles=${num(p.roles)}`));
    await safe("folder_permissions", "crawl_status", `
      SELECT "folderCrawlStatus", count(*) AS projects FROM "AccProject" GROUP BY 1 ORDER BY 2 DESC`);
    await safe("folder_permissions", "folders_and_projects", `
      SELECT count(*) AS folders, count(DISTINCT "projectId") AS projects FROM "AccFolder"`);
    // Roles that hold Full Controller (high-risk reach proxy).
    await safe("folder_permissions", "full_controller_roles", `
      SELECT count(DISTINCT "roleId") AS roles, count(*) AS rows
      FROM "AccFolderPermission" WHERE "permType" = 'Full Controller'`);

    // ---- G. TEMPORAL ------------------------------------------------------
    line("\n[G] TEMPORAL fields");
    await safe("temporal", "dc_user_last_sign_in", `
      SELECT count(*) AS total,
             sum(CASE WHEN "lastSignIn" IS NULL THEN 1 ELSE 0 END) AS null_count,
             min("lastSignIn") AS earliest, max("lastSignIn") AS latest
      FROM "AccDcUser"`);
    await safe("temporal", "dc_projectuser_dates", `
      SELECT count(*) AS total,
             sum(CASE WHEN "lastSignIn" IS NULL THEN 1 ELSE 0 END) AS lastsignin_null,
             sum(CASE WHEN "addedOn" IS NULL THEN 1 ELSE 0 END) AS addedon_null,
             min("addedOn") AS earliest_added, max("addedOn") AS latest_added
      FROM "AccDcProjectUser"`);
    await safe("temporal", "signin_recency_buckets", `
      SELECT bucket, count(*) AS users FROM (
        SELECT CASE
          WHEN "lastSignIn" IS NULL THEN 'never/unknown'
          WHEN "lastSignIn" >= now() - interval '7 days'  THEN '0-7d'
          WHEN "lastSignIn" >= now() - interval '14 days' THEN '8-14d'
          WHEN "lastSignIn" >= now() - interval '30 days' THEN '15-30d'
          WHEN "lastSignIn" >= now() - interval '60 days' THEN '31-60d'
          ELSE '60d+'
        END AS bucket
        FROM "AccDcUser"
      ) t GROUP BY 1 ORDER BY 1`);
    await safe("temporal", "activity_monthly", `
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, count(*) AS events
      FROM "AccActivity" GROUP BY 1 ORDER BY 1`);

    // ---- H. USER-PROJECT-INSTANCE COVERAGE -------------------------------
    line("\n[H] USER-PROJECT-INSTANCE COVERAGE");
    const nodeTotals = await safe("coverage", "node_totals", `
      SELECT count(*) AS instances,
             count(DISTINCT "userId") AS distinct_users,
             count(DISTINCT "projectId") AS distinct_projects
      FROM "AccDcProjectUser"`);
    if (nodeTotals && nodeTotals[0]) {
      const t = nodeTotals[0];
      line(`  instances(nodes)=${num(t.instances)} users=${num(t.distinct_users)} projects=${num(t.distinct_projects)}`);
    }
    await safe("coverage", "instances_with_roles", `
      SELECT count(*) AS instances_with_roles FROM (
        SELECT DISTINCT "projectId", "userId" FROM "AccDcProjectUserRole") t`);
    await safe("coverage", "instances_with_products", `
      SELECT count(*) AS instances_with_products FROM (
        SELECT DISTINCT "projectId", "userId" FROM "AccDcProjectUserProduct") t`);
    await safe("coverage", "instances_with_company", `
      SELECT count(*) AS instances_with_company FROM (
        SELECT DISTINCT "projectId", "userId" FROM "AccDcProjectUserCompany") t`);
    await safe("coverage", "instances_with_signin", `
      SELECT sum(CASE WHEN "lastSignIn" IS NOT NULL THEN 1 ELSE 0 END) AS instances_with_signin
      FROM "AccDcProjectUser"`);
    await safe("coverage", "multi_project_users", `
      SELECT count(*) AS multi_project_users FROM (
        SELECT "userId" FROM "AccDcProjectUser" GROUP BY 1 HAVING count(DISTINCT "projectId") > 1) t`);
    await safe("coverage", "multi_company_users", `
      SELECT count(*) AS multi_company_users FROM (
        SELECT "userId" FROM "AccDcProjectUserCompany" GROUP BY 1 HAVING count(DISTINCT "companyId") > 1) t`);
    await safe("coverage", "users_with_activity_via_autodeskid", `
      SELECT count(DISTINCT u.id) AS users_with_activity
      FROM "AccDcUser" u
      WHERE u."autodeskId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "AccActivity" a WHERE a."autodeskId" = u."autodeskId")`);

    // ---- WRITE JSON -------------------------------------------------------
    fs.writeFileSync(OUT_JSON, JSON.stringify(jsonSafe(inventory), null, 2), "utf8");
    line(`\nWrote inventory JSON -> ${path.relative(process.cwd(), OUT_JSON)}`);
    line("Done.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
