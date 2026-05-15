/**
 * dcProjectDiscovery — Phase 8 plan 08-09 (DC8-GAP-01 closure).
 *
 * Pure I/O-injected module: discovers ACC projects where the configured user
 * has actual Project Admin access by calling APS Admin v1:
 *   GET /construction/admin/v1/accounts/{accountId}/users/{userId}/projects
 *
 * PITFALL: The server-side `filter[accessLevel]=projectAdmin` query param is
 * misleading — it returns projects where the user has projectAdmin OR
 * projectMember access. We MUST filter locally on
 * `accessLevels.projectAdmin === true`.
 *
 * Ported faithfully from `scripts/dc-ingest-where-i-admin.cjs:128-147` with
 * these additions:
 *   - Injectable `fetchImpl` for unit testing (no real APS calls in tests).
 *   - Injectable `adminBase` and `pageLimit` for flexibility.
 *   - Defensive infinite-loop guard: terminate early when results.length === 0.
 *   - `get2LegToken` helper for 2-leg client_credentials token.
 *
 * Requirements: DC8-07, DC8-08, DC8-13.
 */

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface AdminProject {
  id: string;
  name: string;
  status: string;          // 'active' | 'archived' | etc.
  createdAt: string;       // ISO string from API; orchestrator parses to Date
  accessLevels: { projectAdmin: boolean; [k: string]: boolean };
}

export interface DiscoverOptions {
  accountId: string;       // APS hub/account id (no "b." prefix)
  userId: string;          // LUIS_ACC_USER_ID (env var)
  token2Leg: string;       // pre-fetched 2-leg bearer token
  fetchImpl?: typeof fetch; // injectable for tests; defaults to globalThis.fetch
  adminBase?: string;       // defaults to APS Admin v1 base URL
  pageLimit?: number;       // defaults to 200
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_V1_BASE =
  'https://developer.api.autodesk.com/construction/admin/v1';

const APS_TOKEN_URL =
  'https://developer.api.autodesk.com/authentication/v2/token';

// ---------------------------------------------------------------------------
// discoverAdminProjects
// ---------------------------------------------------------------------------

/**
 * Returns the subset of ACC projects under `accountId` where `userId` has
 * `accessLevels.projectAdmin === true`.  Handles pagination automatically.
 *
 * PITFALL: Server filter `filter[accessLevel]=projectAdmin` returns
 * member-or-admin; local filter here is the authoritative gate.
 */
export async function discoverAdminProjects(
  opts: DiscoverOptions,
): Promise<AdminProject[]> {
  const {
    accountId,
    userId,
    token2Leg,
    fetchImpl = globalThis.fetch,
    adminBase = ADMIN_V1_BASE,
    pageLimit = 200,
  } = opts;

  const all: AdminProject[] = [];
  let offset = 0;

  while (true) {
    const url = `${adminBase}/accounts/${accountId}/users/${userId}/projects?limit=${pageLimit}&offset=${offset}`;
    const r = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token2Leg}` },
    });
    const data = (await r.json()) as {
      results?: AdminProject[];
      pagination?: { limit?: number; totalResults?: number };
    };

    if (!data.results) {
      throw new Error(
        `Admin v1 user-projects failed: ${r.status} ${JSON.stringify(data).slice(0, 200)}`,
      );
    }

    // Defensive infinite-loop guard: stop if page returns 0 results.
    if (data.results.length === 0) {
      break;
    }

    all.push(...data.results);

    const total = data.pagination?.totalResults ?? 0;
    offset += data.pagination?.limit ?? pageLimit;

    // Normal termination: offset reached or exceeded total.
    if (offset >= total) {
      break;
    }
  }

  // PITFALL: Server filter is misleading — filter locally.
  const actuallyAdmin = all.filter(
    (p) => p?.accessLevels?.projectAdmin === true,
  );

  // eslint-disable-next-line no-console
  console.log(
    `[dcProjectDiscovery] Listed ${all.length} projects (member-or-admin); ${actuallyAdmin.length} with actual projectAdmin=true.`,
  );

  return actuallyAdmin;
}

// ---------------------------------------------------------------------------
// get2LegToken — client_credentials helper
// ---------------------------------------------------------------------------

/**
 * Fetches a fresh 2-leg (client_credentials) APS bearer token.
 * Scope: `account:read data:read` — the minimum required for Admin v1 discovery.
 *
 * Ported from `scripts/dc-ingest-where-i-admin.cjs:107-122`.
 */
export async function get2LegToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'account:read data:read',
  });

  const res = await fetchImpl(APS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body as unknown as BodyInit,
  });

  const json = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      `[get2LegToken] 2-leg token failed (${res.status}): ${
        json.error_description ?? json.error ?? JSON.stringify(json).slice(0, 200)
      }`,
    );
  }

  return json.access_token;
}
