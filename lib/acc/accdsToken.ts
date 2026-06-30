import { readFile } from 'node:fs/promises';

const REFRESH_URL = 'https://login.acc.autodesk.com/api/v1/authentication/refresh';
const ACC_HOME = 'https://acc.autodesk.com/';

/** Thrown when the persisted ACC session is no longer valid — re-run scripts/accds-login.cjs. */
export class SessionExpiredError extends Error {
  constructor(message = 'ACC session expired — re-run scripts/accds-login.cjs') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

interface StorageCookie { name: string; value: string; domain: string; expires?: number }
export interface StorageState { cookies: StorageCookie[] }
export interface FreshToken { accessToken: string; expSec: number }

/** Build a `Cookie:` header from a Playwright storageState, keeping only autodesk.com cookies. */
export function cookieHeaderFromStorageState(state: StorageState): string {
  const byName = new Map<string, string>();
  for (const c of state.cookies ?? []) {
    if (!c.domain.includes('autodesk.com')) continue;
    byName.set(c.name, c.value); // later entries win
  }
  return [...byName.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
}

export async function loadCookieHeader(sessionPath: string): Promise<string> {
  const state = JSON.parse(await readFile(sessionPath, 'utf8')) as StorageState;
  if (!state.cookies?.length) throw new SessionExpiredError('No cookies in session file');
  const header = cookieHeaderFromStorageState(state);
  if (!header) throw new SessionExpiredError('No autodesk.com cookies in session file');
  return header;
}

function decodeExpSec(jwt: string): number {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString());
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export async function fetchFreshToken(
  cookieHeader: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FreshToken> {
  const url = `${REFRESH_URL}?currentUrl=${encodeURIComponent(ACC_HOME)}`;
  const res = await fetchImpl(url, {
    headers: {
      cookie: cookieHeader,
      accept: 'application/json',
      origin: 'https://acc.autodesk.com',
      referer: ACC_HOME,
    },
    redirect: 'manual',
  });
  // 401/403 = unauthorized; 3xx (redirect:'manual') = ACC login redirect = session expired.
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    throw new SessionExpiredError();
  }
  if (!res.ok) throw new Error(`accds token refresh failed (${res.status})`);
  const json = (await res.json()) as { accessToken?: string };
  if (!json.accessToken) throw new SessionExpiredError('refresh returned no accessToken');
  return { accessToken: json.accessToken, expSec: decodeExpSec(json.accessToken) };
}

export interface TokenProviderOpts {
  fetchImpl?: typeof fetch;
  nowSec?: () => number;
}

/** Returns getToken(): fresh bearer token, cached until ~60s before expiry. */
export function createTokenProvider(
  cookieHeader: string,
  opts: TokenProviderOpts = {},
): () => Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000));
  let cache: FreshToken | null = null;
  let inflight: Promise<FreshToken> | null = null;
  return async function getToken(): Promise<string> {
    if (cache && cache.expSec - nowSec() > 60) return cache.accessToken;
    // Collapse concurrent refreshes into a single in-flight request so high
    // page/project concurrency can't fire a stampede of refresh calls (which
    // could itself be rate-limited and falsely trip SessionExpiredError).
    if (!inflight) {
      inflight = fetchFreshToken(cookieHeader, fetchImpl)
        .then((t) => { cache = t; inflight = null; return t; })
        .catch((e) => { inflight = null; throw e; });
    }
    return (await inflight).accessToken;
  };
}

// ---------------------------------------------------------------------------
// Session-health helper (OBS-01) — local file read, no Autodesk network call
// ---------------------------------------------------------------------------

/** Warning threshold in hours: emit a WARN when session expires in < 12h. */
export const SESSION_WARN_HOURS = 12;

export type SessionHealthState = 'healthy' | 'expiring' | 'expired' | 'missing' | 'unknown';

