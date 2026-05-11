// lib/acc/quick-sync-extraction.ts
//
// Phase 2 Quick Sync extraction. Invoked from scripts/release.cjs via
// `npx tsx lib/acc/quick-sync-extraction.ts` (CJS → TS bridge, same pattern as
// scripts/rebuild-graph.ts). Plans 02-02 / 02-03 / 02-04 build on the
// primitives defined here; 02-04 adds the top-level invocation.
//
// This file is the FIRST extraction primitive: every subsequent extractor
// (members, roles) imports types and helpers from this module. Keep additions
// here minimal and additive.

import type { PrismaClient } from "@prisma/client";
import { fetchHqUsers, fetchWithRetry } from "@/lib/server/acc-admin";
import { IntegrationError } from "@/lib/server/integration-errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawProject {
  id: string;
  name: string;
  type?: string | null;
  jobNumber?: string | null;
  accountId: string;
  createdAt?: string | null;
  status?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACC_ADMIN_V1_BASE = "https://developer.api.autodesk.com/construction/admin/v1";
const PROJECT_PAGE_SIZE = 100;
const PROJECT_FIELDS = "id,name,type,jobNumber,accountId,createdAt,status";

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Fetch every project in the given ACC account by paginating
 * /construction/admin/v1/accounts/{accountId}/projects with limit=100.
 *
 * Terminates when a page returns fewer rows than PROJECT_PAGE_SIZE
 * (short-page sentinel). This avoids reliance on `pagination.totalResults`
 * which has been observed to drift on freshly-deleted projects.
 */
export async function fetchAllProjects(
  accountId: string,
  accessToken: string,
): Promise<RawProject[]> {
  const all: RawProject[] = [];
  let offset = 0;

  while (true) {
    const url =
      `${ACC_ADMIN_V1_BASE}/accounts/${accountId}/projects` +
      `?limit=${PROJECT_PAGE_SIZE}&offset=${offset}&fields=${PROJECT_FIELDS}`;

    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new IntegrationError(
        `APS projects fetch failed: ${response.status} ${response.statusText} — ${raw}`,
        response.status,
        response.status === 401 ? "reconnect_required" : "unavailable",
        "Autodesk",
        { error: raw },
      );
    }

    const data = JSON.parse(raw) as { results?: RawProject[] };
    const results = Array.isArray(data.results) ? data.results : [];
    all.push(...results);

    if (results.length < PROJECT_PAGE_SIZE) break;
    offset += PROJECT_PAGE_SIZE;
  }

  return all;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Upserts every fresh project and soft-deletes any AccProject row that is
 * `status:"active"` in the DB but no longer present in the APS response.
 *
 * Returns the fresh project list so downstream extractors (members, roles)
 * can fan out without re-fetching.
 */
export async function extractAndPersistProjects(
  prisma: PrismaClient,
  accountId: string,
  accessToken: string,
): Promise<RawProject[]> {
  const fresh = await fetchAllProjects(accountId, accessToken);

  for (const raw of fresh) {
    const createdAt = raw.createdAt ? new Date(raw.createdAt) : null;
    const data = {
      accountId,
      name: raw.name,
      jobNumber: raw.jobNumber ?? null,
      type: raw.type ?? null,
      status: "active",
      createdAt,
    };
    await prisma.accProject.upsert({
      where: { id: raw.id },
      create: { id: raw.id, ...data },
      update: data,
    });
  }

  const freshIds = new Set<string>(fresh.map((p) => p.id));
  const staleRows = await prisma.accProject.findMany({
    where: { status: "active", id: { notIn: Array.from(freshIds) } },
    select: { id: true },
  });
  const staleIds = staleRows.map((r) => r.id);
  if (staleIds.length > 0) {
    await prisma.accProject.updateMany({
      where: { id: { in: staleIds } },
      data: { status: "inactive" },
    });
  }

  console.log(
    `[quick-sync] projects: ${fresh.length} upserted, ${staleIds.length} soft-deleted`,
  );

  return fresh;
}

// ---------------------------------------------------------------------------
// Hub roles (ROLE-01) — plan 02-02
// ---------------------------------------------------------------------------

const HQ_V2_BASE = "https://developer.api.autodesk.com/hq/v2";

/**
 * APS hub master role — source of truth for AccRole rows.
 * Returned by GET /hq/v2/accounts/:id/industry_roles (plain JSON array).
 */
export interface HubRole {
  /** APS role id — opaque string. Used as AccRole.id PK. */
  id: string;
  /** Display name (e.g. "Architect"). */
  name: string;
  /** APS-reported number of members assigned to this role hub-wide. */
  memberCount: number;
}

/**
 * Fetch and normalize the hub master industry-role list.
 *
 * Endpoint shape (HQ v2 — plain JSON array, NOT `{ pagination, results }`):
 *   GET https://developer.api.autodesk.com/hq/v2/accounts/{accountId}/industry_roles
 *   Response: [{ id, name, member_count, services?: {...} }, ...]
 *
 * Reuses `fetchHqUsers` from acc-admin — despite the legacy name, that helper is the
 * correct fetcher for any APS endpoint that returns a top-level JSON array (HQ v1
 * AND HQ v2 industry_roles). Do NOT swap to `fetchAccPaged` — HQ v2 does not return
 * `{ pagination, results }` (see RESEARCH Pitfall 6).
 *
 * Defensive: drops entries missing `id` or `name`; coerces non-numeric
 * `member_count` to 0.
 */
export async function fetchHubRoles(
  accountId: string,
  accessToken: string,
): Promise<HubRole[]> {
  const url = `${HQ_V2_BASE}/accounts/${accountId}/industry_roles`;
  const items = await fetchHqUsers(url, accessToken);
  const mapped: HubRole[] = [];
  for (const raw of items) {
    const id =
      typeof raw.id === "string"
        ? raw.id
        : raw.id != null
          ? String(raw.id)
          : "";
    const name =
      typeof raw.name === "string"
        ? raw.name
        : raw.name != null
          ? String(raw.name)
          : "";
    if (!id || !name) continue;
    const memberCount =
      typeof raw.member_count === "number" && Number.isFinite(raw.member_count)
        ? raw.member_count
        : 0;
    mapped.push({ id, name, memberCount });
  }
  return mapped;
}

/**
 * Fetch hub roles and upsert each into AccRole.
 *
 * - PK is the APS role id (opaque string).
 * - No soft-delete in this phase (deferred to v2.x CLN bucket): APS does not expose
 *   a stable "all known roles" view that is safe to diff against.
 * - Returns the role list so per-project extraction (plan 02-03) can fall back to
 *   name → id resolution when project-level industry_roles is missing entries.
 */
export async function extractAndPersistHubRoles(
  prisma: PrismaClient,
  accountId: string,
  accessToken: string,
): Promise<HubRole[]> {
  const roles = await fetchHubRoles(accountId, accessToken);
  const now = new Date();
  for (const role of roles) {
    await prisma.accRole.upsert({
      where: { id: role.id },
      create: {
        id: role.id,
        accountId,
        name: role.name,
        memberCount: role.memberCount,
        syncedAt: now,
      },
      update: {
        accountId,
        name: role.name,
        memberCount: role.memberCount,
        syncedAt: now,
      },
    });
  }
  console.log(`[quick-sync] hub roles: ${roles.length} upserted`);
  return roles;
}

