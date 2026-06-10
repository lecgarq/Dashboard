/**
 * deepFindings.ts — curated "level 4-8" anomaly findings for the compliance panel.
 *
 * These were originally one-off `scripts/scratch/acc-levelN-*.cjs` console scripts.
 * This module ports a curated top-10 set into the live dashboard: each finding is a
 * thin `fetchX(db)` (the script's SQL, verbatim) plus a PURE `mapX(rows)` that shapes
 * rows into the shared `ComplianceViolation` type. Pure mappers are unit-tested in
 * deepFindings.test.ts; the raw SQL is not (matches governanceCompliance.ts).
 *
 * `analyzeDeepFindings` runs every fetcher with per-finding isolation (Promise.allSettled),
 * so one failing query degrades to "that finding is empty" rather than blanking the panel.
 *
 * Source map: 1 level8#51, 2 level8#52, 3 level4#28, 4 level8#53, 5 level4#21,
 *             6 level4#26, 7 level5#30, 8 level6#44, 9 level7#45, 10 level5#29.
 */
import type { ComplianceSummary, ComplianceViolation } from "./governanceCompliance";

// The Prisma client surface we use. `any` mirrors governanceCompliance.ts and avoids
// coupling to the generated client type in a file that only issues raw SQL.
type Db = any;

const num = (v: unknown): number => {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

// ---------------------------------------------------------------------------
// 1. External users with elevated folder permissions  (level8 #51)  CRITICAL
// ---------------------------------------------------------------------------
function fetchExternalElevated(db: Db) {
  return db.$queryRaw`
    WITH external_members AS (
      SELECT LOWER(email) as email, data->>'name' as name, data->>'company' as company,
             proj->>'id' as project_id, proj->'roles' as roles
      FROM "AccMemberCache", LATERAL jsonb_array_elements(data->'projects') as proj
      WHERE LOWER(email) NOT LIKE '%@hermosillo.com' AND LOWER(email) NOT LIKE '%@lecg.mx'
    ),
    elevated_perms AS (
      SELECT fp."roleId", r.name as role_name, f."projectId", f.name as folder_name,
             f."fullPath", fp."permType"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccRole" r ON r.id = fp."roleId"
      WHERE fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
    )
    SELECT DISTINCT em.name, em.email, em.company, p.name as "projectName",
           ep.role_name as "roleAssigned", ep.folder_name as "folderName",
           ep."fullPath", ep."permType"
    FROM external_members em
    JOIN elevated_perms ep ON em.project_id = ep."projectId"
      AND em.roles @> jsonb_build_array(ep.role_name)
    JOIN "AccProject" p ON p.id = em.project_id
    ORDER BY em.email, p.name
    LIMIT 10`;
}
export function mapExternalElevated(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-external-elevated-${i}`,
    ruleId: "deep-external-elevated",
    severity: "critical",
    title: "External User With Elevated Permissions",
    description: `External user ${str(r.name) || str(r.email)}${r.company ? ` [${str(r.company)}]` : ""} holds "${str(r.permType)}" via role "${str(r.roleAssigned)}" on "${str(r.folderName)}".`,
    recommendation: "Revoke External Access",
    subjectLabel: str(r.fullPath) || str(r.folderName),
    userEmail: str(r.email),
    userName: str(r.name) || null,
    projectName: str(r.projectName) || null,
    timestamp: null,
    details: { permType: str(r.permType), role: str(r.roleAssigned) },
  }));
}

// ---------------------------------------------------------------------------
// 2. Data hoarding "mole"  (level8 #52)  CRITICAL
// ---------------------------------------------------------------------------
function fetchDataHoarding(db: Db) {
  return db.$queryRaw`
    WITH activity_counts AS (
      SELECT LOWER("userEmail") as email, "projectId",
        COUNT(CASE WHEN "rawAction" IN ('download-entity','download-file','download-version') THEN 1 END)::int as downloads,
        COUNT(CASE WHEN "rawAction" IN ('view-entity','view-sheet','view-version') THEN 1 END)::int as views
      FROM "AccActivity" WHERE "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), "projectId"
    )
    SELECT ac.email, p.name as "projectName", ac.downloads, ac.views,
           ROUND(ac.downloads::numeric / NULLIF(ac.views, 0), 1) as download_view_ratio
    FROM activity_counts ac
    JOIN "AccProject" p ON p.id = ac."projectId"
    WHERE ac.downloads >= 15 AND ac.views <= 2
    ORDER BY ac.downloads DESC
    LIMIT 10`;
}
export function mapDataHoarding(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-data-hoarding-${i}`,
    ruleId: "deep-data-hoarding",
    severity: "critical",
    title: "Data Hoarding Signature",
    description: `${str(r.email)} downloaded ${num(r.downloads)} files with only ${num(r.views)} views in "${str(r.projectName)}".`,
    recommendation: "Review Download Activity",
    userEmail: str(r.email),
    projectName: str(r.projectName) || null,
    timestamp: null,
    details: { downloads: num(r.downloads), views: num(r.views), ratio: str(r.download_view_ratio) },
  }));
}