export interface SessionHealth {
  /** Overall health state of the ACCDS web session. */
  state: SessionHealthState;
  /** ISO 8601 timestamp of the computed session expiry (null when state is missing/unknown). */
  expiresAt: string | null;
  /** Hours until expiry, rounded (null when state is missing/unknown or expired). */
  hoursRemaining: number | null;
  /**
   * True when the expiry is a best-effort estimate.
   * The implementation uses the MAX positive `expires` among autodesk.com cookies
   * as the outer bound; the exact durable auth cookie is not pinpointed.
   * VERIFY: In the real scratch/acc-session.json, `PF.PERSISTENT` on
   * .auth.autodesk.com (~550h) may be the accurate auth marker, but the MAX
   * approach with estimate=true is used per OBS-01 design to avoid hardcoding
   * a specific cookie name.
   */
  estimate: boolean;
  /** Number of autodesk.com domain cookies found in the session file. */
  cookieCount: number;
  /** Short, secret-free human-readable status line. */
  message: string;
}

/** Extended cookie shape that Playwright writes — includes optional expires (Unix seconds, -1 = session). */
interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  expires?: number;
}

/**
 * Read ACCDS session health from a Playwright storageState file without making any
 * Autodesk network calls. Cookie *values* are never included in the returned object.
 * Use getSessionHealth() as a startup preflight before kicking off a long crawl.
 */
export async function getSessionHealth(sessionPath: string): Promise<SessionHealth> {
  let raw: string;
  try {
    raw = await readFile(sessionPath, 'utf8');
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return {
        state: 'missing',
        expiresAt: null,
        hoursRemaining: null,
        estimate: false, // certain: the file is absent
        cookieCount: 0,
        message: 'Session file not found — run scripts/accds-login.cjs to create it.',
      };
    }
    throw err;
  }

  let parsed: { cookies?: SessionCookie[] };
  try {
    parsed = JSON.parse(raw) as { cookies?: SessionCookie[] };
  } catch {
    return {
      state: 'unknown',
      expiresAt: null,
      hoursRemaining: null,
      estimate: true,
      cookieCount: 0,
      message: 'Session file is not valid JSON — re-run scripts/accds-login.cjs.',
    };
  }

  // Keep only autodesk.com cookies, matching the domain filter in cookieHeaderFromStorageState.
  const authdeskCookies = (parsed.cookies ?? []).filter(
    (c) => c.domain?.includes('autodesk.com'),
  );
  const cookieCount = authdeskCookies.length;

  // Outer bound: MAX positive numeric `expires` (Unix seconds) among autodesk.com cookies.
  // Playwright sets expires=-1 for session cookies (no expiry).
  let maxExpiresSec = -1;
  for (const c of authdeskCookies) {
    const exp = c.expires;
    if (typeof exp === 'number' && exp > 0 && exp > maxExpiresSec) {
      maxExpiresSec = exp;
    }
  }

  if (maxExpiresSec < 0) {
    // All autodesk.com cookies are session cookies (expires=-1) or absent.
    return {
      state: 'unknown',
      expiresAt: null,
      hoursRemaining: null,
      estimate: true,
      cookieCount,
      message: 'Expiry not encoded in session file — run scripts/accds-login.cjs to be safe.',
    };
  }

  const expiresAtMs = maxExpiresSec * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const hoursRemaining = Math.round((expiresAtMs - Date.now()) / 3_600_000);

  let state: SessionHealthState;
  let message: string;
  if (hoursRemaining <= 0) {
    state = 'expired';
    message = 'Session has expired — run scripts/accds-login.cjs.';
  } else if (hoursRemaining < SESSION_WARN_HOURS) {
    state = 'expiring';
    message = `Session expires in ${hoursRemaining}h — re-run scripts/accds-login.cjs before a long crawl.`;
  } else {
    state = 'healthy';
    message = `Session healthy — expires in ${hoursRemaining}h.`;
  }

  return {
    state,
    expiresAt,
    hoursRemaining,
    estimate: true, // Best-effort outer bound (MAX positive expires); exact auth cookie not identified.
    cookieCount,
    message,
  };
}
