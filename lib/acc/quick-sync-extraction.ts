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

import type { PrismaClient, Prisma } from "@prisma/client";
import pLimit from "p-limit";
import { fetchHqUsers, fetchWithRetry } from "@/lib/server/acc-admin";
import { IntegrationError } from "@/lib/server/integration-errors";
import { getAccountId } from "@/lib/server/acc-helpers";
import { get2LeggedAutodeskToken } from "@/lib/server/aps-user-token";
import type { BulkAccUser, BulkAccProject } from "./acc-types";

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
      `?limit=${PROJECT_PAGE_SIZE}&offset=${offset}`;

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

// ---------------------------------------------------------------------------
// Per-project members + per-project roles (MEM-01..05, ROLE-02, ROLE-03)
// plan 02-03
// ---------------------------------------------------------------------------

/** APS product access tier. */
export type ProductTier = "administrator" | "member" | "none";

/**
 * Fields hard-coded into the per-project /users request. `lastSignIn` MUST appear
 * literally in this string — when `?fields=` is dropped, APS silently omits
 * lastSignIn from the response (Pitfall 1). Tests grep this constant.
 */
const MEMBER_FIELDS =
  "name,email,status,companyName,phone,addedOn,lastSignIn,accessLevels,products,roles,autodeskId";
const MEMBER_PAGE_SIZE = 100;

/**
 * APS product-key aliases. The HQ v2 and Admin v1 endpoints disagree on
 * casing/naming for some product keys. Normalize to the short canonical form
 * used by the rest of the dashboard.
 *
 * Per RESEARCH.md Open Question 3.
 */
const PRODUCT_ALIASES: Record<string, string> = {
  documentManagement: "docs",
  fieldManagement: "build",
  costManagement: "cost",
};

/**
 * Walk the APS `products` array (shape: `[{ key, access }]`) and produce a
 * flat `Record<canonicalKey, ProductTier>`. Drops entries missing either
 * field. Returns `{}` for nullish input.
 */
export function normalizeProducts(
  raw: Array<{ key?: string; access?: string }> | null | undefined,
): Record<string, ProductTier> {
  const result: Record<string, ProductTier> = {};
  if (!raw || !Array.isArray(raw)) return result;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rawKey = typeof entry.key === "string" ? entry.key : null;
    const rawAccess = typeof entry.access === "string" ? entry.access : null;
    if (!rawKey || !rawAccess) continue;
    const key = PRODUCT_ALIASES[rawKey] ?? rawKey;
    result[key] = rawAccess as ProductTier;
  }
  return result;
}

/**
 * Raw shape returned by `GET /construction/admin/v1/projects/:id/users`.
 * `phone` is an object on the wire (`{ number, countryCode? }`) — flattened
 * to a string by the persistence step.
 */
export interface RawMember {
  autodeskId: string;
  name: string;
  email: string;
  status: string;
  companyName?: string | null;
  phone?: { number?: string | null } | string | null;
  addedOn?: string | null;
  lastSignIn?: string | null;
  accessLevels?: { projectAdmin?: boolean; executive?: boolean };
  products?: Array<{ key?: string; access?: string }> | null;
  roles?: Array<{ id?: string; name: string }>;
}

/**
 * Fetch every member of a project, paginated. Returns the raw list plus a
 * `lastSignInPresent` boolean indicating whether the first member of the
 * first page even had the `lastSignIn` *key* (regardless of value). When this
 * is false, the caller logs a loud warning — it almost always means the
 * `?fields=` query parameter was stripped en route to APS (Pitfall 1).
 */
export async function fetchProjectMembers(
  projectId: string,
  accessToken: string,
): Promise<{ members: RawMember[]; lastSignInPresent: boolean }> {
  const all: RawMember[] = [];
  let offset = 0;
  let lastSignInPresent = true; // vacuously true if no members at all

  while (true) {
    const url =
      `${ACC_ADMIN_V1_BASE}/projects/${projectId}/users` +
      `?limit=${MEMBER_PAGE_SIZE}&offset=${offset}&fields=${MEMBER_FIELDS}`;

    const response = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new IntegrationError(
        `APS project members fetch failed (project ${projectId}): ${response.status} ${response.statusText} — ${raw}`,
        response.status,
        response.status === 401 ? "reconnect_required" : "unavailable",
        "Autodesk",
        { error: raw },
      );
    }

    const data = JSON.parse(raw) as { results?: RawMember[] };
    const results = Array.isArray(data.results) ? data.results : [];

    if (offset === 0 && results.length > 0) {
      // Key-presence check (NOT value check): catches dropped ?fields=.
      lastSignInPresent = Object.prototype.hasOwnProperty.call(
        results[0] as object,
        "lastSignIn",
      );
    }

    all.push(...results);
    if (results.length < MEMBER_PAGE_SIZE) break;
    offset += MEMBER_PAGE_SIZE;
  }

  return { members: all, lastSignInPresent };
}

