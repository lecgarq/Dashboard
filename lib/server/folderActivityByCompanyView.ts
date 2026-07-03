import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";

/**
 * Folder-scoped activity per (project, actor) — the headline aggregate for the
 * "Folder activity by company" panel (UAT-6). Same shape as `ActivityActorRow`
 * (lib/server/activityByActorView.ts) minus `projectName` (this loader is
 * consumed by a pure company-join transform, not rendered per-project), so
 * `filterRowsBySelection` (app/(dashboard)/access-analysis/projectFilter.ts)
 * works on it via `projectId` without modification.
 *
 * Two-pass design (20.1-RESEARCH.md §5 / Pitfall 3): this headline query is
 * bounded to 10,566 rows live (distinct folder-scoped (projectId, userEmail)
 * pairs) — an order of magnitude smaller than the full company x folder
 * cross-product (190,049 rows), which is NEVER computed account-wide. Per-
 * company folder detail is a separate, lazy, email-scoped drill
 * (`loadCompanyFolderBreakdown`), fired only on click.
 */
export interface FolderActivityActorRow {
  projectId: string;
  userEmail: string; // lowercased, as stored on AccActivityAccds
  userName: string; // resolved from AccDcUser; falls back to the email
  count: number;
}

interface RawPairRow {
  projectId: string;
  userEmail: string;
  count: number;
}

let cache: { at: number; rows: FolderActivityActorRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Pure assembly — exported for the sibling `.test.ts` (no DB). userName
 * resolves from AccDcUser (email -> name, matched case-insensitively),
 * falling back to the email itself.
 */
export function assembleFolderScopedActivity(
  pairs: ReadonlyArray<RawPairRow>,
  users: ReadonlyArray<{ email: string | null; name: string | null }>,
): FolderActivityActorRow[] {
  const nameByEmail = new Map<string, string>();
  for (const u of users) {
    if (u.email) nameByEmail.set(u.email.toLowerCase(), u.name ?? u.email);
  }

  return pairs.map((p) => {
    const userEmail = p.userEmail ?? "";
    return {
      projectId: p.projectId ?? "",
      userEmail,
      userName: nameByEmail.get(userEmail.toLowerCase()) ?? userEmail,
      count: p.count,
    };
  });
}

/**
 * Headline aggregate: folder-scoped activity per (project, actor) — the SAME
 * `(projectId, userEmail)` GROUP BY shape `loadActivityByActor`
 * (lib/server/activityByActorView.ts) uses, filtered to `folderId IS NOT
 * NULL` — 10,566 rows live, safely small. 5-minute in-process cache (mirrors
 * `loadActivityByActor`/`loadPermissionFootprint`). Pass `force: true` to
 * bypass the cache.
 */
export async function loadFolderScopedActivity(force = false): Promise<FolderActivityActorRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, users] = await Promise.all([
    db.$queryRaw<RawPairRow[]>`
      SELECT "projectId" AS "projectId", "userEmail" AS "userEmail", COUNT(*)::int AS count
      FROM "AccActivityAccds"
      WHERE "folderId" IS NOT NULL AND "userEmail" IS NOT NULL
        AND "projectId" IS NOT NULL AND "projectId" <> ''
      GROUP BY "projectId", "userEmail"
    `,
    db.accDcUser.findMany({ select: { email: true, name: true } }),
  ]);

  const rows = assembleFolderScopedActivity(pairs, users);
  cache = { at: Date.now(), rows };
  return rows;
}

/** One folder's activity count within a company's lazy drill. */
export interface CompanyFolderSlice {
  folderName: string;
  count: number;
}

const DRILL_TOP_N = 15;
const MAX_EMAILS = 1000;
const MAX_PROJECT_IDS = 1500;

/**
 * Collapse a folder-count list to the top `topN` folders + one aggregated
 * "Other (N folders)" row for the remainder. Pure — exported for tests.
 * Returns at most `topN + 1` rows; lossless (the "Other" row's count sums the
 * collapsed rows).
 */
export function collapseFolderSlices(
  rows: ReadonlyArray<CompanyFolderSlice>,
  topN: number = DRILL_TOP_N,
): CompanyFolderSlice[] {
  const limit = Math.max(0, topN);
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.folderName.localeCompare(b.folderName));
  const kept = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  if (rest.length === 0) return kept;
  const count = rest.reduce((sum, r) => sum + r.count, 0);
  return [...kept, { folderName: `Other (${rest.length} folders)`, count }];
}

interface RawFolderRow {
  folderName: string;
  count: number;
}

/**
 * Lazy per-company drill: folder breakdown for exactly the clicked company's
 * member emails, scoped to the caller's selected project ids — bounded by
 * construction (never the account-wide 190,049-row (project, user, folder)
 * cross product). No cache (per-click, scoped, cheap). Defensive caps: at
 * most 1,000 emails / 1,500 project ids per call; returns `[]` when either
 * input list is empty (no query issued).
 *
 * Parameterized via `Prisma.join` (never string interpolation) — mirrors
 * `folderPermissionTerrainView.ts`'s existing `Prisma.join` usage.
 */
export async function loadCompanyFolderBreakdown(
  emails: string[],
  projectIds: string[],
): Promise<CompanyFolderSlice[]> {
  if (emails.length === 0 || projectIds.length === 0) return [];

  const loweredEmails = emails.slice(0, MAX_EMAILS).map((e) => e.toLowerCase());
  const boundedProjectIds = projectIds.slice(0, MAX_PROJECT_IDS);

  const rows = await db.$queryRaw<RawFolderRow[]>`
    SELECT COALESCE(NULLIF("folderName", ''), '(unnamed folder)') AS "folderName", COUNT(*)::int AS count
    FROM "AccActivityAccds"
    WHERE "folderId" IS NOT NULL
      AND lower("userEmail") IN (${Prisma.join(loweredEmails)})
      AND "projectId" IN (${Prisma.join(boundedProjectIds)})
    GROUP BY "folderName"
    ORDER BY count DESC
  `;

  return collapseFolderSlices(rows);
}
