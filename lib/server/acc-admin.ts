import "server-only";

import { IntegrationError } from "@/lib/server/integration-errors";

export const ACC_ADMIN_BASE =
  "https://developer.api.autodesk.com/construction/admin/v1";

// ---------------------------------------------------------------------------
// TypeScript types for ACC Admin API responses
// ---------------------------------------------------------------------------

export type AccUser = {
  autodeskId: string;
  email: string;
  name: string;
  status: string; // "active" | "inactive" | "pending"
};

export type AccRole = {
  id: string;
  name: string;
  roleGroupId?: string;
};

export type AccProject = {
  id: string;
  name: string;
  status: string;
  roles: AccRole[]; // already filtered — no "(Removed)" entries
};

export type AccProduct = {
  id: string;
  name: string;
  status: string; // "active" | "inactive"
  projectIds: string[];
};

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

function getString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fetchApsJson(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Record<string, any>> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal,
  });

  const raw = await response.text();
  let payload: Record<string, any> = {};

  try {
    payload = raw ? (JSON.parse(raw) as Record<string, any>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorText =
      getString(payload.developerMessage) ||
      getString(payload.error_description) ||
      getString(payload.error) ||
      raw ||
      `${response.status} ${response.statusText}`;

    if (response.status === 401) {
      throw new IntegrationError(
        "Autodesk connection expired. Reconnect Autodesk and try again.",
        response.status,
        "reconnect_required",
        "Autodesk",
        { url, error: errorText }
      );
    }

    if (response.status === 403) {
      throw new IntegrationError(
        "Account Admin privileges required. Ensure your Autodesk account is an Account Admin in the hub.",
        response.status,
        "forbidden",
        "Autodesk",
        { url, error: errorText }
      );
    }

    throw new IntegrationError(
      `APS request failed: ${errorText}`,
      response.status,
      "unavailable",
      "Autodesk",
      { url, error: errorText }
    );
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Public API wrappers
// ---------------------------------------------------------------------------

/**
 * Fetch an ACC user record by email address.
 *
 * @param accountId - bare UUID (no "b." prefix) — caller must strip it
 * @param email     - user email to look up
 * @param accessToken - valid APS access token
 * @returns AccUser if found, null if the search returned no results
 */
export async function fetchAccUserByEmail(
  accountId: string,
  email: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccUser | null> {
  const url = `${ACC_ADMIN_BASE}/accounts/${accountId}/users?email=${encodeURIComponent(email)}&limit=20`;
  const payload = await fetchApsJson(url, accessToken, signal);
  const results: AccUser[] = payload.results ?? [];
  return results.length > 0 ? results[0] : null;
}

/**
 * Fetch all projects the ACC user is a member of, with (Removed) roles filtered out.
 *
 * @param accountId      - bare UUID (no "b." prefix) — caller must strip it
 * @param autodeskUserId - the user's Autodesk ID (autodeskId from AccUser)
 * @param accessToken    - valid APS access token
 * @returns AccProject[] with roles already filtered
 */
export async function fetchAccUserProjects(
  accountId: string,
  autodeskUserId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccProject[]> {
  const baseUrl = `${ACC_ADMIN_BASE}/accounts/${accountId}/users/${autodeskUserId}/projects`;
  const allResults: AccProject[] = [];
  let offset = 0;

  do {
    const payload = await fetchApsJson(
      `${baseUrl}?limit=200&offset=${offset}`,
      accessToken,
      signal
    );

    const page: AccProject[] = (payload.results ?? []).map(
      (p: Record<string, any>) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        roles: ((p.roles ?? []) as AccRole[]).filter(
          (r) => !r.name.includes("(Removed)")
        ),
      })
    );

    allResults.push(...page);

    const total: number = payload.pagination?.totalResults ?? 0;
    const limit: number = payload.pagination?.limit ?? 200;
    offset += limit;

    if (offset >= total || (payload.results ?? []).length === 0) break;
  } while (true);

  return allResults;
}

/**
 * Fetch all products assigned to the ACC user.
 *
 * @param accountId      - bare UUID (no "b." prefix) — caller must strip it
 * @param autodeskUserId - the user's Autodesk ID (autodeskId from AccUser)
 * @param accessToken    - valid APS access token
 * @returns AccProduct[] — all products regardless of status (UI displays status)
 */
export async function fetchAccUserProducts(
  accountId: string,
  autodeskUserId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccProduct[]> {
  const baseUrl = `${ACC_ADMIN_BASE}/accounts/${accountId}/users/${autodeskUserId}/products`;
  const allResults: AccProduct[] = [];
  let offset = 0;

  do {
    const payload = await fetchApsJson(
      `${baseUrl}?limit=100&offset=${offset}`,
      accessToken,
      signal
    );

    const page: AccProduct[] = (payload.results ?? []).map(
      (p: Record<string, any>) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        projectIds: p.projectIds ?? [],
      })
    );

    allResults.push(...page);

    const total: number = payload.pagination?.totalResults ?? 0;
    const limit: number = payload.pagination?.limit ?? 100;
    offset += limit;

    if (offset >= total || (payload.results ?? []).length === 0) break;
  } while (true);

  return allResults;
}