// ---------------------------------------------------------------------------
// 3. Activity after removal  (level4 #28)  CRITICAL  (multi-step fetch)
// ---------------------------------------------------------------------------
async function fetchPostRemoval(db: Db) {
  const removals = await db.$queryRaw`
    SELECT LOWER("userEmail") as remover, "details" as removed_name,
           "createdAt" as removed_at, "projectId"
    FROM "AccActivity"
    WHERE "rawAction" = 'remove-member' AND "details" IS NOT NULL
      AND "projectId" IS NOT NULL AND "projectId" <> ''
    ORDER BY "createdAt" DESC
    LIMIT 20`;
  const out: any[] = [];
  for (const removal of removals as any[]) {
    const removedUser = await db.$queryRaw`
      SELECT email FROM "AccMemberCache"
      WHERE LOWER(data->>'name') = LOWER(${removal.removed_name}) LIMIT 1`;
    if (!removedUser?.length) continue;
    const removedEmail = String(removedUser[0].email).toLowerCase();
    const postActivity = await db.$queryRaw`
      SELECT COUNT(*)::int as cnt FROM "AccActivity"
      WHERE LOWER("userEmail") = ${removedEmail} AND "projectId" = ${removal.projectId}
        AND "createdAt" > ${removal.removed_at}`;
    const cnt = num(postActivity?.[0]?.cnt);
    if (cnt > 0) {
      const proj = await db.accProject.findUnique({
        where: { id: removal.projectId }, select: { name: true },
      });
      out.push({
        removedName: removal.removed_name, removedEmail,
        project: proj?.name || removal.projectId,
        removedAt: removal.removed_at, postActions: cnt,
      });
    }
  }
  return out;
}
function mapPostRemoval(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-post-removal-${i}`,
    ruleId: "deep-post-removal",
    severity: "critical",
    title: "Activity After Removal",
    description: `${str(r.removedName)} logged ${num(r.postActions)} actions AFTER being removed from "${str(r.project)}".`,
    recommendation: "Investigate Account Access",
    userEmail: str(r.removedEmail),
    userName: str(r.removedName) || null,
    projectName: str(r.project) || null,
    timestamp: r.removedAt ? new Date(r.removedAt).toISOString() : null,
    details: { postActions: num(r.postActions) },
  }));
}

// ---------------------------------------------------------------------------
// 4. ISO 19650 breach on Shared/Published folders  (level8 #53)  WARNING
// ---------------------------------------------------------------------------
function fetchIsoBreach(db: Db) {
  return db.$queryRaw`
    SELECT f.name as "folderName", f."fullPath", p.name as "projectName",
           r.name as "roleName", fp."permType"
    FROM "AccFolderPermission" fp
    JOIN "AccFolder" f ON f.id = fp."folderId"
    JOIN "AccRole" r ON r.id = fp."roleId"
    JOIN "AccProject" p ON p.id = f."projectId"
    WHERE (LOWER(f."fullPath") LIKE '%shared%' OR LOWER(f."fullPath") LIKE '%published%'
        OR LOWER(f."fullPath") LIKE '%compartido%' OR LOWER(f."fullPath") LIKE '%publicado%')
      AND fp."permType" IN ('View+Download+Upload+Edit', 'Full Controller')
      AND r.name NOT IN ('Project Admin', 'Document Controller', 'Dirección', 'Director General')
    ORDER BY p.name, f."fullPath"
    LIMIT 10`;
}
function mapIsoBreach(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-iso-breach-${i}`,
    ruleId: "deep-iso-breach",
    severity: "warning",
    title: "ISO 19650 Workflow Breach",
    description: `Role "${str(r.roleName)}" holds "${str(r.permType)}" on Shared/Published folder "${str(r.folderName)}".`,
    recommendation: "Restrict To Read-Only",
    subjectLabel: str(r.fullPath) || str(r.folderName),
    projectName: str(r.projectName) || null,
    timestamp: null,
    details: { permType: str(r.permType), role: str(r.roleName) },
  }));
}

