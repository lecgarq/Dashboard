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

interface StorageCookie { name: string; value: string; domain: string }
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
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
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
  return async function getToken(): Promise<string> {
    if (cache && cache.expSec - nowSec() > 60) return cache.accessToken;
    cache = await fetchFreshToken(cookieHeader, fetchImpl);
    return cache.accessToken;
  };
}
