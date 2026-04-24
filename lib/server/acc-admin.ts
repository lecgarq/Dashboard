import "server-only";

import { IntegrationError } from "@/lib/server/integration-errors";

// HQ v1: user lookup (search by email via pagination)
const HQ_ADMIN_BASE = "https://developer.api.autodesk.com/hq/v1";
// ACC Admin v1: projects + products per user
const ACC_ADMIN_V1_BASE = "https://developer.api.autodesk.com/construction/admin/v1";

export type AccUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  company?: string;
  addedOn?: string;
};

export type AccProject = {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
};

function getString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Retry on 429 (quota/rate limit) with either the server-provided Retry-After or
// exponential backoff. Up to 4 attempts. Everything else returns the first response.
async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxAttempts - 1) return res;
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? Math.min(60_000, retryAfterSec * 1000)
      : Math.min(30_000, 1000 * Math.pow(2, attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
}

function throwApsError(response: Response, raw: string): never {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }

  const errorText =
    getString(payload.developerMessage) ||
    getString(payload.detail) ||
    raw ||
    `${response.status} ${response.statusText}`;

  if (response.status === 401) {
    throw new IntegrationError(
      "Autodesk connection expired. Reconnect Autodesk and try again.",
      response.status, "reconnect_required", "Autodesk", { error: errorText }
    );
  }
  if (response.status === 403) {
    throw new IntegrationError(
      "Account Admin privileges required. Ensure the APS app is provisioned in your ACC account.",
      response.status, "forbidden", "Autodesk", { error: errorText }
    );
  }
  throw new IntegrationError(
    `APS request failed: ${errorText}`,
    response.status, "unavailable", "Autodesk", { error: errorText }
  );
}

// Fetches a paginated ACC Admin v1 endpoint → { pagination, results }
async function fetchAccPaged(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<{ pagination: { totalResults: number; limit: number }; results: Record<string, unknown>[] }> {
  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal,
  });
  const raw = await response.text();
  if (!response.ok) throwApsError(response, raw);
  return JSON.parse(raw) as { pagination: { totalResults: number; limit: number }; results: Record<string, unknown>[] };
}