// ---------------------------------------------------------------------------
// 5. Velocity spike  (level4 #21)  WARNING
// ---------------------------------------------------------------------------
function fetchVelocitySpike(db: Db) {
  return db.$queryRaw`
    WITH daily AS (
      SELECT LOWER("userEmail") as email, DATE("createdAt") as d, COUNT(*)::int as cnt
      FROM "AccActivity" WHERE "userEmail" IS NOT NULL
      GROUP BY LOWER("userEmail"), DATE("createdAt")
    ),
    stats AS (
      SELECT email, AVG(cnt)::numeric as avg_daily, MAX(cnt)::int as peak_daily,
             COUNT(*)::int as active_days
      FROM daily GROUP BY email HAVING COUNT(*) >= 5 AND AVG(cnt) >= 5
    )
    SELECT s.email, ROUND(s.avg_daily, 1) as avg_daily, s.peak_daily,
           ROUND(s.peak_daily / NULLIF(s.avg_daily, 0), 1) as spike_ratio, s.active_days
    FROM stats s
    WHERE s.peak_daily / NULLIF(s.avg_daily, 0) >= 10
    ORDER BY spike_ratio DESC
    LIMIT 10`;
}
function mapVelocitySpike(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-velocity-spike-${i}`,
    ruleId: "deep-velocity-spike",
    severity: "warning",
    title: "Activity Velocity Spike",
    description: `${str(r.email)} hit ${num(r.peak_daily)} actions in a single day vs a ${str(r.avg_daily)} daily average (${str(r.spike_ratio)}x spike).`,
    recommendation: "Verify Account Behavior",
    userEmail: str(r.email),
    timestamp: null,
    details: { peakDaily: num(r.peak_daily), avgDaily: str(r.avg_daily), spikeRatio: str(r.spike_ratio) },
  }));
}

// ---------------------------------------------------------------------------
// 6. Email/company identity mismatch  (level4 #26)  WARNING  (forward + reverse)
// ---------------------------------------------------------------------------
async function fetchIdentityMismatch(db: Db) {
  const forward = await db.$queryRaw`
    SELECT email, data->>'name' as name, data->>'company' as company
    FROM "AccMemberCache"
    WHERE data->>'company' IS NOT NULL AND data->>'company' <> ''
      AND LOWER(data->>'company') = 'hermosillo'
      AND LOWER(email) NOT LIKE '%@hermosillo.com'
    LIMIT 10`;
  const reverse = await db.$queryRaw`
    SELECT email, data->>'name' as name, data->>'company' as company
    FROM "AccMemberCache"
    WHERE LOWER(email) LIKE '%@hermosillo.com'
      AND data->>'company' IS NOT NULL AND data->>'company' <> ''
      AND LOWER(data->>'company') <> 'hermosillo' AND LOWER(data->>'company') NOT LIKE '%hermosillo%'
    LIMIT 10`;
  return [
    ...(forward as any[]).map((r) => ({ ...r, kind: "external-email" })),
    ...(reverse as any[]).map((r) => ({ ...r, kind: "wrong-company" })),
  ];
}
export function mapIdentityMismatch(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-identity-mismatch-${i}`,
    ruleId: "deep-identity-mismatch",
    severity: "warning",
    title: "Identity / Company Mismatch",
    description:
      r.kind === "wrong-company"
        ? `${str(r.name) || str(r.email)} uses an @hermosillo.com email but is registered under company "${str(r.company)}".`
        : `${str(r.name) || str(r.email)} is registered as company "${str(r.company)}" but uses a non-Hermosillo email.`,
    recommendation: "Verify User Identity",
    userEmail: str(r.email),
    userName: str(r.name) || null,
    timestamp: null,
    details: { company: str(r.company), kind: str(r.kind) },
  }));
}