/**
 * APS per-project industry role with default access levels resolved.
 * Mirrors AccProjectRole columns (without member linkage).
 */
export interface ProjectRole {
  id: string;
  name: string;
  docsAccessLevel: string | null;
  projectAdminAccessLevel: string | null;
}

/**
 * Fetch the per-project industry-role list from
 * `GET /hq/v2/accounts/:id/projects/:pid/industry_roles` (plain JSON array).
 *
 * Handles both snake_case (`document_management`) and camelCase
 * (`documentManagement`) service keys — APS has been observed returning both
 * shapes (RESEARCH.md Open Question 4).
 *
 * Drops malformed entries lacking `id` or `name`.
 */
export async function fetchProjectRoles(
  accountId: string,
  projectId: string,
  accessToken: string,
): Promise<ProjectRole[]> {
  const url = `${HQ_V2_BASE}/accounts/${accountId}/projects/${projectId}/industry_roles`;
  const items = await fetchHqUsers(url, accessToken);
  const mapped: ProjectRole[] = [];
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
    const services =
      (raw.services as
        | {
            document_management?: { access_level?: string };
            documentManagement?: { access_level?: string };
            project_administration?: { access_level?: string };
            projectAdministration?: { access_level?: string };
          }
        | undefined) ?? undefined;
    const docsAccessLevel =
      services?.document_management?.access_level ??
      services?.documentManagement?.access_level ??
      null;
    const projectAdminAccessLevel =
      services?.project_administration?.access_level ??
      services?.projectAdministration?.access_level ??
      null;
    mapped.push({ id, name, docsAccessLevel, projectAdminAccessLevel });
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// Aggregator + per-project fan-out
// ---------------------------------------------------------------------------

/**
 * One per-project occurrence of a member, accumulated across all projects.
 * Plan 02-04 reads `MemberAggregator` at the end of the run and assembles
 * the `accMemberCache` JSON blob from it.
 */
export interface MemberAggregatorPerProject {
  projectId: string;
  projectName: string;
  status: string;
  projectAdmin: boolean;
  executive: boolean;
  products: Record<string, ProductTier>;
  roleNames: string[];
  addedOn: string | null;
  lastSignIn: string | null;
  companyName: string | null;
  phone: string | null;
}

export interface MemberAggregatorEntry {
  email: string; // lowercased
  autodeskId: string;
  name: string;
  perProject: MemberAggregatorPerProject[];
}

/** Key = lowercased email. */
export type MemberAggregator = Map<string, MemberAggregatorEntry>;

/**
 * Per-project extraction: fetch industry roles → upsert AccRole rows + default
 * AccProjectRole "unassigned" rows → fetch members → upsert AccProjectMember +
 * resolve member.roles[] names to role IDs via the per-project name map.
 *
 * APPENDS each member occurrence to `aggregator`. Does NOT return anything —
 * the caller threads the same aggregator through every project so plan 02-04
 * can read the union at the end.
 *
 * Throws on per-project failures so `runPerProjectFanOut` can catch + log them
 * (skip-and-continue, RESEARCH Decision 1).
 */
export async function extractAndPersistProjectData(
  prisma: PrismaClient,
  accountId: string,
  project: { id: string; name: string },
  accessToken: string,
  aggregator: MemberAggregator,
): Promise<void> {
  // ---- Step A: roles first (so member.roles[] names resolve to IDs) ----
  const projectRoles = await fetchProjectRoles(accountId, project.id, accessToken);

  const now = new Date();

  // A.1: upsert any AccRole rows we haven't seen at hub level.
  for (const role of projectRoles) {
    await prisma.accRole.upsert({
      where: { id: role.id },
      create: {
        id: role.id,
        accountId,
        name: role.name,
        memberCount: 0,
        syncedAt: now,
      },
      update: { name: role.name, syncedAt: now },
    });
  }

  // A.2: lowercased name → role map for cross-casing matches.
  const roleNameToId = new Map<string, ProjectRole>(
    projectRoles.map((r) => [r.name.toLowerCase(), r]),
  );

  // A.3: persist default access levels even when no member is linked yet.
  //
  // Prisma's generated `projectId_roleId_memberId` compound where rejects a
  // null in `memberId` because compound-unique keys require all components to
  // be non-null at the query level. Use findFirst + create/update fallback.
  for (const role of projectRoles) {
    const existing = await prisma.accProjectRole.findFirst({
      where: {
        projectId: project.id,
        roleId: role.id,
        memberId: null,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.accProjectRole.update({
        where: { id: existing.id },
        data: {
          docsAccessLevel: role.docsAccessLevel,
          projectAdminAccessLevel: role.projectAdminAccessLevel,
        },
      });
    } else {
      await prisma.accProjectRole.create({
        data: {
          projectId: project.id,
          roleId: role.id,
          memberId: null,
          docsAccessLevel: role.docsAccessLevel,
          projectAdminAccessLevel: role.projectAdminAccessLevel,
        },
      });
    }
  }

  // ---- Step B: members ----
  const { members, lastSignInPresent } = await fetchProjectMembers(
    project.id,
    accessToken,
  );
  if (!lastSignInPresent && members.length > 0) {
    console.warn(
      `[quick-sync] project ${project.id}: lastSignIn field absent from response — ?fields= may have been dropped`,
    );
  }

  // ---- Step C: per-member upsert + role link + aggregator append ----
  for (const raw of members) {
    if (!raw || typeof raw !== "object") continue;
    if (!raw.autodeskId || !raw.email) {
      console.warn(
        `[quick-sync] project ${project.id}: skipping member with missing autodeskId/email`,
      );
      continue;
    }

    const email = raw.email.toLowerCase();
    const autodeskId = raw.autodeskId;
    const name = raw.name ?? email;
    const status = raw.status ?? "active";
    const companyName = raw.companyName ?? null;
    const phone =
      typeof raw.phone === "string"
        ? raw.phone
        : raw.phone && typeof raw.phone === "object"
          ? (raw.phone.number ?? null)
          : null;
    const addedOn = raw.addedOn ? new Date(raw.addedOn) : null;
    const lastSignIn = raw.lastSignIn ? new Date(raw.lastSignIn) : null;
    const projectAdmin = raw.accessLevels?.projectAdmin ?? false;
    const executive = raw.accessLevels?.executive ?? false;
    const products = normalizeProducts(raw.products);

    const saved = await prisma.accProjectMember.upsert({
      where: {
        projectId_autodeskId: { projectId: project.id, autodeskId },
      },
      create: {
        projectId: project.id,
        autodeskId,
        email,
        name,
        status,
        companyName,
        phone,
        addedOn,
        lastSignIn,
        projectAdmin,
        executive,
        products,
        syncedAt: now,
      },
      update: {
        email,
        name,
        status,
        companyName,
        phone,
        addedOn,
        lastSignIn,
        projectAdmin,
        executive,
        products,
        syncedAt: now,
      },
    });

    // Link member to each named role on the project.
    const rawRoles = Array.isArray(raw.roles) ? raw.roles : [];
    for (const r of rawRoles) {
      if (!r || typeof r !== "object" || !r.name) continue;
      const resolved = roleNameToId.get(r.name.toLowerCase());
      if (!resolved) {
        console.warn(
          `[quick-sync] project ${project.id}: unresolved role name "${r.name}" on member ${email}`,
        );
        continue;
      }
      await prisma.accProjectRole.upsert({
        where: {
          projectId_roleId_memberId: {
            projectId: project.id,
            roleId: resolved.id,
            memberId: saved.id,
          },
        },
        create: {
          projectId: project.id,
          roleId: resolved.id,
          memberId: saved.id,
          docsAccessLevel: resolved.docsAccessLevel,
          projectAdminAccessLevel: resolved.projectAdminAccessLevel,
        },
        update: {
          docsAccessLevel: resolved.docsAccessLevel,
          projectAdminAccessLevel: resolved.projectAdminAccessLevel,
        },
      });
    }

    // Aggregator append (plan 02-04 consumer contract).
    let entry = aggregator.get(email);
    if (!entry) {
      entry = { email, autodeskId, name, perProject: [] };
      aggregator.set(email, entry);
    }
    entry.perProject.push({
      projectId: project.id,
      projectName: project.name,
      status,
      projectAdmin,
      executive,
      products,
      roleNames: rawRoles.map((r) => r.name),
      addedOn: addedOn ? addedOn.toISOString() : null,
      lastSignIn: lastSignIn ? lastSignIn.toISOString() : null,
      companyName,
      phone,
    });
  }

  console.log(
    `[quick-sync] project ${project.id} (${project.name}): ${members.length} members, ${projectRoles.length} roles`,
  );
}

/**
 * Fan out `extractAndPersistProjectData` across `projects` at `pLimit(5)`.
 *
 * Skip-and-continue: a failure in one project is caught + logged + recorded in
 * `failures` so the run continues. Matches v1.0 bulkAccSync pattern
 * (RESEARCH Decision 1).
 */
export async function runPerProjectFanOut(
  prisma: PrismaClient,
  accountId: string,
  projects: Array<{ id: string; name: string }>,
  accessToken: string,
): Promise<{
  aggregator: MemberAggregator;
  failCount: number;
  failures: Array<{ projectId: string; error: string }>;
}> {
  const aggregator: MemberAggregator = new Map();
  const failures: Array<{ projectId: string; error: string }> = [];
  const limit = pLimit(5);

  await Promise.all(
    projects.map((p) =>
      limit(async () => {
        try {
          await extractAndPersistProjectData(
            prisma,
            accountId,
            p,
            accessToken,
            aggregator,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[quick-sync] project ${p.id} failed:`, msg);
          failures.push({ projectId: p.id, error: msg });
        }
      }),
    ),
  );

  return { aggregator, failCount: failures.length, failures };
}

// ---------------------------------------------------------------------------
// Cache writer (MEM-06) — plan 02-04
// ---------------------------------------------------------------------------
//
// v2.0 cache shape degradation: companyRole and isAccountAdmin require HQ v1
// user enrichment which the v2.0 project-centric extraction skips. Writes
// `null` and `false` respectively until a follow-up phase reintroduces HQ v1
// prefetch. Existing UI already treats `null` companyRole as "Unspecified".
// runQuickSync emits a one-time runtime warning when invoked (see Task 2).

/**
 * Build a single `BulkAccUser` cache blob from one aggregator entry.
 *
 * The return type annotation is load-bearing: any drift from the canonical
 * shape in `lib/acc/acc-types.ts` is a compile error. This is the structural
 * safety net for Pitfall 2 — the silent-zero-nodes failure mode that breaks
 * `buildAccGraphSnapshot` if the JSON shape drifts.
 *
 * Per-field decisions (v2.0):
 *   - `status: "active"` for every project — the aggregator only contains
 *     projects that survived the soft-delete pass in `extractAndPersistProjects`.
 *   - `companyRole: null` — HQ v1 enrichment deferred (see warning above).
 *   - `isAccountAdmin: false` — same reason.
 *   - `lastSignIn` = max ISO across `perProject.lastSignIn` (most recent).
 *   - `addedOn` = min ISO across `perProject.addedOn` (earliest).
 *   - `found: true` — any synced user is by definition found.
 */
export function buildCacheBlob(
  entry: MemberAggregatorEntry,
  syncedAt: Date,
): BulkAccUser {
  const projects: BulkAccProject[] = entry.perProject.map((pp) => ({
    id: pp.projectId,
    name: pp.projectName,
    status: "active",
    isAdmin: pp.projectAdmin,
    roles: pp.roleNames,
    modules: Object.entries(pp.products)
      .filter(([, tier]) => tier !== "none")
      .map(([key]) => key),
  }));

  const projectCount = projects.length;
  const activeCount = projects.filter((p) => p.status === "active").length;
  const adminCount = projects.filter((p) => p.isAdmin).length;
  const hasNoProjects = projects.length === 0;
  const allRoles = Array.from(new Set(projects.flatMap((p) => p.roles)));
  const allModules = Array.from(new Set(projects.flatMap((p) => p.modules)));

  const lastSignInIsoList = entry.perProject
    .map((pp) => pp.lastSignIn)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort()
    .reverse();
  const lastSignIn = lastSignInIsoList[0] ?? null;

  const addedOnIsoList = entry.perProject
    .map((pp) => pp.addedOn)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort();
  const addedOn = addedOnIsoList[0] ?? null;

  return {
    email: entry.email,
    name: entry.name,
    found: true,
    projectCount,
    activeCount,
    adminCount,
    hasNoProjects,
    syncedAt: syncedAt.toISOString(),
    allRoles,
    allModules,
    projects,
    companyRole: null,
    lastSignIn,
    isAccountAdmin: false,
    addedOn,
  };
}

/**
 * Walk the aggregator and upsert one `AccMemberCache` row per email.
 *
 * Crucially does NOT delete rows for emails not in the aggregator: if Phase 2
 * fails partway, stale cache rows are tolerable (the v1.0 dashboard keeps
 * rendering yesterday's data), but missing rows would zero out the graph.
 */
export async function writeMemberCacheFromAggregator(
  prisma: PrismaClient,
  aggregator: MemberAggregator,
  syncedAt: Date,
): Promise<{ writtenCount: number }> {
  let writtenCount = 0;
  for (const [email, entry] of aggregator) {
    const blob = buildCacheBlob(entry, syncedAt);
    const data = blob as unknown as Prisma.JsonObject;
    await prisma.accMemberCache.upsert({
      where: { email },
      create: { email, data, syncedAt },
      update: { data, syncedAt },
    });
    writtenCount++;
  }
  console.log(`[quick-sync] accMemberCache: ${writtenCount} users upserted`);
  return { writtenCount };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator + CLI entry (plan 02-04, Task 2)
// ---------------------------------------------------------------------------

/**
 * Phase 2 Quick Sync top-level orchestrator. Sequences:
 *   1. extractAndPersistProjects     (PROJ-01..03)
 *   2. extractAndPersistHubRoles     (ROLE-01)
 *   3. runPerProjectFanOut           (MEM-01..05, ROLE-02, ROLE-03 — pLimit(5))
 *   4. writeMemberCacheFromAggregator (MEM-06)
 *
 * Returns counters for the caller (release.cjs) to log; throws on fatal errors.
 * Per-project failures inside step 3 are swallowed by skip-and-continue and
 * surface in `failures`/`failCount` rather than throwing.
 */
export async function runQuickSync(
  prisma: PrismaClient,
): Promise<{
  projectCount: number;
  memberCount: number;
  failCount: number;
  failures: Array<{ projectId: string; error: string }>;
}> {
  const startedAt = new Date();
  console.log(`[quick-sync] starting at ${startedAt.toISOString()}`);
  console.warn(
    "[quick-sync] v2.0 cache shape: companyRole=null and isAccountAdmin=false for all users (HQ v1 prefetch deferred).",
  );

  const accountId = await getAccountId(prisma);
  const accessToken = await get2LeggedAutodeskToken();

  const projects = await extractAndPersistProjects(prisma, accountId, accessToken);
  await extractAndPersistHubRoles(prisma, accountId, accessToken);

  // `extractAndPersistProjects` already returns only the fresh / active set;
  // soft-deleted projects are excluded from the response.
  const activeProjects = projects;
  const { aggregator, failCount, failures } = await runPerProjectFanOut(
    prisma,
    accountId,
    activeProjects,
    accessToken,
  );

  await writeMemberCacheFromAggregator(prisma, aggregator, new Date());

  const durationMs = Date.now() - startedAt.getTime();
  console.log(
    `[quick-sync] complete in ${(durationMs / 1000).toFixed(1)}s — ` +
      `${activeProjects.length} projects, ${aggregator.size} users, ${failCount} project failures`,
  );

  return {
    projectCount: activeProjects.length,
    memberCount: aggregator.size,
    failCount,
    failures,
  };
}

// CLI entry: `npx tsx lib/acc/quick-sync-extraction.ts` — invoked by scripts/release.cjs.
// Per RESEARCH.md Decision 2: per-project failures DO NOT fail the run; only a
// fatal exception (auth, accountId resolution, db connection) exits non-zero.
if (require.main === module) {
  (async () => {
    // Use the project's shared Prisma singleton — Prisma 7 requires a driver adapter
    // (PrismaPg), and server/db.ts already wires that up plus pooled/direct URL selection.
    const { db } = await import("@/server/db");
    try {
      await runQuickSync(db);
      process.exit(0);
    } catch (err) {
      console.error("[quick-sync] fatal:", err instanceof Error ? err.message : err);
      if (err instanceof Error && err.stack) console.error(err.stack);
      process.exit(1);
    } finally {
      await db.$disconnect().catch(() => {});
    }
  })();
}