// Fetches a HQ v1 user list endpoint → plain array
async function fetchHqUsers(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  const response = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal,
  });
  const raw = await response.text();
  if (!response.ok) throwApsError(response, raw);
  try {
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find an ACC/BIM360 user by email address.
 * HQ v1 has no server-side email filter — we paginate and match client-side.
 */
export async function fetchAccUserByEmail(
  accountId: string,
  email: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccUser | null> {
  const baseUrl = `${HQ_ADMIN_BASE}/accounts/${accountId}/users`;
  const limit = 100;
  let offset = 0;
  const maxUsers = 5000;

  while (offset < maxUsers) {
    const users = await fetchHqUsers(
      `${baseUrl}?limit=${limit}&offset=${offset}`,
      accessToken,
      signal
    );

    const match = users.find((u) => u.email === email);
    if (match) {
      return {
        id: getString(match.id),
        email: getString(match.email),
        name: getString(match.name),
        status: getString(match.status),
        role: getString(match.role) || getString(match.access_level) || "user",
        company: getString(match.company_name || match.company) || undefined,
        addedOn: getString(match.created_at || match.addedOn) || undefined,
      };
    }

    if (users.length < limit) return null;
    offset += limit;
  }

  return null;
}

/**
 * Fetch all users in an ACC account in one paginated sweep.
 * Use this before bulk-matching many emails — avoids the N+1 pattern where each
 * fetchAccUserByEmail call paginates the full user list independently.
 */
export async function fetchAllAccUsers(
  accountId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccUser[]> {
  const baseUrl = `${HQ_ADMIN_BASE}/accounts/${accountId}/users`;
  const limit = 100;
  const maxUsers = 10000;
  const all: AccUser[] = [];
  let offset = 0;

  while (offset < maxUsers) {
    const users = await fetchHqUsers(`${baseUrl}?limit=${limit}&offset=${offset}`, accessToken, signal);
    for (const u of users) {
      all.push({
        id: getString(u.id),
        email: getString(u.email),
        name: getString(u.name),
        status: getString(u.status),
        role: getString(u.role) || getString(u.access_level) || "user",
        company: getString(u.company_name || u.company) || undefined,
        addedOn: getString(u.created_at || u.addedOn) || undefined,
      });
    }
    if (users.length < limit) break;
    offset += limit;
  }

  return all;
}

/**
 * Fetch all projects the user is a member of.
 * Returns base project list with empty modules[] — caller enriches via fetchAccProjectUserDetail.
 */
export async function fetchAccUserProjects(
  accountId: string,
  userId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccProject[]> {
  const baseUrl = `${ACC_ADMIN_V1_BASE}/accounts/${accountId}/users/${userId}/projects`;
  const allResults: AccProject[] = [];
  let offset = 0;

  do {
    const { pagination, results } = await fetchAccPaged(
      `${baseUrl}?limit=200&offset=${offset}`,
      accessToken,
      signal
    );

    for (const p of results) {
      const levels = p.accessLevels as { projectAdmin?: boolean } | undefined;
      const rawRoles = Array.isArray(p.roles) ? p.roles : [];
      const roles = rawRoles.map((r) =>
        typeof r === "string" ? r : getString((r as Record<string, unknown>).name)
      ).filter(Boolean);
      allResults.push({
        id: getString(p.id),
        name: getString(p.name),
        status: getString(p.status),
        isAdmin: levels?.projectAdmin === true,
        roles,
        modules: [],
      });
    }

    const total = pagination?.totalResults ?? 0;
    const limit = pagination?.limit ?? 200;
    offset += limit;
    if (offset >= total || results.length === 0) break;
  } while (true);

  return allResults;
}

/**
 * Fetch all roles assigned to a user across all their projects.
 * Uses the documented endpoint: GET /accounts/{accountId}/users/{userId}/roles
 * Returns a map of projectId → role names[].
 */
export async function fetchAccUserRoles(
  accountId: string,
  userId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Map<string, string[]>> {
  const baseUrl = `${ACC_ADMIN_V1_BASE}/accounts/${accountId}/users/${userId}/roles`;
  const rolesByProject = new Map<string, string[]>();
  let offset = 0;

  do {
    const { pagination, results } = await fetchAccPaged(
      `${baseUrl}?limit=200&offset=${offset}&filter[status]=active`,
      accessToken,
      signal
    );

    for (const r of results) {
      const name = getString(r.name);
      const projectIds = Array.isArray(r.projectIds) ? (r.projectIds as string[]) : [];
      for (const pid of projectIds) {
        const existing = rolesByProject.get(pid) ?? [];
        if (name) existing.push(name);
        rolesByProject.set(pid, existing);
      }
    }

    const total = pagination?.totalResults ?? 0;
    const limit = pagination?.limit ?? 200;
    offset += limit;
    if (offset >= total || results.length === 0) break;
  } while (true);

  return rolesByProject;
}

/**
 * Fetch all products a user has access to across their projects.
 * Uses the documented endpoint: GET /accounts/{accountId}/users/{userId}/products
 * Returns a map of projectId → product keys[] (e.g. ["documentManagement", "build"]).
 */
export async function fetchAccUserProducts(
  accountId: string,
  userId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Map<string, string[]>> {
  const baseUrl = `${ACC_ADMIN_V1_BASE}/accounts/${accountId}/users/${userId}/products`;
  const productsByProject = new Map<string, string[]>();
  let offset = 0;

  do {
    const { pagination, results } = await fetchAccPaged(
      `${baseUrl}?limit=200&offset=${offset}`,
      accessToken,
      signal
    );

    for (const r of results) {
      const key = getString(r.key);
      const projectIds = Array.isArray(r.projectIds) ? (r.projectIds as string[]) : [];
      for (const pid of projectIds) {
        const existing = productsByProject.get(pid) ?? [];
        if (key) existing.push(key);
        productsByProject.set(pid, existing);
      }
    }

    const total = pagination?.totalResults ?? 0;
    const limit = pagination?.limit ?? 200;
    offset += limit;
    if (offset >= total || results.length === 0) break;
  } while (true);

  return productsByProject;
}

export type AccHubRole = {
  id: string;
  name: string;
  memberCount: number;
};

/**
 * Fetch all role definitions in the ACC hub account.
 * Uses HQ v1: GET /accounts/{accountId}/roles
 * Returns every role defined in the hub, whether or not any users have it.
 */
export async function fetchAccHubRoles(
  accountId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccHubRole[]> {
  const url = `${HQ_ADMIN_BASE}/accounts/${accountId}/roles`;
  const items = await fetchHqUsers(url, accessToken, signal);
  return items.map((r) => ({
    id: getString(r.id),
    name: getString(r.name),
    memberCount: typeof r.member_count === "number" ? r.member_count : 0,
  })).filter((r) => r.id && r.name);
}