// ---------------------------------------------------------------------------
// 7. Role-permission drift  (level5 #30)  WARNING
// ---------------------------------------------------------------------------
function fetchRoleDrift(db: Db) {
  return db.$queryRaw`
    SELECT r.name as "roleName", COUNT(DISTINCT fp."permType")::int as "uniquePermTypes",
           COUNT(DISTINCT f."projectId")::int as "projectCount",
           ARRAY_AGG(DISTINCT fp."permType") as "permVariants"
    FROM "AccFolderPermission" fp
    JOIN "AccFolder" f ON f.id = fp."folderId"
    JOIN "AccRole" r ON r.id = fp."roleId"
    GROUP BY r.name HAVING COUNT(DISTINCT fp."permType") >= 3
    ORDER BY COUNT(DISTINCT fp."permType") DESC
    LIMIT 10`;
}
export function mapRoleDrift(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => {
    const variants: string[] = Array.isArray(r.permVariants) ? r.permVariants.map(str) : [];
    return {
      id: `deep-role-drift-${i}`,
      ruleId: "deep-role-drift",
      severity: "warning",
      title: "Role-Permission Drift",
      description: `Role "${str(r.roleName)}" has ${num(r.uniquePermTypes)} different permission levels across ${num(r.projectCount)} projects: [${variants.join(", ")}].`,
      recommendation: "Standardize Role Permissions",
      subjectLabel: str(r.roleName),
      timestamp: null,
      details: { permVariants: variants, projectCount: num(r.projectCount) },
    };
  });
}

// ---------------------------------------------------------------------------
// 8. Sensitive folders in generic paths  (level6 #44)  INFO
// ---------------------------------------------------------------------------
function fetchSensitivePaths(db: Db) {
  return db.$queryRaw`
    SELECT f.name, f."fullPath", p.name as "projectName", fp."permType", r.name as "roleName"
    FROM "AccFolder" f
    JOIN "AccProject" p ON p.id = f."projectId"
    JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
    JOIN "AccRole" r ON r.id = fp."roleId"
    WHERE (LOWER(f.name) LIKE '%salario%' OR LOWER(f.name) LIKE '%sueldo%'
        OR LOWER(f.name) LIKE '%nomina%' OR LOWER(f.name) LIKE '%payroll%'
        OR LOWER(f.name) LIKE '%bonus%' OR LOWER(f.name) LIKE '%confidencial%'
        OR LOWER(f.name) LIKE '%password%' OR LOWER(f.name) LIKE '%credential%'
        OR LOWER(f.name) LIKE '%fianza%' OR LOWER(f.name) LIKE '%garantia%'
        OR LOWER(f.name) LIKE '%poliza%' OR LOWER(f.name) LIKE '%seguro %'
        OR LOWER(f.name) LIKE '%estimacion%' OR LOWER(f.name) LIKE '%anticipo%'
        OR LOWER(f.name) LIKE '%penalizacion%' OR LOWER(f.name) LIKE '%deductiva%')
      AND fp."permType" NOT IN ('No Access')
    ORDER BY f.name
    LIMIT 15`;
}
function mapSensitivePaths(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? []).map((r, i) => ({
    id: `deep-sensitive-path-${i}`,
    ruleId: "deep-sensitive-path",
    severity: "info",
    title: "Sensitive Folder Exposure",
    description: `Sensitive folder "${str(r.name)}" grants "${str(r.permType)}" to role "${str(r.roleName)}".`,
    recommendation: "Restrict Sensitive Folder",
    subjectLabel: str(r.fullPath) || str(r.name),
    projectName: str(r.projectName) || null,
    timestamp: null,
    details: { permType: str(r.permType), role: str(r.roleName) },
  }));
}

// ---------------------------------------------------------------------------
// 9. Shadow module usage  (level7 #45)  INFO  (SQL + semantic validator)
// ---------------------------------------------------------------------------
function fetchShadowModules(db: Db) {
  return db.$queryRaw`
    WITH activity_summary AS (
      SELECT LOWER("userEmail") as email, "projectId", "service", COUNT(*)::int as action_count
      FROM "AccActivity"
      WHERE "service" IS NOT NULL AND "userEmail" IS NOT NULL AND "projectId" IS NOT NULL
        AND "projectId" <> '' AND "service" IN ('issues','rfis','submittals','sheets','docs')
      GROUP BY LOWER("userEmail"), "projectId", "service"
    ),
    user_proj_modules AS (
      SELECT LOWER(email) as email, proj->>'id' as project_id,
             proj->>'name' as project_name, proj->'modules' as modules
      FROM "AccMemberCache", LATERAL jsonb_array_elements(data->'projects') as proj
    )
    SELECT a.email, a."projectId", upm.project_name as "projectName",
           a.service, a.action_count, upm.modules
    FROM activity_summary a
    LEFT JOIN user_proj_modules upm ON a.email = upm.email AND a."projectId" = upm.project_id`;
}
function isServiceAuthorized(service: string, modules: unknown): boolean {
  if (!Array.isArray(modules)) return false;
  const mods = modules.map((m) => String(m).toLowerCase());
  if (service === "docs") return mods.includes("docs");
  if (service === "issues")
    return mods.includes("docs") || mods.includes("build") || mods.includes("designcollaboration") || mods.includes("modelcoordination");
  if (["rfis", "submittals", "sheets"].includes(service)) return mods.includes("build");
  return false;
}
export function mapShadowModules(rows: readonly any[]): ComplianceViolation[] {
  return (rows ?? [])
    .filter((r) => !isServiceAuthorized(str(r.service), r.modules))
    .sort((a, b) => num(b.action_count) - num(a.action_count))
    .slice(0, 10)
    .map((r, i) => ({
      id: `deep-shadow-module-${i}`,
      ruleId: "deep-shadow-module",
      severity: "info",
      title: "Shadow Module Usage",
      description: `${str(r.email)} performed ${num(r.action_count)} "${str(r.service)}" actions in "${str(r.projectName) || str(r.projectId)}" without that module provisioned.`,
      recommendation: "Review Module Provisioning",
      userEmail: str(r.email),
      projectName: str(r.projectName) || null,
      timestamp: null,
      details: { service: str(r.service), actionCount: num(r.action_count) },
    }));
}

// ---------------------------------------------------------------------------
// 10. Role synonym duplication  (level5 #29)  INFO  (SQL + accent-strip grouping)
// ---------------------------------------------------------------------------
function fetchRoleSynonyms(db: Db) {
  return db.$queryRaw`SELECT id, name, "memberCount" FROM "AccRole" ORDER BY name`;
}
function normalizeRoleName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}
export function mapRoleSynonyms(rows: readonly any[]): ComplianceViolation[] {
  const groups = new Map<string, any[]>();
  for (const role of rows ?? []) {
    const key = normalizeRoleName(str(role.name));
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(role);
  }
  return [...groups.entries()]
    .filter(([, roles]) => roles.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([key, roles], i) => {
      const variants = roles.map((r) => `"${str(r.name)}" (${num(r.memberCount)} mbrs)`).join(" | ");
      return {
        id: `deep-role-synonym-${i}`,
        ruleId: "deep-role-synonym",
        severity: "info",
        title: "Role Synonym Duplication",
        description: `${roles.length} spellings of the same role: ${variants}.`,
        recommendation: "Consolidate Duplicate Roles",
        subjectLabel: roles.map((r) => str(r.name)).join(" / "),
        timestamp: null,
        details: { normalizedKey: key, variantCount: roles.length },
      };
    });
}

// ---------------------------------------------------------------------------
// Orchestration + merge
// ---------------------------------------------------------------------------

/** Run all curated deep findings with per-finding isolation. */
export async function analyzeDeepFindings(db: Db): Promise<ComplianceViolation[]> {
  const tasks: Array<() => Promise<ComplianceViolation[]>> = [
    () => fetchExternalElevated(db).then(mapExternalElevated),
    () => fetchDataHoarding(db).then(mapDataHoarding),
    () => fetchPostRemoval(db).then(mapPostRemoval),
    () => fetchIsoBreach(db).then(mapIsoBreach),
    () => fetchVelocitySpike(db).then(mapVelocitySpike),
    () => fetchIdentityMismatch(db).then(mapIdentityMismatch),
    () => fetchRoleDrift(db).then(mapRoleDrift),
    () => fetchSensitivePaths(db).then(mapSensitivePaths),
    () => fetchShadowModules(db).then(mapShadowModules),
    () => fetchRoleSynonyms(db).then(mapRoleSynonyms),
  ];
  const settled = await Promise.allSettled(tasks.map((t) => t()));
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}

const SEVERITY_PENALTY = { critical: 15, warning: 5, info: 1 } as const;

/** Pure merge of base governance summary + deep findings, recomputing score/metrics. */
export function combineComplianceFindings(
  base: ComplianceSummary,
  deep: readonly ComplianceViolation[],
): ComplianceSummary {
  const violations = [...base.violations, ...deep];
  let score = 100;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const v of violations) {
    score -= SEVERITY_PENALTY[v.severity];
    if (v.severity === "critical") criticalCount++;
    else if (v.severity === "warning") warningCount++;
    else infoCount++;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    violations,
    metrics: {
      criticalCount,
      warningCount,
      infoCount,
      auditedUsersCount: base.metrics.auditedUsersCount,
    },
  };
}
